import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CrmSegment,
  CrmSegmentDocument,
  CrmSegmentMemberModule,
  CRM_SEGMENT_MEMBER_MODULES,
} from '../schemas/crm-segment.schema';
import { CRMService } from '../core/crm.service';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  PlatformOpportunity,
  PlatformOpportunityDocument,
} from '../schemas/platform-opportunity.schema';
import {
  appendCrmListFilters,
  CrmFilterCriterion,
} from '../shared/crm-list-filters';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

type SegmentDto = {
  name: string;
  description?: string;
  listType?: 'dynamic' | 'static';
  leadFilters?: CrmFilterCriterion[];
  contactFilters?: CrmFilterCriterion[];
  platformOpportunityFilters?: CrmFilterCriterion[];
};

@Injectable()
export class CrmSegmentsService {
  constructor(
    @InjectModel(CrmSegment.name, 'crmConnection')
    private segmentModel: Model<CrmSegmentDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(PlatformOpportunity.name, 'crmConnection')
    private platformOpportunityModel: Model<PlatformOpportunityDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
  ) {}

  parseMemberModule(module?: string): CrmSegmentMemberModule {
    const value = String(module || '').trim();
    if ((CRM_SEGMENT_MEMBER_MODULES as string[]).includes(value)) {
      return value as CrmSegmentMemberModule;
    }
    throw new BadRequestException(
      `Invalid module. Expected one of: ${CRM_SEGMENT_MEMBER_MODULES.join(', ')}`,
    );
  }

