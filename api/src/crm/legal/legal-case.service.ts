import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LegalCase, LegalCaseDocument } from '../records/schemas/legal-case.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Contact, ContactDocument } from '../records/schemas/contact.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
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

export type LegalCaseListOpts = {
  page?: number;
  pageSize?: number;
  search?: string;
  pipeline?: string;
  stage?: string;
  caseOwner?: string;
  priority?: string;
  caseType?: string;
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
  ) {}

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
    if (payload.associatedDeals !== undefined) {
      payload.associatedDeals = this.normalizeObjectIdArray(payload.associatedDeals);
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

  async findAll(listOpts?: LegalCaseListOpts): Promise<ScalableListResult<LegalCase>> {
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

  async findOne(id: string): Promise<LegalCase | null> {
    const assocPopulate = [
      { path: 'associatedContacts', select: 'firstName lastName email stage' },
      { path: 'associatedLeads', select: 'firstName lastName email status stage' },
      { path: 'associatedDeals', select: 'title stage dealValue' },
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
    return doc;
  }

  private async requireOid(id: string): Promise<string> {
    const oidStr = await this.resolveDocumentId(id);
    if (!oidStr) throw new NotFoundException('Legal case not found');
    return oidStr;
  }

  async update(id: string, dto: any, _user?: any): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id);
    const payload: Record<string, unknown> = { ...dto };
    delete payload.recordId;

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
    if (payload.associatedDeals !== undefined) {
      payload.associatedDeals = this.normalizeObjectIdArray(payload.associatedDeals);
    }

    return this.legalCaseModel
      .findByIdAndUpdate(oidStr, payload, { new: true })
      .exec();
  }

  async updateStage(id: string, stage: string): Promise<LegalCase | null> {
    if (!stage || typeof stage !== 'string') {
      throw new BadRequestException('stage is required');
    }
    const oidStr = await this.requireOid(id);
    return this.legalCaseModel
      .findByIdAndUpdate(oidStr, { $set: { stage } }, { new: true })
      .exec();
  }

  // --- Soft delete (move to Trash) ---
  async remove(id: string, deletedBy?: string): Promise<LegalCase | null> {
    const oidStr = await this.resolveDocumentId(id);
    if (!oidStr) return null;
    return this.legalCaseModel
      .findByIdAndUpdate(oidStr, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }

  async bulkDelete(ids: string[], deletedBy?: string) {
    const oids = (ids || [])
      .map((i) => this.toObjectIdSafe(i))
      .filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) return { modifiedCount: 0, deletedCount: 0 };
    const result = await this.legalCaseModel
      .updateMany({ _id: { $in: oids } }, softDeleteUpdate(deletedBy))
      .exec();
    return {
      modifiedCount: result.modifiedCount,
      deletedCount: result.modifiedCount,
    };
  }

  async bulkAssign(body: { caseOwner?: string; ids?: string[] }) {
    const caseOwner = String(body?.caseOwner || '').trim();
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

    const result = await this.legalCaseModel
      .updateMany({ _id: { $in: oids } }, { $set: { caseOwner } })
      .exec();

    return {
      caseOwner,
      requested: oids.length,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    };
  }

  // --- Bidirectional lead linking ---
  async linkLead(id: string, leadId: string): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id);
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

  async unlinkLead(id: string, leadId: string): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id);
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
  async linkContact(id: string, contactId: string): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id);
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

  async unlinkContact(id: string, contactId: string): Promise<LegalCase | null> {
    const oidStr = await this.requireOid(id);
    const contactOid = this.toObjectIdSafe(contactId);
    if (!contactOid) throw new BadRequestException('Valid contactId is required');

    await this.legalCaseModel
      .updateOne({ _id: oidStr }, { $pull: { associatedContacts: contactOid } })
      .exec();

    return this.legalCaseModel.findById(oidStr).exec();
  }
}
