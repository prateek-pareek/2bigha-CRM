import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlatformOpportunity,
  PlatformOpportunityDocument,
} from '../schemas/platform-opportunity.schema';
import { CRMService } from '../core/crm.service';
import { hasValidPlatformLeadIdentity } from '../shared/crm-person-identifiers.util';
import { isHrmsManagementAdmin } from '../../auth/hrms-management-admin.util';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import { PipelinesService } from '../core/pipelines.service';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import {
  defaultStageForPipeline,
  engagementStatusToStageName,
  normalizeStageForPipeline,
  stageNameToEngagementStatus,
} from '../shared/platform-opportunity-pipeline.util';
import { isMongoObjectIdString } from '../shared/crm-record-id.util';
import { appendCrmListFilters, parseCrmFiltersQuery } from '../shared/crm-list-filters';
import {
  buildScalableListResult,
  clampPageSize,
  CRM_DEFAULT_PAGE,
  CRM_DEFAULT_PAGE_SIZE,
  CRM_LIST_MAX_TIME_MS,
  CRM_MAX_BOARD_PAGE_SIZE,
  CRM_MAX_EXPORT_ROWS,
  ScalableListResult,
} from '../../common/lib/pagination/list-pagination';
import { countDocumentsCapped } from '../../common/lib/pagination/capped-count';

@Injectable()
export class PlatformOpportunitiesService implements OnModuleInit {
  private readonly logger = new Logger(PlatformOpportunitiesService.name);

