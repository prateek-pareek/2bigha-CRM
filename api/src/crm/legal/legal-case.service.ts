import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LegalCase, LegalCaseDocument } from '../records/schemas/legal-case.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Contact, ContactDocument } from '../records/schemas/contact.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import { LegalCaseNotificationService } from './legal-case-notification.service';
import {
  assignUniqueRecordId,
  isMongoObjectIdString,
} from '../shared/crm-record-id.util';
import {
  buildScalableListResult,
  clampPageSize,
  CRM_DEFAULT_PAGE,
  CRM_DEFAULT_PAGE_SIZE,
  CRM_MAX_BOARD_PAGE_SIZE,
  CRM_LIST_MAX_TIME_MS,
  ScalableListResult,
} from '../../common/lib/pagination/list-pagination';
import { countDocumentsCapped } from '../../common/lib/pagination/capped-count';
import { hasCrmFullDataAccess, jwtCrmPermissionSet } from '../shared/crm-admin-access.util';
import { CrmAssignmentPolicyService } from '../shared/crm-assignment-policy.service';
import { roleAllowsLead, roleAllowsModule, roleBelongsToWorkspace } from '../shared/crm-workspace-module.util';

/** Fields a 2Bigha/PM user sees through the read-only `legal:status` hand-off. */
const LEGAL_STATUS_FIELDS = 'recordId title stage caseType priority caseOwner updatedAt createdAt';

export type LegalCaseListOpts = {
  page?: number;
  pageSize?: number;
  search?: string;
  pipeline?: string;
  stage?: string;
  caseOwner?: string;
  priority?: string;
  caseType?: string;
  user?: any;
};

@Injectable()
export class LegalCaseService {
  constructor(
    @InjectModel(LegalCase.name, 'crmConnection')
    private readonly legalCaseModel: Model<LegalCaseDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    private readonly notificationService: LegalCaseNotificationService,
    private readonly assignmentPolicy: CrmAssignmentPolicyService,
  ) {}

  private ownerLabel(user?: any): string {
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || '';
  }