  private normalizeFilters(
    rows?: CrmFilterCriterion[],
  ): CrmFilterCriterion[] {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r?.property && r?.operator)
      .map((r) => ({
        property: String(r.property),
        operator: String(r.operator),
        value: String(r.value ?? ''),
      }));
  }

  private filtersForModule(
    segment: CrmSegment,
    module: CrmSegmentMemberModule,
  ): CrmFilterCriterion[] {
    if (module === 'leads') return (segment.leadFilters ?? []) as CrmFilterCriterion[];
    if (module === 'contacts') return (segment.contactFilters ?? []) as CrmFilterCriterion[];
    return (segment.platformOpportunityFilters ?? []) as CrmFilterCriterion[];
  }

  private toResponse(doc: CrmSegmentDocument | Record<string, unknown>) {
    const row = doc as CrmSegment & { _id: Types.ObjectId };
    return {
      id: String(row._id),
      _id: String(row._id),
      name: row.name,
      description: row.description ?? '',
      listType: row.listType,
      leadFilters: row.leadFilters ?? [],
      contactFilters: row.contactFilters ?? [],
      platformOpportunityFilters: row.platformOpportunityFilters ?? [],
      members: (row.members ?? []).map((m) => ({
        module: m.module,
        entityId: String(m.entityId),
      })),
      createdBy: row.createdBy ? String(row.createdBy) : undefined,
      createdAt: (row as any).createdAt,
      updatedAt: (row as any).updatedAt,
    };
  }

  private async enrichCounts(row: CrmSegment, user?: any) {
    const [leadCount, contactCount, platformOpportunityCount] =
      await Promise.all([
        this.countForModule(row, user, 'leads'),
        this.countForModule(row, user, 'contacts'),
        this.countForModule(row, user, 'platform-opportunities'),
      ]);
    return {
      ...this.toResponse(row as CrmSegmentDocument),
      leadCount,
      contactCount,
      platformOpportunityCount,
      memberCount: leadCount + contactCount + platformOpportunityCount,
    };
  }

  async findForRecord(
    module: CrmSegmentMemberModule,
    entityId: string,
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(entityId)) {
      throw new BadRequestException('Invalid record id');
    }
    await this.assertRecordAccessible(module, entityId, user);
    const oid = new Types.ObjectId(entityId);

    const [memberships, staticLists] = await Promise.all([
      this.segmentModel
        .find({
          listType: 'static',
          members: { $elemMatch: { module, entityId: oid } },
        })
        .select('name listType')
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.segmentModel
        .find({ listType: 'static' })
        .select('name listType')
        .sort({ name: 1 })
        .lean()
        .exec(),
    ]);

    const memberIds = new Set(memberships.map((s) => String(s._id)));

    return {
      module,
      entityId: String(entityId),
      memberships: memberships.map((s) => ({
        id: String(s._id),
        name: s.name,
        listType: s.listType,
      })),
      staticLists: staticLists.map((s) => ({
        id: String(s._id),
        name: s.name,
        isMember: memberIds.has(String(s._id)),
      })),
    };
  }

  async findAll(user?: any) {
    const rows = await this.segmentModel
      .find()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return Promise.all(
      rows.map((row) => this.enrichCounts(row as CrmSegment, user)),
    );
  }

  async findOne(id: string, user?: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const row = await this.segmentModel.findById(id).lean().exec();
    if (!row) throw new NotFoundException('Segment not found');
    return this.enrichCounts(row as CrmSegment, user);
  }

  async create(dto: SegmentDto, user?: any) {
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('Name is required');
    const listType = dto.listType === 'static' ? 'static' : 'dynamic';
    const doc = await this.segmentModel.create({
      name,
      description: String(dto.description || '').trim(),
      listType,
      leadFilters: this.normalizeFilters(dto.leadFilters),
      contactFilters: this.normalizeFilters(dto.contactFilters),
      platformOpportunityFilters: this.normalizeFilters(
        dto.platformOpportunityFilters,
      ),
      members: [],
      createdBy: user?.userId
        ? new Types.ObjectId(String(user.userId))
        : undefined,
    });
    return this.findOne(String(doc._id), user);
  }

  /** Estimate membership counts for unsaved filter / membership drafts. */
  async previewCounts(
    dto: {
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
      platformOpportunityFilters?: CrmFilterCriterion[];
      members?: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
    },
    user?: any,
  ) {
    const draft = this.draftSegmentFromDto(dto);
    const [leadCount, contactCount, platformOpportunityCount] =
      await Promise.all([
        this.countForModule(draft, user, 'leads'),
        this.countForModule(draft, user, 'contacts'),
        this.countForModule(draft, user, 'platform-opportunities'),
      ]);
    return {
      leadCount,
      contactCount,
      platformOpportunityCount,
      memberCount: leadCount + contactCount + platformOpportunityCount,
    };
  }

  /** Page members for an unsaved draft (live preview without saving). */
  async previewMembers(
    dto: {
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
      platformOpportunityFilters?: CrmFilterCriterion[];
      members?: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
      module: string;
      page?: number;
      pageSize?: number;
      search?: string;
    },
    user?: any,
  ) {
    const module = this.parseMemberModule(dto.module);
    const draft = this.draftSegmentFromDto(dto);
    return this.listMembersFromSegment(draft, module, user, {
      page: dto.page,
      pageSize: dto.pageSize,
      search: dto.search,
    });
  }

  async clone(id: string, user?: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const source = await this.segmentModel.findById(id).lean().exec();
    if (!source) throw new NotFoundException('Segment not found');

    const baseName = String(source.name || 'Segment').trim() || 'Segment';
    const copyName = `${baseName} (copy)`;
    const doc = await this.segmentModel.create({
      name: copyName.slice(0, 200),
      description: String(source.description || '').trim(),
      listType: source.listType === 'static' ? 'static' : 'dynamic',
      leadFilters: this.normalizeFilters(
        (source.leadFilters ?? []) as CrmFilterCriterion[],
      ),
      contactFilters: this.normalizeFilters(
        (source.contactFilters ?? []) as CrmFilterCriterion[],
      ),
      platformOpportunityFilters: this.normalizeFilters(
        (source.platformOpportunityFilters ?? []) as CrmFilterCriterion[],
      ),
      members:
        source.listType === 'static'
          ? (source.members ?? []).map((m) => ({
              module: m.module,
              entityId: m.entityId,
            }))
          : [],
      createdBy: user?.userId
        ? new Types.ObjectId(String(user.userId))
        : undefined,
    });
    return this.findOne(String(doc._id), user);
  }

  /**
   * Reassign leadOwner for leads in this segment (selected ids, or all accessible members).
   */
  async assignLeads(
    id: string,
    body: { ownerName: string; leadIds?: string[]; scope?: 'selected' | 'all' },
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const ownerName = String(body?.ownerName || '').trim();
    if (!ownerName) throw new BadRequestException('Owner is required');
    if (ownerName.length > 200) {
      throw new BadRequestException('Owner name is too long');
    }

    const segment = await this.segmentModel.findById(id).lean().exec();
    if (!segment) throw new NotFoundException('Segment not found');

    const scope: 'selected' | 'all' =
      body.scope === 'all'
        ? 'all'
        : body.scope === 'selected'
          ? 'selected'
          : body.leadIds?.length
            ? 'selected'
            : 'all';
    const maxAssign = 2000;
    let targetIds: Types.ObjectId[] = [];

    if (scope === 'selected') {
      const requested = (body.leadIds || [])
        .map((raw) => String(raw || '').trim())
        .filter((v) => Types.ObjectId.isValid(v))
        .map((v) => new Types.ObjectId(v));
      if (!requested.length) {
        throw new BadRequestException('Select at least one lead');
      }
      if (requested.length > maxAssign) {
        throw new BadRequestException(`You can assign at most ${maxAssign} leads at once`);
      }
      const memberSet = new Set(
        (await this.resolveSegmentLeadIds(segment as CrmSegment, user, maxAssign)).map(
          (oid) => String(oid),
        ),
      );
      targetIds = requested.filter((oid) => memberSet.has(String(oid)));
      if (!targetIds.length) {
        throw new BadRequestException(
          'None of the selected leads belong to this segment (or you cannot access them)',
        );
      }
    } else {
      targetIds = await this.resolveSegmentLeadIds(
        segment as CrmSegment,
        user,
        maxAssign,
      );
      if (!targetIds.length) {
        throw new BadRequestException('This segment has no leads to assign');
      }
    }

    const accessFilter = this.buildAccessFilter('leads', user);
    const clauses: Record<string, unknown>[] = [{ _id: { $in: targetIds } }];
    if (Object.keys(accessFilter).length) clauses.push(accessFilter);
    const filter: Record<string, unknown> =
      clauses.length === 1 ? clauses[0] : { $and: clauses };

    const result = await this.leadModel
      .updateMany(filter as Record<string, any>, {
        $set: { leadOwner: ownerName },
      })
      .exec();

    return {
      segmentId: id,
      ownerName,
      scope,
      requested: targetIds.length,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      truncated: targetIds.length >= maxAssign,
    };
  }

  private async resolveSegmentLeadIds(
    segment: CrmSegment,
    user: any,
    max: number,
  ): Promise<Types.ObjectId[]> {
    if (segment.listType === 'static') {
      return (segment.members ?? [])
        .filter((m) => m.module === 'leads' && m.entityId)
        .slice(0, max)
        .map((m) =>
          m.entityId instanceof Types.ObjectId
            ? m.entityId
            : new Types.ObjectId(String(m.entityId)),
        );
    }

    const filters = this.filtersForModule(segment, 'leads');
    const accessFilter = this.buildAccessFilter('leads', user);
    let filter: Record<string, unknown> = { ...accessFilter };
    filter = appendCrmListFilters(filter, filters, 'leads');
    const rows = await this.leadModel
      .find(filter as Record<string, any>)
      .select('_id')
      .limit(max)
      .lean()
      .exec();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  private draftSegmentFromDto(dto: {
    listType?: 'dynamic' | 'static';
    leadFilters?: CrmFilterCriterion[];
    contactFilters?: CrmFilterCriterion[];
    platformOpportunityFilters?: CrmFilterCriterion[];
    members?: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
  }): CrmSegment {
    const listType = dto.listType === 'static' ? 'static' : 'dynamic';
    const members = (dto.members || [])
      .filter(
        (m) =>
          m?.entityId &&
          Types.ObjectId.isValid(String(m.entityId)) &&
          (CRM_SEGMENT_MEMBER_MODULES as string[]).includes(String(m.module)),
      )
      .map((m) => ({
        module: m.module as CrmSegmentMemberModule,
        entityId: new Types.ObjectId(String(m.entityId)),
      }));
    return {
      name: 'preview',
      description: '',
      listType,
      leadFilters: this.normalizeFilters(dto.leadFilters) as any,
      contactFilters: this.normalizeFilters(dto.contactFilters) as any,
      platformOpportunityFilters: this.normalizeFilters(
        dto.platformOpportunityFilters,
      ) as any,
      members: listType === 'static' ? (members as any) : [],
    } as CrmSegment;
  }

  async update(id: string, dto: Partial<SegmentDto>, user?: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const doc = await this.segmentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Segment not found');

    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BadRequestException('Name is required');
      doc.name = name;
    }
    if (dto.description !== undefined) {
      doc.description = String(dto.description || '').trim();
    }
    if (dto.listType !== undefined) {
      doc.listType = dto.listType === 'static' ? 'static' : 'dynamic';
    }
    if (dto.leadFilters !== undefined) {
      doc.leadFilters = this.normalizeFilters(dto.leadFilters) as any;
    }
    if (dto.contactFilters !== undefined) {
      doc.contactFilters = this.normalizeFilters(dto.contactFilters) as any;
    }
    if (dto.platformOpportunityFilters !== undefined) {
      doc.platformOpportunityFilters = this.normalizeFilters(
        dto.platformOpportunityFilters,
      ) as any;
    }
    await doc.save();
    return this.findOne(id, user);
  }

  async delete(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const res = await this.segmentModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
    if (!res) throw new NotFoundException('Segment not found');
    return { success: true };
  }

  /** Whether a record belongs to a static or dynamic segment. */
  async isEntityInSegment(
    segmentId: string,
    module: CrmSegmentMemberModule,
    entityId: string,
    user?: any,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(segmentId) || !Types.ObjectId.isValid(entityId)) {
      return false;
    }
    const segment = await this.segmentModel.findById(segmentId).lean().exec();
    if (!segment) return false;

    if (segment.listType === 'static') {
      return (segment.members ?? []).some(
        (m) => m.module === module && String(m.entityId) === entityId,
      );
    }

    const filters = this.filtersForModule(segment as CrmSegment, module);
    const accessFilter = this.buildAccessFilter(module, user);
    const idFilter = { _id: new Types.ObjectId(entityId) };
    let mongoFilter = appendCrmListFilters(
      idFilter,
      filters,
      module,
    );
    if (Object.keys(accessFilter).length) {
      mongoFilter = Object.keys(mongoFilter).length
        ? { $and: [mongoFilter, accessFilter] }
        : accessFilter;
    }
    const hit = await this.modelForModule(module).exists(
      mongoFilter as Record<string, unknown>,
    );
    return !!hit;
  }

  async addMember(
    id: string,
    module: CrmSegmentMemberModule,
    entityId: string,
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(entityId)) {
      throw new BadRequestException('Invalid segment or record id');
    }
    const doc = await this.segmentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Segment not found');
    if (doc.listType !== 'static') {
      throw new BadRequestException('Members can only be added to static lists');
    }
    await this.assertRecordAccessible(module, entityId, user);
    const exists = doc.members.some(
      (m) => m.module === module && String(m.entityId) === entityId,
    );
    if (!exists) {
      doc.members.push({
        module,
        entityId: new Types.ObjectId(entityId),
      });
      await doc.save();
    }
    return this.findOne(id, user);
  }

  async removeMember(
    id: string,
    module: CrmSegmentMemberModule,
    entityId: string,
    user?: any,
  ) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Segment not found');
    const doc = await this.segmentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Segment not found');
    doc.members = doc.members.filter(
      (m) => !(m.module === module && String(m.entityId) === entityId),
    );
    await doc.save();
    return this.findOne(id, user);
  }

  async listMembers(
    id: string,
    module: CrmSegmentMemberModule,
    user: any,
    opts?: { page?: number; pageSize?: number; search?: string },
  ) {
    const segment = await this.segmentModel.findById(id).lean().exec();
    if (!segment) throw new NotFoundException('Segment not found');
    return this.listMembersFromSegment(segment as CrmSegment, module, user, opts);
  }

  private async listMembersFromSegment(
    segment: CrmSegment,
    module: CrmSegmentMemberModule,
    user: any,
    opts?: { page?: number; pageSize?: number; search?: string },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts?.pageSize ?? 50), 200);

    if (segment.listType === 'dynamic') {
      const filters = this.filtersForModule(segment, module);
      const listOpts = {
        page,
        pageSize,
        search: opts?.search?.trim() || undefined,
        filters,
      };
      if (module === 'leads') {
        const result = await this.crmService.findAllLeads(
          user,
          undefined,
          listOpts,
        );
        return this.normalizePagedResult(module, result, page, pageSize);
      }
      if (module === 'contacts') {
        const result = await this.crmService.findAllContacts(user, listOpts);
        return this.normalizePagedResult(module, result, page, pageSize);
      }
      return this.listPlatformOpportunitiesDynamic(user, filters, opts);
    }

    const memberIds = (segment.members ?? [])
      .filter((m) => m.module === module)
      .map((m) => m.entityId);

    if (!memberIds.length) {
      return { module, data: [], total: 0, page, pageSize };
    }

    const accessFilter = this.buildAccessFilter(module, user);
    const baseClauses: Record<string, unknown>[] = [
      { _id: { $in: memberIds } },
    ];
    if (Object.keys(accessFilter).length) baseClauses.push(accessFilter);
    let filter: Record<string, unknown> =
      baseClauses.length === 1
        ? baseClauses[0]
        : { $and: baseClauses };
    if (opts?.search?.trim()) {
      const q = opts.search.trim();
      const rx = new RegExp(
        q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      const searchOr =
        module === 'platform-opportunities'
          ? [
              { title: rx },
              { opportunitySourcePlatform: rx },
              { platformClientLabel: rx },
              { notes: rx },
            ]
          : [
              { firstName: rx },
              { lastName: rx },
              { email: rx },
              { organization: rx },
            ];
      filter = {
        $and: [filter, { $or: searchOr }],
      };
    }

    const skip = (page - 1) * pageSize;
    const mongoFilter = filter as Record<string, any>;
    const model = this.modelForModule(module);
    const select =
      module === 'platform-opportunities'
        ? '_id title opportunitySourcePlatform platformClientLabel platformEngagementStatus stage ownerLabel createdAt'
        : module === 'leads'
          ? '_id firstName lastName email organization status stage leadOwner createdAt'
          : '_id firstName lastName email organization status stage leadOwner jobTitle createdAt';
    const [data, total] = await Promise.all([
      model
        .find(mongoFilter)
        .select(select)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      model.countDocuments(mongoFilter),
    ]);
    return { module, data, total, page, pageSize };
  }

  private normalizePagedResult(
    module: CrmSegmentMemberModule,
    result: any,
    page: number,
    pageSize: number,
  ) {
    if (result && typeof result === 'object' && 'data' in result) {
      return {
        module,
        data: result.data,
        total: result.total,
        page,
        pageSize,
      };
    }
    const arr = Array.isArray(result) ? result : [];
    return { module, data: arr, total: arr.length, page: 1, pageSize: arr.length };
  }

  private async listPlatformOpportunitiesDynamic(
    user: any,
    filters: CrmFilterCriterion[],
    opts?: { page?: number; pageSize?: number; search?: string },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts?.pageSize ?? 50), 200);
    const accessFilter = this.buildAccessFilter('platform-opportunities', user);
    let filter: Record<string, unknown> = { ...accessFilter };
    filter = appendCrmListFilters(filter, filters, 'platform-opportunities');
    if (opts?.search?.trim()) {
      const rx = new RegExp(
        opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter = {
        $and: [
          filter,
          {
            $or: [
              { title: rx },
              { opportunitySourcePlatform: rx },
              { platformClientLabel: rx },
              { notes: rx },
            ],
          },
        ],
      };
    }
    const skip = (page - 1) * pageSize;
    const mongoFilter = filter as Record<string, any>;
    const [data, total] = await Promise.all([
      this.platformOpportunityModel
        .find(mongoFilter)
        .select(
          '_id title opportunitySourcePlatform platformClientLabel platformEngagementStatus stage ownerLabel createdAt',
        )
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      this.platformOpportunityModel.countDocuments(mongoFilter),
    ]);
    return {
      module: 'platform-opportunities' as const,
      data,
      total,
      page,
      pageSize,
    };
  }

  private modelForModule(module: CrmSegmentMemberModule): Model<any> {
    if (module === 'leads') return this.leadModel;
    if (module === 'contacts') return this.contactModel;
    return this.platformOpportunityModel;
  }

  private buildAccessFilter(
    module: CrmSegmentMemberModule,
    user?: any,
  ): Record<string, unknown> {
    if (!user || hasCrmFullDataAccess(user)) return {};
    const ownerName = `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim();
    const userId = user.userId && Types.ObjectId.isValid(String(user.userId))
      ? new Types.ObjectId(String(user.userId))
      : null;

    if (module === 'platform-opportunities') {
      const mineOr: Record<string, unknown>[] = [{ ownerLabel: ownerName }];
      if (userId) {
        mineOr.push({ createdBy: userId });
        mineOr.push({ sharedWith: userId });
      }
      return { $or: mineOr };
    }

    const mineOr: Record<string, unknown>[] = [{ leadOwner: ownerName }];
    if (module === 'contacts') {
      mineOr.push({ contactOwner: ownerName } as any);
    }
    if (userId) {
      mineOr.push({ createdBy: userId } as any);
      mineOr.push({ sharedWith: userId } as any);
    }
    return { $or: mineOr };
  }

  private async assertRecordAccessible(
    module: CrmSegmentMemberModule,
    entityId: string,
    user?: any,
  ) {
    const accessFilter = this.buildAccessFilter(module, user);
    const filter: Record<string, any> = {
      _id: new Types.ObjectId(entityId),
      ...accessFilter,
    };
    const exists = await this.modelForModule(module).exists(filter);
    if (!exists) {
      throw new BadRequestException('Record not found or not accessible');
    }
  }

  private async countForModule(
    segment: CrmSegment,
    user: any,
    module: CrmSegmentMemberModule,
  ): Promise<number> {
    if (segment.listType === 'static') {
      const ids = (segment.members ?? [])
        .filter((m) => m.module === module)
        .map((m) => m.entityId);
      if (!ids.length) return 0;
      const accessFilter = this.buildAccessFilter(module, user);
      const clauses: Record<string, any>[] = [{ _id: { $in: ids } }];
      if (Object.keys(accessFilter).length) clauses.push(accessFilter);
      const q: Record<string, any> =
        clauses.length === 1 ? clauses[0] : { $and: clauses };
      return this.modelForModule(module).countDocuments(q);
    }

    const filters = this.filtersForModule(segment, module);
    if (module === 'platform-opportunities') {
      const accessFilter = this.buildAccessFilter(module, user);
      let filter: Record<string, unknown> = { ...accessFilter };
      filter = appendCrmListFilters(filter, filters, 'platform-opportunities');
      return this.platformOpportunityModel.countDocuments(
        filter as Record<string, any>,
      );
    }
    const result =
      module === 'leads'
        ? await this.crmService.findAllLeads(user, undefined, {
            filters,
            page: 1,
            pageSize: 1,
          })
        : await this.crmService.findAllContacts(user, {
            filters,
            page: 1,
            pageSize: 1,
          });
    if (result && typeof result === 'object' && 'total' in result) {
      return Number((result as { total?: number }).total) || 0;
    }
    return Array.isArray(result) ? (result as unknown[]).length : 0;
  }

  /**
   * Resolve segment members into email-campaign recipients (deduped by email; leads before contacts).
   * Platform opportunities are skipped (no email field).
   */
  async exportCampaignRecipients(
    id: string,
    user: any,
    opts?: { max?: number },
  ): Promise<{
    segmentId: string;
    segmentName: string;
    recipients: Array<{
      email: string;
      name?: string;
      module: 'leads' | 'contacts';
      entityId: string;
    }>;
    leadsScanned: number;
    contactsScanned: number;
    skippedNoEmail: number;
    truncated: boolean;
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Segment not found');
    }
    const segment = await this.segmentModel.findById(id).lean().exec();
    if (!segment) throw new NotFoundException('Segment not found');

    const max = Math.min(Math.max(opts?.max ?? 5000, 1), 10000);
    const pageSize = 200;
    const seen = new Set<string>();
    const recipients: Array<{
      email: string;
      name?: string;
      module: 'leads' | 'contacts';
      entityId: string;
    }> = [];
    let leadsScanned = 0;
    let contactsScanned = 0;
    let skippedNoEmail = 0;
    let truncated = false;

    const ingest = (
      rows: Array<Record<string, unknown>>,
      module: 'leads' | 'contacts',
    ) => {
      for (const row of rows) {
        if (module === 'leads') leadsScanned += 1;
        else contactsScanned += 1;
        const email = String(row.email || '')
          .trim()
          .toLowerCase();
        if (!email.includes('@')) {
          skippedNoEmail += 1;
          continue;
        }
        if (seen.has(email)) continue;
        seen.add(email);
        const name =
          `${String(row.firstName || '').trim()} ${String(row.lastName || '').trim()}`.trim() ||
          undefined;
        recipients.push({
          email,
          name,
          module,
          entityId: String(row._id),
        });
        if (recipients.length >= max) {
          truncated = true;
          return true;
        }
      }
      return false;
    };

    for (const module of ['leads', 'contacts'] as const) {
      let page = 1;
      while (recipients.length < max) {
        const batch = await this.listMembers(id, module, user, {
          page,
          pageSize,
        });
        const rows = (batch.data || []) as Array<Record<string, unknown>>;
        if (ingest(rows, module)) break;
        if (rows.length < pageSize || page * pageSize >= batch.total) break;
        page += 1;
      }
      if (truncated) break;
    }

    return {
      segmentId: String(segment._id),
      segmentName: segment.name,
      recipients,
      leadsScanned,
      contactsScanned,
      skippedNoEmail,
      truncated,
    };
  }
}
