import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Email, EmailDocument } from '../schemas/email.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import {
  WorkflowEnrollment,
  WorkflowEnrollmentDocument,
} from '../schemas/workflow-enrollment.schema';
import {
  WorkflowExecution,
  WorkflowExecutionDocument,
} from '../schemas/workflow-execution.schema';
import {
  WorkflowDelayedJob,
  WorkflowDelayedJobDocument,
} from '../schemas/workflow-delayed-job.schema';
import {
  WorkflowGoalHit,
  WorkflowGoalHitDocument,
} from '../schemas/workflow-goal-hit.schema';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
} from '../schemas/whatsapp-message.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  CONTACT_MERGE_SCALAR,
  DUPLICATE_FUZZY_MIN_SIMILARITY,
  DUPLICATE_FUZZY_ORG_BUCKET_MAX,
  DUPLICATE_SCAN_LIMIT,
  LEAD_MERGE_SCALAR,
  allEmailKeys,
  emailKey,
  isEmptyScalar,
  linkedInKey,
  mergePersonEmailFields,
  mergePersonScalarFields,
  nameSimilarity,
  normalizeOrgName,
  phoneKeys,
  toDuplicateSummary,
  unionObjectIdStrings,
  unionStringArrays,
} from '../shared/crm-duplicate.util';

export type DuplicateGroupDto = {
  rule:
    | 'exact_email'
    | 'exact_phone'
    | 'linkedin_profile'
    | 'fuzzy_name_same_company';
  score: number;
  suggestedMasterId: string;
  records: ReturnType<typeof toDuplicateSummary>[];
};

type ScanRow = Parameters<typeof toDuplicateSummary>[0] & {
  additionalEmails?: string[];
};