  /**
   * Record scope for the caller (requirement §8 / §13.3): Super Admin or `legal:read:all`
   * → every case; Legal Team Lead (`legal:read:team`) → cases owned/created by self + direct
   * reports; Legal Executive → only their own cases. `null` = no restriction.
   */
  async scopeFilter(user?: any): Promise<Record<string, unknown> | null> {
    if (!user || hasCrmFullDataAccess(user)) return null;
    const perms = jwtCrmPermissionSet(user);
    if (perms.has('legal:read:all')) return null;
    let ids: string[];
    let labels: string[];
    if (perms.has('legal:read:team')) {
      ({ ids, labels } = await this.assignmentPolicy.teamOf(user));
    } else {
      const self = String(user.userId ?? user._id ?? '');
      ids = self ? [self] : [];
      labels = [this.ownerLabel(user)].filter(Boolean);
    }
    const or: Record<string, unknown>[] = [];
    if (labels.length) or.push({ caseOwner: { $in: labels } });
    const oids = ids.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i));
    if (oids.length) or.push({ createdBy: { $in: oids } });
    return or.length ? { $or: or } : { _id: null };
  }

  private async withScope(base: Record<string, unknown>, user?: any) {
    const scope = await this.scopeFilter(user);
    return scope ? { $and: [base, scope] } : base;
  }

  /**
   * Read-only legal status of the cases linked to a lead — the defined hand-off that lets
   * 2Bigha / PM agents see where a lead's legal work stands without entering Legal's case
   * workspace. Only for leads in the caller's own workspace.
   */
  async statusByLead(leadId: string, user?: any) {
    const leadOid = this.toObjectIdSafe(leadId);
    if (!leadOid) throw new BadRequestException('Valid leadId is required');
    const lead: any = await this.leadModel.findById(leadOid).select('_id module leadVertical').lean().exec();
    if (!lead) throw new NotFoundException('Lead not found');
    const legalUser = roleBelongsToWorkspace(user?.crmDbUser, 'LEGAL');
    if (!legalUser && !roleAllowsLead(user?.crmDbUser, lead)) {
      throw new ForbiddenException('This lead belongs to a different workspace.');
    }
    return this.legalCaseModel
      .find({ associatedLeads: leadOid, isDeleted: { $ne: true } })
      .select(LEGAL_STATUS_FIELDS)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .exec();
  }

  private toObjectIdSafe(v: any): Types.ObjectId | null {
    if (!v) return null;
    if (v instanceof Types.ObjectId) return v;
    const s = String(v).trim();
    if (s === '' || s === 'null' || s === 'undefined') return null;
    if (/^[0-9a-fA-F]{24}$/.test(s)) return new Types.ObjectId(s);
    return null;
  }

  private normalizeObjectIdArray(v: any): Types.ObjectId[] {
    if (!Array.isArray(v)) return [];
    return v
      .map((item) => this.toObjectIdSafe(item))
      .filter((o): o is Types.ObjectId => !!o);
  }

  private async nextRecordId(requested?: string | null): Promise<string> {
    const r = await assignUniqueRecordId(this.legalCaseModel, requested);
    if (!r.ok) throw new BadRequestException('Record ID is already in use');
    return r.recordId;
  }

  /** Resolve route param: Mongo _id or HubSpot-style `recordId`. */
  private async resolveDocumentId(id: string): Promise<string | null> {
    if (isMongoObjectIdString(id)) {
      const byId = await this.legalCaseModel
        .findById(id)
        .select('_id')
        .lean()
        .exec();
      if (byId) return String((byId as { _id: Types.ObjectId })._id);
    }
    const byRid = await this.legalCaseModel
      .findOne({ recordId: id })
      .select('_id')
      .lean()
      .exec();
    return byRid ? String((byRid as { _id: Types.ObjectId })._id) : null;
  }

  async create(dto: any, user?: any): Promise<LegalCase> {
    const payload: Record<string, unknown> = { ...dto };

    if (user) {
      const rawId = user.userId ?? user._id;
      if (rawId && Types.ObjectId.isValid(String(rawId))) {
        payload.createdBy = new Types.ObjectId(String(rawId));
      }
      if (!payload.caseOwner && (user.firstName || user.lastName)) {
        payload.caseOwner = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
    }

    if (payload.pipeline !== undefined) {
      const oid = this.toObjectIdSafe(payload.pipeline);
      if (oid) payload.pipeline = oid;
      else delete payload.pipeline;
    }
    if (payload.clientId !== undefined) {
      const oid = this.toObjectIdSafe(payload.clientId);
      if (oid) payload.clientId = oid;
      else delete payload.clientId;
    }
    if (payload.associatedContacts !== undefined) {
      payload.associatedContacts = this.normalizeObjectIdArray(payload.associatedContacts);
    }
    if (payload.associatedLeads !== undefined) {
      payload.associatedLeads = this.normalizeObjectIdArray(payload.associatedLeads);
    }

    const requestedRecordId = payload.recordId as string | undefined;
    delete payload.recordId;
    payload.recordId = await this.nextRecordId(requestedRecordId);

    const created = await new this.legalCaseModel(payload).save();

    // Bidirectional: keep any leads linked at creation time in sync.
    const leadIds = (created.associatedLeads || []) as Types.ObjectId[];
    if (leadIds.length) {
      await this.leadModel
        .updateMany(
          { _id: { $in: leadIds } },
          { $addToSet: { associatedLegalCases: created._id } },
        )
        .exec();
    }

    return created;
  }

  async findAll(listOpts?: LegalCaseListOpts, user?: any): Promise<ScalableListResult<LegalCase>> {
    let filter: Record<string, unknown> = {};

    if (listOpts?.pipeline && isMongoObjectIdString(listOpts.pipeline)) {
      filter.pipeline = new Types.ObjectId(listOpts.pipeline);
    }
    if (listOpts?.stage) {
      filter.stage = listOpts.stage;
    }
    if (listOpts?.caseOwner) {
      filter.caseOwner = listOpts.caseOwner;
    }
    if (listOpts?.priority) {
      filter.priority = listOpts.priority;
    }
    if (listOpts?.caseType) {
      filter.caseType = listOpts.caseType;
    }

    const search = listOpts?.search?.trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter = {
        $and: [
          filter,
          {
            $or: [
              { title: rx },
              { counterpartyName: rx },
              { description: rx },
            ],
          },
        ],
      };
    }

    // Module isolation: enforce LEGAL workspace boundary
    if (listOpts?.user && !roleAllowsModule(listOpts.user?.crmDbUser, 'LEGAL')) {
      return buildScalableListResult([], { page: 1, pageSize: 25, total: 0, totalIsApproximate: false });
    }
    // Record scope: Legal Executive → own cases, Legal Team Lead → team, Super Admin → all.
    filter = await this.withScope(filter, user ?? listOpts?.user);

    const page = Math.max(1, listOpts?.page ?? CRM_DEFAULT_PAGE);
    const pageSize = clampPageSize(
      listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
      CRM_MAX_BOARD_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;

    const [data, count] = await Promise.all([
      this.legalCaseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      countDocumentsCapped(this.legalCaseModel, filter),
    ]);

    return buildScalableListResult(data as unknown as LegalCase[], {
      page,
      pageSize,
      total: count.total,
      totalIsApproximate: count.approximate,
    });
  }

  async findOne(id: string, user?: any): Promise<LegalCase | null> {
    const assocPopulate = [
      { path: 'associatedContacts', select: 'firstName lastName email stage' },
      { path: 'associatedLeads', select: 'firstName lastName email status stage' },
    ];
    let doc: LegalCaseDocument | null = null;
    if (isMongoObjectIdString(id)) {
      doc = await this.legalCaseModel.findById(id).populate(assocPopulate).exec();
    }
    if (!doc) {
      doc = await this.legalCaseModel
        .findOne({ recordId: id })
        .populate(assocPopulate)
        .exec();
    }
    if (doc && !(await this.inScope(String(doc._id), user))) return null;
    return doc;
  }

  private async inScope(oidStr: string, user?: any): Promise<boolean> {
    const scope = await this.scopeFilter(user);
    if (!scope) return true;
    const hit = await this.legalCaseModel
      .exists({ $and: [{ _id: new Types.ObjectId(oidStr) }, scope] })
      .exec();
    return !!hit;
  }

  /** Resolves the id and enforces the caller's record scope (404 when outside it). */
  private async requireOid(id: string, user?: any): Promise<string> {
    const oidStr = await this.resolveDocumentId(id);
    if (!oidStr || !(await this.inScope(oidStr, user))) {
      throw new NotFoundException('Legal case not found');
    }
    return oidStr;
  }

  async update(id: string, dto: any, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id, user);
    const payload: Record<string, unknown> = { ...dto };
    delete payload.recordId;
    // Changing the owner is a reassignment — needs `legal:assign` (Legal Team Lead / Super Admin).
    if (payload.caseOwner !== undefined && user) {
      const current: any = await this.legalCaseModel.findById(oidStr).select('caseOwner').lean().exec();
      if (String(payload.caseOwner || '').trim() !== String(current?.caseOwner || '').trim()) {
        const tier = this.assignmentPolicy.requireTier('legal', user);
        const assignee = await this.assignmentPolicy.assertAssignee(tier, user, String(payload.caseOwner || ''));
        payload.caseOwner = assignee.label || payload.caseOwner;
      }
    }

    if (payload.pipeline !== undefined) {
      const oid = this.toObjectIdSafe(payload.pipeline);
      if (oid) payload.pipeline = oid;
      else delete payload.pipeline;
    }
    if (payload.clientId !== undefined) {
      const oid = this.toObjectIdSafe(payload.clientId);
      if (oid) payload.clientId = oid;
      else delete payload.clientId;
    }
    if (payload.associatedContacts !== undefined) {
      payload.associatedContacts = this.normalizeObjectIdArray(payload.associatedContacts);
    }
    if (payload.associatedLeads !== undefined) {
      payload.associatedLeads = this.normalizeObjectIdArray(payload.associatedLeads);
    }

    return this.legalCaseModel
      .findByIdAndUpdate(oidStr, payload, { new: true })
      .exec();
  }

  async updateStage(id: string, stage: string, user?: any): Promise<LegalCase | null> {
    if (!stage || typeof stage !== 'string') {
      throw new BadRequestException('stage is required');
    }
    const oidStr = await this.requireOid(id, user);
    const oldCase = await this.legalCaseModel.findById(oidStr).select('stage').lean().exec();
    const previousStage = (oldCase as any)?.stage || null;

    const updated = await this.legalCaseModel
      .findByIdAndUpdate(oidStr, { $set: { stage } }, { new: true })
      .exec();

    if (updated && previousStage !== stage) {
      void this.notificationService.notifyStatusChange(
        oidStr,
        previousStage,
        stage,
        updated as LegalCaseDocument,
      );
    }

    return updated;
  }

  // --- Soft delete (move to Trash) ---
  async remove(id: string, deletedBy?: string, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.resolveDocumentId(id);
    if (!oidStr || !(await this.inScope(oidStr, user))) return null;
    return this.legalCaseModel
      .findByIdAndUpdate(oidStr, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }

  async bulkDelete(ids: string[], deletedBy?: string, user?: any) {
    const oids = (ids || [])
      .map((i) => this.toObjectIdSafe(i))
      .filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) return { modifiedCount: 0, deletedCount: 0 };
    const result = await this.legalCaseModel
      .updateMany(await this.withScope({ _id: { $in: oids } }, user), softDeleteUpdate(deletedBy))
      .exec();
    return {
      modifiedCount: result.modifiedCount,
      deletedCount: result.modifiedCount,
    };
  }

  async bulkAssign(body: { caseOwner?: string; ids?: string[] }, user?: any) {
    let caseOwner = String(body?.caseOwner || '').trim();
    if (!caseOwner) throw new BadRequestException('Owner is required');
    if (caseOwner.length > 200) {
      throw new BadRequestException('Owner name is too long');
    }

    const maxAssign = 2000;
    const oids = (body?.ids || [])
      .map((raw) => this.toObjectIdSafe(String(raw || '').trim()))
      .filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) {
      throw new BadRequestException('Select at least one legal case');
    }
    if (oids.length > maxAssign) {
      throw new BadRequestException(
        `You can assign at most ${maxAssign} legal cases at once`,
      );
    }

    const tier = this.assignmentPolicy.requireTier('legal', user);
    const assignee = await this.assignmentPolicy.assertAssignee(tier, user, caseOwner);
    caseOwner = assignee.label || caseOwner;

    const result = await this.legalCaseModel
      .updateMany(await this.withScope({ _id: { $in: oids } }, user), { $set: { caseOwner } })
      .exec();

    return {
      caseOwner,
      requested: oids.length,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    };
  }

  // --- Bidirectional lead linking ---
  async linkLead(id: string, leadId: string, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id, user);
    const leadOid = this.toObjectIdSafe(leadId);
    if (!leadOid) throw new BadRequestException('Valid leadId is required');

    const lead = await this.leadModel.findById(leadOid).select('_id').exec();
    if (!lead) throw new NotFoundException('Lead not found');

    await this.legalCaseModel
      .updateOne({ _id: oidStr }, { $addToSet: { associatedLeads: leadOid } })
      .exec();
    await this.leadModel
      .updateOne(
        { _id: leadOid },
        { $addToSet: { associatedLegalCases: new Types.ObjectId(oidStr) } },
      )
      .exec();

    return this.legalCaseModel.findById(oidStr).exec();
  }

  async unlinkLead(id: string, leadId: string, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id, user);
    const leadOid = this.toObjectIdSafe(leadId);
    if (!leadOid) throw new BadRequestException('Valid leadId is required');

    await this.legalCaseModel
      .updateOne({ _id: oidStr }, { $pull: { associatedLeads: leadOid } })
      .exec();
    await this.leadModel
      .updateOne(
        { _id: leadOid },
        { $pull: { associatedLegalCases: new Types.ObjectId(oidStr) } },
      )
      .exec();

    return this.legalCaseModel.findById(oidStr).exec();
  }

  // --- Contact linking (single-sided; Contact has no associatedLegalCases field) ---
  async linkContact(id: string, contactId: string, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id, user);
    const contactOid = this.toObjectIdSafe(contactId);
    if (!contactOid) throw new BadRequestException('Valid contactId is required');

    const contact = await this.contactModel.findById(contactOid).select('_id').exec();
    if (!contact) throw new NotFoundException('Contact not found');

    await this.legalCaseModel
      .updateOne(
        { _id: oidStr },
        { $addToSet: { associatedContacts: contactOid } },
      )
      .exec();

    return this.legalCaseModel.findById(oidStr).exec();
  }

  async unlinkContact(id: string, contactId: string, user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id, user);
    const contactOid = this.toObjectIdSafe(contactId);
    if (!contactOid) throw new BadRequestException('Valid contactId is required');

    await this.legalCaseModel
      .updateOne({ _id: oidStr }, { $pull: { associatedContacts: contactOid } })
      .exec();

    return this.legalCaseModel.findById(oidStr).exec();
  }
}