  constructor(
    @InjectModel(PlatformOpportunity.name, 'crmConnection')
    private readonly model: Model<PlatformOpportunityDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    private readonly pipelinesService: PipelinesService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.backfillPipelineFields();
    } catch (err) {
      this.logger.warn(
        `Skipped platform opportunity pipeline backfill: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async backfillPipelineFields(): Promise<void> {
    const pipelines = await this.pipelinesService.findAll(
      'platform_opportunities',
    );
    const def = pipelines.find((p) => p.isDefault) || pipelines[0];
    const defId = (def as PipelineDocument | undefined)?._id;
    if (!defId) return;

    const stages = (def as Pipeline).stages || [];
    const cursor = this.model
      .find({
        $or: [
          { pipeline: null },
          { pipeline: { $exists: false } },
        ],
      })
      .select('_id platformEngagementStatus stage')
      .cursor();

    for await (const doc of cursor) {
      const row = doc as PlatformOpportunityDocument & {
        platformEngagementStatus?: string;
        stage?: string;
      };
      const stage =
        row.stage?.trim() ||
        engagementStatusToStageName(row.platformEngagementStatus, stages) ||
        defaultStageForPipeline(stages);
      const engagement =
        stageNameToEngagementStatus(stage) ||
        row.platformEngagementStatus ||
        'saved';
      await this.model.updateOne(
        { _id: row._id },
        {
          $set: {
            pipeline: defId,
            stage,
            platformEngagementStatus: engagement,
          },
        },
      );
    }
  }

  private async resolveDefaultPlatformPipeline(): Promise<PipelineDocument | null> {
    const pipelines = await this.pipelinesService.findAll(
      'platform_opportunities',
    );
    return (
      (pipelines.find((p) => p.isDefault) || pipelines[0] || null) as PipelineDocument | null
    );
  }

  private async loadPipeline(
    pipelineId: string | undefined,
  ): Promise<PipelineDocument | null> {
    if (pipelineId && isMongoObjectIdString(pipelineId)) {
      const p = await this.pipelinesService.findOne(pipelineId);
      if (p && (p as Pipeline).type === 'platform_opportunities') {
        return p as PipelineDocument;
      }
    }
    return this.resolveDefaultPlatformPipeline();
  }

  private buildPipelineFilter(
    pipelineId: string,
    pipelineDoc: PipelineDocument,
  ): Record<string, unknown> {
    const pid = new Types.ObjectId(pipelineId);
    if (pipelineDoc.isDefault) {
      return {
        $or: [
          { pipeline: pid },
          { pipeline: null },
          { pipeline: { $exists: false } },
        ],
      };
    }
    return { pipeline: pid };
  }

  private applyStageAndEngagement(
    payload: Record<string, unknown>,
    pipelineDoc: PipelineDocument,
    existing?: PlatformOpportunityDocument,
  ): void {
    const stages = pipelineDoc.stages || [];
    if (payload.stage !== undefined) {
      const stage = normalizeStageForPipeline(
        String(payload.stage || ''),
        stages,
      );
      payload.stage = stage;
      const mapped = stageNameToEngagementStatus(stage);
      if (mapped) payload.platformEngagementStatus = mapped;
      payload.platformLastEngagedAt = new Date();
      return;
    }
    if (payload.platformEngagementStatus !== undefined) {
      const mapped = engagementStatusToStageName(
        String(payload.platformEngagementStatus || ''),
        stages,
      );
      if (mapped) payload.stage = mapped;
      payload.platformLastEngagedAt = new Date();
      return;
    }
    if (!existing?.stage && existing?.platformEngagementStatus) {
      const mapped = engagementStatusToStageName(
        existing.platformEngagementStatus,
        stages,
      );
      if (mapped) payload.stage = mapped;
    }
  }

  private repOwnerLabelFromUser(user?: any): string {
    if (!user) return 'Unassigned';
    const first = String(user.firstName || '').trim();
    const last = String(user.lastName || '').trim();
    const name = `${first} ${last}`.trim();
    if (name) return name;
    return String(user.email || user.name || 'Unassigned').trim();
  }

  private userObjectId(user?: any): Types.ObjectId | null {
    const raw = user?.userId ?? user?._id;
    if (!raw || !Types.ObjectId.isValid(String(raw))) return null;
    return new Types.ObjectId(String(raw));
  }

  private ownershipFilter(user?: any): Record<string, unknown> {
    const ownerName = this.repOwnerLabelFromUser(user);
    const userId = this.userObjectId(user);
    const or: Record<string, unknown>[] = [{ ownerLabel: ownerName }];
    if (userId) {
      or.push({ createdBy: userId });
      or.push({ sharedWith: userId });
    }
    return { $or: or };
  }

  private canReadAll(user?: any): boolean {
    if (!user) return true;
    if (hasCrmFullDataAccess(user) || isHrmsManagementAdmin(user)) return true;
    const perms = [
      ...(Array.isArray(user.permissions) ? user.permissions : []),
      ...(Array.isArray(user.crmPermissions) ? user.crmPermissions : []),
    ];
    return perms.some(
      (p) =>
        p === 'platform-opportunities:read:all' ||
        p === 'admin:manage',
    );
  }

  private assertWrite(user?: any): void {
    if (!user) return;
    if (isHrmsManagementAdmin(user)) return;
    const perms = [
      ...(Array.isArray(user.permissions) ? user.permissions : []),
      ...(Array.isArray(user.crmPermissions) ? user.crmPermissions : []),
    ];
    if (
      perms.includes('platform-opportunities:write') ||
      perms.includes('platform-opportunities:edit')
    ) {
      return;
    }
    throw new ForbiddenException(
      'You need platform-opportunities:write to change platform opportunities.',
    );
  }

  private assertCanAccess(doc: PlatformOpportunityDocument, user?: any): void {
    if (!user || this.canReadAll(user)) return;
    const ownerName = this.repOwnerLabelFromUser(user);
    const userId = this.userObjectId(user);
    const row = doc as any;
    if (String(row.ownerLabel || '').trim() === ownerName) return;
    if (userId && String(row.createdBy || '') === String(userId)) return;
    if (
      userId &&
      Array.isArray(row.sharedWith) &&
      row.sharedWith.some((u: Types.ObjectId) => String(u) === String(userId))
    ) {
      return;
    }
    throw new ForbiddenException('You cannot access this platform opportunity.');
  }

  private normalizePayload(data: Record<string, unknown>): Record<string, unknown> {
    const out = { ...data };
    if (typeof out.title === 'string') out.title = out.title.trim();
    if (typeof out.opportunitySourcePlatform === 'string') {
      out.opportunitySourcePlatform = out.opportunitySourcePlatform.trim();
    }
    if (typeof out.platformClientLabel === 'string') {
      const v = out.platformClientLabel.trim();
      out.platformClientLabel = v || undefined;
    }
    if (typeof out.opportunityListingUrl === 'string') {
      const v = out.opportunityListingUrl.trim();
      out.opportunityListingUrl = v || undefined;
    }
    if (typeof out.notes === 'string') {
      const v = out.notes.trim();
      out.notes = v || undefined;
    }
    if (typeof out.source === 'string') {
      const v = out.source.trim();
      out.source = v || undefined;
    }
    if (out.sourceMetadata !== undefined) {
      if (typeof out.sourceMetadata === 'string') {
        const raw = String(out.sourceMetadata).trim();
        if (!raw) {
          delete out.sourceMetadata;
        } else {
          try {
            out.sourceMetadata = JSON.parse(raw);
          } catch {
            delete out.sourceMetadata;
          }
        }
      }
      // null is kept so PATCH can clear stored preview metadata
    }
    return out;
  }

  private assertIdentity(data: Record<string, unknown>): void {
    if (!hasValidPlatformLeadIdentity(data)) {
      throw new BadRequestException(
        'Choose a platform and add either a valid https listing URL or a client name on the platform.',
      );
    }
  }

  async create(data: Record<string, unknown>, user?: any): Promise<PlatformOpportunity> {
    this.assertWrite(user);
    const payload = this.normalizePayload(data);
    this.assertIdentity(payload);

    const userId = this.userObjectId(user);
    const pipelineDoc = await this.loadPipeline(
      payload.pipeline ? String(payload.pipeline) : undefined,
    );
    if (!pipelineDoc?._id) {
      throw new BadRequestException(
        'No platform opportunity pipeline configured. Add one under CRM Settings → Pipelines.',
      );
    }
    const stages = pipelineDoc.stages || [];
    const stage = normalizeStageForPipeline(
      payload.stage
        ? String(payload.stage)
        : engagementStatusToStageName(
            String(payload.platformEngagementStatus || 'saved'),
            stages,
          ),
      stages,
    );
    const engagement =
      stageNameToEngagementStatus(stage) ||
      String(payload.platformEngagementStatus || 'saved');

    const doc = await this.model.create({
      title: String(payload.title || '').trim(),
      opportunitySourcePlatform: String(
        payload.opportunitySourcePlatform || '',
      ).trim(),
      opportunityListingUrl: payload.opportunityListingUrl as string | undefined,
      platformClientLabel: payload.platformClientLabel as string | undefined,
      pipeline: pipelineDoc._id,
      stage,
      platformEngagementStatus: engagement,
      platformLastEngagedAt:
        (payload.platformLastEngagedAt as Date | undefined) || new Date(),
      notes: payload.notes as string | undefined,
      source: payload.source as string | undefined,
      sourceMetadata: payload.sourceMetadata as
        | PlatformOpportunity['sourceMetadata']
        | undefined,
      ownerLabel: this.repOwnerLabelFromUser(user),
      createdBy: userId ?? undefined,
      sharedWith: [],
    });

    await this.crmService.createActivity({
      type: 'System',
      title: 'Platform opportunity created',
      content: `Added on ${doc.opportunitySourcePlatform}: ${doc.title}`,
      relatedTo: doc._id,
      relatedType: 'PlatformOpportunity',
      author: userId,
    });

    return doc;
  }

  async findAll(
    user?: any,
    opts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      stage?: string;
      pipeline?: string;
      platform?: string;
      mine?: boolean;
      filtersStr?: string;
    },
  ): Promise<ScalableListResult<PlatformOpportunity>> {
    let filter: Record<string, unknown> = {};
    if (!this.canReadAll(user) || opts?.mine) {
      filter = this.ownershipFilter(user);
    }

    if (opts?.pipeline?.trim() && isMongoObjectIdString(opts.pipeline.trim())) {
      const pipelineDoc = await this.loadPipeline(opts.pipeline.trim());
      if (pipelineDoc) {
        const pipelineClause = this.buildPipelineFilter(
          opts.pipeline.trim(),
          pipelineDoc,
        );
        filter =
          Object.keys(filter).length > 0
            ? { $and: [filter, pipelineClause] }
            : pipelineClause;
      }
    }

    const stageFilter = opts?.stage?.trim() || '';
    if (stageFilter) {
      filter = { $and: [filter, { stage: stageFilter }] };
    } else if (opts?.status?.trim()) {
      const status = opts.status.trim();
      filter = {
        $and: [
          filter,
          {
            $or: [
              { platformEngagementStatus: status },
              {
                stage: engagementStatusToStageName(status) || status,
              },
            ],
          },
        ],
      };
    }
    if (opts?.platform?.trim()) {
      filter = {
        $and: [filter, { opportunitySourcePlatform: opts.platform.trim() }],
      };
    }
    const search = opts?.search?.trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter = {
        $and: [
          filter,
          {
            $or: [
              { title: re },
              { opportunitySourcePlatform: re },
              { platformClientLabel: re },
              { notes: re },
              { source: re },
            ],
          },
        ],
      };
    }

    if (opts?.filtersStr) {
      const parsedFilters = parseCrmFiltersQuery(opts.filtersStr);
      if (parsedFilters.length > 0) {
        filter = appendCrmListFilters(filter, parsedFilters, 'platform-opportunities');
      }
    }

    const page = Math.max(1, opts?.page ?? CRM_DEFAULT_PAGE);
    const pageSize = clampPageSize(
      opts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
      CRM_MAX_BOARD_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;
    const [data, count] = await Promise.all([
      this.model
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      countDocumentsCapped(this.model, filter),
    ]);
    return buildScalableListResult(data as PlatformOpportunity[], {
      page,
      pageSize,
      total: count.total,
      totalIsApproximate: count.approximate,
    });
  }

  async findOne(id: string, user?: any): Promise<PlatformOpportunity | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).exec();
    if (!doc) return null;
    this.assertCanAccess(doc, user);
    return doc;
  }

  async update(
    id: string,
    data: Record<string, unknown>,
    user?: any,
  ): Promise<PlatformOpportunity | null> {
    this.assertWrite(user);
    if (!Types.ObjectId.isValid(id)) return null;
    const existing = await this.model.findById(id).exec();
    if (!existing) return null;
    this.assertCanAccess(existing, user);

    const payload = this.normalizePayload(data);
    const merged = {
      ...(existing.toObject ? existing.toObject() : existing),
      ...payload,
    };
    this.assertIdentity(merged as Record<string, unknown>);

    let pipelineDoc = await this.loadPipeline(
      payload.pipeline
        ? String(payload.pipeline)
        : String((existing as any).pipeline || ''),
    );
    if (payload.pipeline && pipelineDoc?._id) {
      payload.pipeline = pipelineDoc._id;
    }

    if (pipelineDoc) {
      this.applyStageAndEngagement(payload, pipelineDoc, existing);
    }

    const updated = await this.model
      .findByIdAndUpdate(id, payload, { returnDocument: 'after' })
      .exec();
    return updated;
  }

  async remove(id: string, user?: any): Promise<boolean> {
    this.assertWrite(user);
    if (!Types.ObjectId.isValid(id)) return false;
    const existing = await this.model.findById(id).exec();
    if (!existing) return false;
    this.assertCanAccess(existing, user);
    await this.model
      .findByIdAndUpdate(id, softDeleteUpdate(user?.userId), { new: true })
      .exec();
    return true;
  }

  async bulkRemove(ids: string[], user?: any): Promise<{ deletedCount: number }> {
    this.assertWrite(user);
    const validIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!validIds.length) return { deletedCount: 0 };

    const docs = await this.model.find({ _id: { $in: validIds } }).exec();
    for (const doc of docs) {
      this.assertCanAccess(doc, user);
    }
    const result = await this.model
      .updateMany({ _id: { $in: validIds } }, softDeleteUpdate(user?.userId))
      .exec();
    return { deletedCount: result.modifiedCount ?? 0 };
  }

  async exportToCsv(user?: any): Promise<string> {
    let filter: Record<string, unknown> = {};
    if (!this.canReadAll(user)) {
      filter = this.ownershipFilter(user);
    }
    const rows = (await this.model
      .find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(CRM_MAX_EXPORT_ROWS)
      .maxTimeMS(CRM_LIST_MAX_TIME_MS)
      .lean()
      .exec()) as PlatformOpportunity[];
    const headers = [
      'title',
      'opportunitySourcePlatform',
      'platformClientLabel',
      'platformEngagementStatus',
      'stage',
      'pipeline',
      'opportunityListingUrl',
      'ownerLabel',
      'notes',
      'source',
      'createdAt',
      'updatedAt',
    ];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => escape((row as unknown as Record<string, unknown>)[h])).join(','),
      ),
    ];
    return lines.join('\n');
  }
}