@Injectable()
export class DuplicatesService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private readonly dealModel: Model<DealDocument>,
    @InjectModel(Email.name, 'crmConnection')
    private readonly emailModel: Model<EmailDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private readonly emailTrackingModel: Model<EmailTrackingDocument>,
    @InjectModel(WorkflowEnrollment.name, 'crmConnection')
    private readonly workflowEnrollmentModel: Model<WorkflowEnrollmentDocument>,
    @InjectModel(WorkflowExecution.name, 'crmConnection')
    private readonly workflowExecutionModel: Model<WorkflowExecutionDocument>,
    @InjectModel(WorkflowDelayedJob.name, 'crmConnection')
    private readonly workflowDelayedJobModel: Model<WorkflowDelayedJobDocument>,
    @InjectModel(WorkflowGoalHit.name, 'crmConnection')
    private readonly workflowGoalHitModel: Model<WorkflowGoalHitDocument>,
    @InjectModel(WhatsAppMessage.name, 'crmConnection')
    private readonly whatsAppMessageModel: Model<WhatsAppMessageDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  getMergeRules() {
    return {
      rules: [
        {
          id: 'exact_email',
          label: 'Exact email',
          description:
            'Same normalized email on primary or additionalEmails across open leads (or contacts). Highest confidence.',
        },
        {
          id: 'exact_phone',
          label: 'Exact phone',
          description:
            'Same normalized mobile or phone digits (7+ digits) across records without a stronger shared email match.',
        },
        {
          id: 'linkedin_profile',
          label: 'LinkedIn profile',
          description: 'Same normalized LinkedIn /in/ profile URL.',
        },
        {
          id: 'fuzzy_name_same_company',
          label: 'Fuzzy name + same company',
          description:
            'Similar full name (≥88% character similarity) and same company text; skipped if both have different non-empty emails.',
        },
      ],
      limits: {
        maxLeadsScanned: DUPLICATE_SCAN_LIMIT,
        maxContactsScanned: DUPLICATE_SCAN_LIMIT,
        fuzzyOrgBucketMax: DUPLICATE_FUZZY_ORG_BUCKET_MAX,
        fuzzyMinSimilarity: DUPLICATE_FUZZY_MIN_SIMILARITY,
      },
    };
  }

  async scanLeads(): Promise<{
    groups: DuplicateGroupDto[];
    scanned: number;
    truncated: boolean;
  }> {
    return this.scanPeople(this.leadModel);
  }

  async scanContacts(): Promise<{
    groups: DuplicateGroupDto[];
    scanned: number;
    truncated: boolean;
  }> {
    return this.scanPeople(this.contactModel);
  }

  private async scanPeople(
    model: Model<LeadDocument> | Model<ContactDocument>,
  ): Promise<{
    groups: DuplicateGroupDto[];
    scanned: number;
    truncated: boolean;
  }> {
    const limit = DUPLICATE_SCAN_LIMIT;
    const rows = await (model as Model<any>)
      .find({ converted: { $ne: true } })
      .select(
        'firstName lastName email additionalEmails phone mobileNo organization linkedinUrl converted createdAt updatedAt leadOwner',
      )
      .sort({ createdAt: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
    const truncated = rows.length > limit;
    const slice = (truncated ? rows.slice(0, limit) : rows) as ScanRow[];
    return {
      groups: this.buildPersonDuplicateGroups(slice),
      scanned: slice.length,
      truncated,
    };
  }

  private buildPersonDuplicateGroups(slice: ScanRow[]): DuplicateGroupDto[] {
    const groups: DuplicateGroupDto[] = [];
    const seenPair = new Set<string>();

    const addGroup = (
      rule: DuplicateGroupDto['rule'],
      score: number,
      records: ScanRow[],
    ) => {
      if (records.length < 2) return;
      const uniq = new Map<string, ScanRow>();
      for (const x of records) uniq.set(String(x._id), x);
      const list = [...uniq.values()];
      if (list.length < 2) return;
      const ids = list.map((x) => x._id as Types.ObjectId);
      const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)));
      const key = `${rule}:${sorted.join(',')}`;
      if (seenPair.has(key)) return;
      seenPair.add(key);
      const byCreated = [...list].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
      groups.push({
        rule,
        score,
        suggestedMasterId: String(byCreated[0]._id),
        records: list.map(toDuplicateSummary),
      });
    };

    const byEmail = new Map<string, ScanRow[]>();
    for (const r of slice) {
      for (const k of allEmailKeys(r)) {
        if (!byEmail.has(k)) byEmail.set(k, []);
        byEmail.get(k)!.push(r);
      }
    }
    for (const [, arr] of byEmail) {
      addGroup('exact_email', 100, arr);
    }

    const byPhone = new Map<string, ScanRow[]>();
    for (const r of slice) {
      for (const pk of phoneKeys(r)) {
        const arr = byPhone.get(pk) || [];
        arr.push(r);
        byPhone.set(pk, arr);
      }
    }
    for (const [, arr] of byPhone) {
      const uniq = new Map<string, ScanRow>();
      for (const x of arr) uniq.set(String(x._id), x);
      const list = [...uniq.values()];
      if (list.length < 2) continue;
      const primaryKeys = list.map((x) => emailKey(x.email)).filter(Boolean);
      if (
        primaryKeys.length === list.length &&
        new Set(primaryKeys).size === 1
      ) {
        continue;
      }
      const emailSets = list.map((x) => new Set(allEmailKeys(x)));
      const shared = emailSets.every((s) => s.size > 0)
        ? [...emailSets[0]].some((e) => emailSets.every((s) => s.has(e)))
        : false;
      if (shared) continue;
      addGroup('exact_phone', 92, list);
    }

    const byLi = new Map<string, ScanRow[]>();
    for (const r of slice) {
      const lk = linkedInKey(r);
      if (!lk) continue;
      if (!byLi.has(lk)) byLi.set(lk, []);
      byLi.get(lk)!.push(r);
    }
    for (const [, arr] of byLi) {
      addGroup('linkedin_profile', 98, arr);
    }

    const byOrg = new Map<string, ScanRow[]>();
    for (const r of slice) {
      const ok = normalizeOrgName(r.organization);
      if (!ok) continue;
      if (!byOrg.has(ok)) byOrg.set(ok, []);
      byOrg.get(ok)!.push(r);
    }
    const fuzzyMin = DUPLICATE_FUZZY_MIN_SIMILARITY;
    const bucketMax = DUPLICATE_FUZZY_ORG_BUCKET_MAX;
    for (const [, bucket] of byOrg) {
      if (bucket.length < 2 || bucket.length > bucketMax) continue;
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i];
          const b = bucket[j];
          const sim = nameSimilarity(
            a.firstName,
            a.lastName,
            b.firstName,
            b.lastName,
          );
          if (sim < fuzzyMin) continue;
          const emailsA = new Set(allEmailKeys(a));
          const emailsB = new Set(allEmailKeys(b));
          const conflict =
            emailsA.size > 0 &&
            emailsB.size > 0 &&
            ![...emailsA].some((e) => emailsB.has(e));
          if (conflict) continue;
          const pkey = [String(a._id), String(b._id)].sort().join('|');
          if (seenPair.has(`pair:${pkey}`)) continue;
          seenPair.add(`pair:${pkey}`);
          const pair = [a, b].sort(
            (x, y) =>
              new Date(x.createdAt || 0).getTime() -
              new Date(y.createdAt || 0).getTime(),
          );
          groups.push({
            rule: 'fuzzy_name_same_company',
            score: Math.round(70 + sim * 25),
            suggestedMasterId: String(pair[0]._id),
            records: pair.map(toDuplicateSummary),
          });
        }
      }
    }

    groups.sort(
      (a, b) => b.score - a.score || b.records.length - a.records.length,
    );
    return groups;
  }

  async mergeLeads(masterId: string, duplicateIds: string[], _user?: unknown) {
    if (!Types.ObjectId.isValid(masterId)) {
      throw new BadRequestException('Invalid master id');
    }
    const masterOid = new Types.ObjectId(masterId);
    const dupOids = duplicateIds
      .filter((id) => Types.ObjectId.isValid(id) && id !== masterId)
      .map((id) => new Types.ObjectId(id));
    if (dupOids.length === 0) {
      throw new BadRequestException('At least one duplicate id required');
    }

    const master = await this.leadModel.findById(masterOid).lean().exec();
    if (!master) throw new NotFoundException('Master lead not found');
    if (master.converted) {
      throw new BadRequestException('Cannot merge into a converted lead');
    }

    const dups = await this.leadModel
      .find({ _id: { $in: dupOids } })
      .lean()
      .exec();
    if (dups.length !== dupOids.length) {
      throw new BadRequestException('One or more duplicate leads not found');
    }
    for (const d of dups) {
      if (d.converted) {
        throw new BadRequestException(
          `Lead ${d._id} is converted — merge blocked`,
        );
      }
    }

    const mergedPatch = this.buildLeadMergePatch(
      master as unknown as Record<string, unknown>,
      dups as unknown as Record<string, unknown>[],
    );

    for (const dupOid of dupOids) {
      await this.rewireLeadReferences(dupOid, masterOid);
    }

    await this.leadModel.deleteMany({ _id: { $in: dupOids } });
    await this.leadModel.updateOne({ _id: masterOid }, { $set: mergedPatch });

    return {
      ok: true,
      masterId,
      removedIds: dupOids.map(String),
    };
  }

  async mergeContacts(masterId: string, duplicateIds: string[], _user?: unknown) {
    if (!Types.ObjectId.isValid(masterId)) {
      throw new BadRequestException('Invalid master id');
    }
    const masterOid = new Types.ObjectId(masterId);
    const dupOids = duplicateIds
      .filter((id) => Types.ObjectId.isValid(id) && id !== masterId)
      .map((id) => new Types.ObjectId(id));
    if (dupOids.length === 0) {
      throw new BadRequestException('At least one duplicate id required');
    }

    const master = await this.contactModel.findById(masterOid).lean().exec();
    if (!master) throw new NotFoundException('Master contact not found');
    if (master.converted) {
      throw new BadRequestException('Cannot merge into a converted contact');
    }

    const dups = await this.contactModel
      .find({ _id: { $in: dupOids } })
      .lean()
      .exec();
    if (dups.length !== dupOids.length) {
      throw new BadRequestException('One or more duplicate contacts not found');
    }
    for (const d of dups) {
      if (d.converted) {
        throw new BadRequestException(
          `Contact ${d._id} is converted — merge blocked`,
        );
      }
    }

    const mergedPatch = this.buildContactMergePatch(
      master as unknown as Record<string, unknown>,
      dups as unknown as Record<string, unknown>[],
    );

    for (const dupOid of dupOids) {
      await this.rewireContactReferences(dupOid, masterOid);
    }

    await this.contactModel.deleteMany({ _id: { $in: dupOids } });
    await this.contactModel.updateOne({ _id: masterOid }, { $set: mergedPatch });

    return {
      ok: true,
      masterId,
      removedIds: dupOids.map(String),
    };
  }

  private buildLeadMergePatch(
    master: Record<string, unknown>,
    dups: Record<string, unknown>[],
  ): Record<string, unknown> {
    let effective = { ...master };
    const patch: Record<string, unknown> = {};
    for (const dup of dups) {
      const s = mergePersonScalarFields(
        effective,
        dup,
        LEAD_MERGE_SCALAR as unknown as string[],
      );
      Object.assign(effective, s);
      Object.assign(patch, s);
    }

    const emailMerge = mergePersonEmailFields(master, dups);
    if (emailMerge.email) patch.email = emailMerge.email;
    patch.additionalEmails = emailMerge.additionalEmails;

    let orgIds = unionObjectIdStrings(
      (master.associatedOrganizations as unknown[]) || [],
      [],
    );
    let custom: Record<string, unknown> = {};
    for (const dup of dups) {
      orgIds = unionObjectIdStrings(
        orgIds,
        (dup.associatedOrganizations as unknown[]) || [],
      );
      Object.assign(custom, (dup.customFields as Record<string, unknown>) || {});
    }
    Object.assign(custom, (master.customFields as Record<string, unknown>) || {});

    patch.associatedOrganizations = orgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    patch.customFields = custom;

    if (isEmptyScalar(master.recordId)) {
      for (const dup of dups) {
        if (!isEmptyScalar(dup.recordId)) {
          patch.recordId = dup.recordId;
          break;
        }
      }
    }

    delete patch._id;
    delete patch.createdAt;
    delete patch.updatedAt;
    delete patch.__v;
    return patch;
  }

  private buildContactMergePatch(
    master: Record<string, unknown>,
    dups: Record<string, unknown>[],
  ): Record<string, unknown> {
    let effective = { ...master };
    const patch: Record<string, unknown> = {};
    for (const dup of dups) {
      const s = mergePersonScalarFields(
        effective,
        dup,
        CONTACT_MERGE_SCALAR as unknown as string[],
      );
      Object.assign(effective, s);
      Object.assign(patch, s);
    }

    const emailMerge = mergePersonEmailFields(master, dups);
    if (emailMerge.email) patch.email = emailMerge.email;
    patch.additionalEmails = emailMerge.additionalEmails;

    let orgIds = unionObjectIdStrings(
      (master.associatedOrganizations as unknown[]) || [],
      [],
    );
    let dealIds = unionObjectIdStrings(
      (master.associatedDeals as unknown[]) || [],
      [],
    );
    let leadIds = unionObjectIdStrings(
      (master.associatedLeads as unknown[]) || [],
      [],
    );
    let contactIds = unionObjectIdStrings(
      (master.associatedContacts as unknown[]) || [],
      [],
    );
    let custom: Record<string, unknown> = {};
    for (const dup of dups) {
      orgIds = unionObjectIdStrings(
        orgIds,
        (dup.associatedOrganizations as unknown[]) || [],
      );
      dealIds = unionObjectIdStrings(
        dealIds,
        (dup.associatedDeals as unknown[]) || [],
      );
      leadIds = unionObjectIdStrings(
        leadIds,
        (dup.associatedLeads as unknown[]) || [],
      );
      contactIds = unionObjectIdStrings(
        contactIds,
        (dup.associatedContacts as unknown[]) || [],
      );
      Object.assign(custom, (dup.customFields as Record<string, unknown>) || {});
    }
    Object.assign(custom, (master.customFields as Record<string, unknown>) || {});

    patch.associatedOrganizations = orgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    patch.associatedDeals = dealIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    patch.associatedLeads = leadIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const masterStr = String(master._id);
    const dupContactStrs = new Set(dups.map((d) => String(d._id)));
    patch.associatedContacts = contactIds
      .filter(
        (id) =>
          Types.ObjectId.isValid(id) &&
          id !== masterStr &&
          !dupContactStrs.has(id),
      )
      .map((id) => new Types.ObjectId(id));
    patch.customFields = custom;

    if (isEmptyScalar(master.recordId)) {
      for (const dup of dups) {
        if (!isEmptyScalar(dup.recordId)) {
          patch.recordId = dup.recordId;
          break;
        }
      }
    }

    delete patch._id;
    delete patch.createdAt;
    delete patch.updatedAt;
    delete patch.__v;
    return patch;
  }

  private async rewirePersonAssocArrays(
    model: Model<any>,
    field: string,
    dupOid: Types.ObjectId,
    masterOid: Types.ObjectId,
  ) {
    const refs = await model
      .find({ [field]: dupOid })
      .select('_id')
      .lean()
      .exec();
    for (const row of refs) {
      await model.updateOne(
        { _id: row._id },
        {
          $pull: { [field]: dupOid },
          $addToSet: { [field]: masterOid },
        },
      );
    }
  }

  private async rewireLeadReferences(
    dupOid: Types.ObjectId,
    masterOid: Types.ObjectId,
  ) {
    await this.activityModel.updateMany(
      { relatedTo: dupOid, relatedType: 'Lead' },
      { $set: { relatedTo: masterOid } },
    );

    await this.dealModel.updateMany({ lead: dupOid }, { $set: { lead: masterOid } });

    await this.emailModel.updateMany(
      { entityId: dupOid, module: { $in: ['leads', 'lead'] } },
      { $set: { entityId: masterOid } },
    );

    await this.emailTrackingModel.updateMany(
      { entityId: dupOid },
      { $set: { entityId: masterOid } },
    );

    await this.contactModel.updateMany(
      { sourceLead: dupOid },
      { $set: { sourceLead: masterOid } },
    );
    await this.rewirePersonAssocArrays(
      this.contactModel,
      'associatedLeads',
      dupOid,
      masterOid,
    );
    await this.rewirePersonAssocArrays(
      this.leadModel,
      'associatedLeads',
      dupOid,
      masterOid,
    );
    await this.rewirePersonAssocArrays(
      this.organizationModel,
      'associatedContacts',
      dupOid,
      masterOid,
    );

    await this.workflowExecutionModel.updateMany(
      { entityType: 'Lead', entityId: dupOid },
      { $set: { entityId: masterOid } },
    );
    await this.workflowDelayedJobModel.updateMany(
      { entityType: 'Lead', entityId: dupOid },
      { $set: { entityId: masterOid } },
    );

    await this.rewireWorkflowEnrollments('Lead', dupOid, masterOid);
    await this.rewireWorkflowGoalHits('Lead', dupOid, masterOid);

    await this.whatsAppMessageModel.updateMany(
      { entityId: dupOid },
      { $set: { entityId: masterOid } },
    );
  }

  private async rewireContactReferences(
    dupOid: Types.ObjectId,
    masterOid: Types.ObjectId,
  ) {
    await this.activityModel.updateMany(
      { relatedTo: dupOid, relatedType: 'Contact' },
      { $set: { relatedTo: masterOid } },
    );

    await this.dealModel.updateMany(
      { contactPerson: dupOid },
      { $set: { contactPerson: masterOid } },
    );
    await this.rewirePersonAssocArrays(
      this.dealModel,
      'associatedContacts',
      dupOid,
      masterOid,
    );

    await this.emailModel.updateMany(
      { entityId: dupOid, module: { $in: ['contacts', 'contact'] } },
      { $set: { entityId: masterOid } },
    );

    await this.emailTrackingModel.updateMany(
      { entityId: dupOid },
      { $set: { entityId: masterOid } },
    );

    await this.rewirePersonAssocArrays(
      this.contactModel,
      'associatedContacts',
      dupOid,
      masterOid,
    );
    await this.rewirePersonAssocArrays(
      this.organizationModel,
      'associatedContacts',
      dupOid,
      masterOid,
    );

    await this.workflowExecutionModel.updateMany(
      { entityType: 'Contact', entityId: dupOid },
      { $set: { entityId: masterOid } },
    );
    await this.workflowDelayedJobModel.updateMany(
      { entityType: 'Contact', entityId: dupOid },
      { $set: { entityId: masterOid } },
    );

    await this.rewireWorkflowEnrollments('Contact', dupOid, masterOid);
    await this.rewireWorkflowGoalHits('Contact', dupOid, masterOid);

    await this.whatsAppMessageModel.updateMany(
      { entityId: dupOid },
      { $set: { entityId: masterOid } },
    );
  }

  private async rewireWorkflowEnrollments(
    entityType: 'Lead' | 'Contact',
    dupOid: Types.ObjectId,
    masterOid: Types.ObjectId,
  ) {
    const enrolls = await this.workflowEnrollmentModel
      .find({ entityType, entityId: dupOid })
      .lean()
      .exec();
    for (const e of enrolls) {
      const exists = await this.workflowEnrollmentModel.findOne({
        workflowId: e.workflowId,
        entityType,
        entityId: masterOid,
      });
      if (exists) {
        await this.workflowEnrollmentModel.deleteOne({ _id: e._id });
      } else {
        await this.workflowEnrollmentModel.updateOne(
          { _id: e._id },
          { $set: { entityId: masterOid } },
        );
      }
    }
  }

  private async rewireWorkflowGoalHits(
    entityType: 'Lead' | 'Contact',
    dupOid: Types.ObjectId,
    masterOid: Types.ObjectId,
  ) {
    const hits = await this.workflowGoalHitModel
      .find({ entityId: dupOid, entityType })
      .lean();
    for (const h of hits) {
      const exists = await this.workflowGoalHitModel.findOne({
        workflowId: h.workflowId,
        entityId: masterOid,
        entityType,
      });
      if (exists) {
        await this.workflowGoalHitModel.deleteOne({ _id: h._id });
      } else {
        await this.workflowGoalHitModel.updateOne(
          { _id: h._id },
          { $set: { entityId: masterOid } },
        );
      }
    }
  }
}
