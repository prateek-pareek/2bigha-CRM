import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as XLSX from 'xlsx';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { PipelinesService } from '../core/pipelines.service';
import {
  assignUniqueRecordId,
  isMongoObjectIdString,
} from '../shared/crm-record-id.util';
import {
  linkedInProfileKey,
  normalizeEmail,
  normalizePhoneDigits,
} from '../shared/crm-person-identifiers.util';
import {
  extractEmailDomain,
  isCorporateEmailDomain,
  normalizeDomainKey,
  organizationDomainMatchFilter,
  websiteFromDomain,
} from '../shared/crm-email-domain.util';
import { mergePersonEmailFields } from '../shared/crm-duplicate.util';
import {
  CrmMigrationJob,
  CrmMigrationJobDocument,
} from './schemas/migration-job.schema';
import {
  CrmMigrationIdMap,
  CrmMigrationIdMapDocument,
} from './schemas/migration-id-map.schema';
import {
  CrmMigrationTouch,
  CrmMigrationTouchDocument,
  MigrationTouchOutcome,
} from './schemas/migration-touch.schema';
import {
  CanonicalActivity,
  CanonicalAssociation,
  CanonicalDeal,
  CanonicalOrganization,
  CanonicalPerson,
  CrmAssociationObjectType,
  CrmMigrationDuplicateStrategy,
  CrmMigrationEntityType,
  CrmMigrationPlatform,
  FieldMapping,
  MIGRATION_BATCH_SIZE,
  MIGRATION_ENTITY_ORDER,
  MIGRATION_MAX_BATCH_PAYLOAD,
  defaultActivityTypeForEntity,
  isActivityEntityType,
} from './migration.types';
import {
  mapRowToCanonical,
  PLATFORM_META,
  suggestMapping,
  targetFieldsForEntity,
} from './platform-mappers';
import { AppCacheService } from '../../redis/app-cache.service';

type Row = Record<string, unknown>;

const RELATED_TYPE_LABEL: Record<CrmAssociationObjectType, string> = {
  organizations: 'Organization',
  contacts: 'Contact',
  leads: 'Lead',
  deals: 'Deal',
};

function leanPrevious(doc: unknown): Record<string, unknown> | null {
  if (!doc || typeof doc !== 'object') return null;
  const raw =
    typeof (doc as { toObject?: () => Record<string, unknown> }).toObject ===
    'function'
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(doc as Record<string, unknown>) };
  const copy = { ...raw };
  delete copy.__v;
  return copy;
}

@Injectable()
export class CrmMigrationService {
  constructor(
    @InjectModel(CrmMigrationJob.name, 'crmConnection')
    private readonly jobModel: Model<CrmMigrationJobDocument>,
    @InjectModel(CrmMigrationIdMap.name, 'crmConnection')
    private readonly idMapModel: Model<CrmMigrationIdMapDocument>,
    @InjectModel(CrmMigrationTouch.name, 'crmConnection')
    private readonly touchModel: Model<CrmMigrationTouchDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private readonly dealModel: Model<DealDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly pipelinesService: PipelinesService,
    private readonly appCache: AppCacheService,
  ) {}

  listPlatforms() {
    return (Object.keys(PLATFORM_META) as CrmMigrationPlatform[]).map(
      (id) => ({
        id,
        ...PLATFORM_META[id],
        entities: MIGRATION_ENTITY_ORDER,
      }),
    );
  }

  getEntityTargets(entityType: CrmMigrationEntityType) {
    return {
      entityType,
      fields: targetFieldsForEntity(entityType),
      recommendedOrder: MIGRATION_ENTITY_ORDER,
    };
  }

  parseFileToRows(buffer: Buffer): { headers: string[]; rows: Row[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      defval: '',
      raw: false,
    });
    const headers =
      rows.length > 0
        ? Object.keys(rows[0])
        : ((XLSX.utils.sheet_to_json(sheet, {
            header: 1,
          })[0] as string[]) || []);
    return { headers, rows };
  }

  previewFile(
    buffer: Buffer,
    platform: CrmMigrationPlatform,
    entityType: CrmMigrationEntityType,
  ) {
    const { headers, rows } = this.parseFileToRows(buffer);
    const suggestedMapping = suggestMapping(headers, entityType, platform);
    const sample = rows.slice(0, 5).map((row) =>
      mapRowToCanonical(row, platform, entityType, suggestedMapping),
    );
    return {
      platform,
      entityType,
      headers,
      rowCount: rows.length,
      suggestedMapping,
      targetFields: targetFieldsForEntity(entityType),
      sampleCanonical: sample.filter(Boolean),
      recommendedOrder: MIGRATION_ENTITY_ORDER,
      tip: PLATFORM_META[platform]?.recommendedOrder,
    };
  }

  async createJob(opts: {
    platform: CrmMigrationPlatform;
    entityType: CrmMigrationEntityType;
    mapping?: FieldMapping;
    duplicateStrategy?: CrmMigrationDuplicateStrategy;
    user?: any;
    sourceFileName?: string;
    totalHint?: number;
  }) {
    const platform = this.normalizePlatform(opts.platform);
    const entityType = this.normalizeEntity(opts.entityType);
    const strategy = this.normalizeStrategy(opts.duplicateStrategy);
    const job = await this.jobModel.create({
      platform,
      entityType,
      status: 'pending',
      duplicateStrategy: strategy,
      mapping: opts.mapping || {},
      total: opts.totalHint || 0,
      createdBy: opts.user?._id || opts.user?.userId,
      sourceFileName: opts.sourceFileName,
      errorSamples: [],
    });
    return this.serializeJob(job);
  }

  async getJob(jobId: string) {
    const job = await this.findJob(jobId);
    return this.serializeJob(job);
  }

  async listJobs(limit = 25) {
    const take = Math.min(100, Math.max(1, Number(limit) || 25));
    const jobs = await this.jobModel
      .find()
      .sort({ createdAt: -1 })
      .limit(take)
      .exec();
    return jobs.map((j) => this.serializeJob(j));
  }

  /**
   * Undo a migration job: restore overwritten records; delete ones this job created.
   * Side-effect association edits are undone via pre-write snapshots of those docs.
   */
  async revertJob(jobId: string): Promise<{
    jobId: string;
    restored: number;
    deleted: number;
    status: string;
  }> {
    const job = await this.findJob(jobId);
    if (job.status === 'reverted') {
      throw new BadRequestException('This migration was already reverted');
    }
    if ((job.processed || 0) === 0 && (job.successCount || 0) === 0) {
      throw new BadRequestException('Nothing to revert — job has no writes');
    }

    // Stop an in-flight processor before rolling back what landed so far.
    if (job.status === 'processing' || job.status === 'pending') {
      job.status = 'cancelled';
      await job.save();
    }

    const oid = job._id as Types.ObjectId;
    const touches = await this.touchModel.find({ jobId: oid }).lean().exec();
    if (!touches.length) {
      throw new BadRequestException(
        'No snapshots found for this job. Only migrations run after revert support was added can be undone.',
      );
    }

    let restored = 0;
    let deleted = 0;
    const deletedMongoIds: string[] = [];

    // Restore first so side-doc association snapshots come back before deletes.
    for (const touch of touches) {
      if (touch.previous == null) continue;
      const model = this.modelForEntity(
        touch.entityType as CrmMigrationEntityType,
      );
      const prev = { ...touch.previous } as Record<string, unknown>;
      const prevId = prev._id;
      delete prev._id;
      delete prev.__v;

      const current = await model.findById(touch.docId).exec();
      if (current) {
        await model.replaceOne({ _id: touch.docId }, prev as any).exec();
      } else {
        await model.create({
          ...prev,
          _id: prevId || touch.docId,
        } as any);
      }
      restored += 1;
    }

    for (const touch of touches) {
      if (touch.previous != null) continue;
      const model = this.modelForEntity(
        touch.entityType as CrmMigrationEntityType,
      );
      const res = await model.deleteOne({ _id: touch.docId }).exec();
      if (Number(res.deletedCount || 0) > 0) {
        deleted += 1;
        deletedMongoIds.push(String(touch.docId));
      }
    }

    if (deletedMongoIds.length) {
      await this.idMapModel
        .deleteMany({ mongoId: { $in: deletedMongoIds } })
        .exec();
    }

    await this.touchModel.deleteMany({ jobId: oid }).exec();

    job.status = 'reverted';
    job.revertedAt = new Date();
    job.revertRestoredCount = restored;
    job.revertDeletedCount = deleted;
    await job.save();

    await this.bustCaches(job.entityType);

    return {
      jobId: String(oid),
      restored,
      deleted,
      status: 'reverted',
    };
  }

  /**
   * Record the pre-job state of a document the first time this job touches it.
   * Later writes to the same doc keep the original snapshot ($setOnInsert).
   */
  private async rememberTouch(
    jobId: Types.ObjectId | undefined,
    entityType: string,
    docId: Types.ObjectId | string,
    outcome: MigrationTouchOutcome,
    previous: Record<string, unknown> | null,
  ) {
    if (!jobId || !docId) return;
    const id =
      typeof docId === 'string' ? new Types.ObjectId(docId) : docId;
    await this.touchModel
      .updateOne(
        { jobId, docId: id },
        {
          $setOnInsert: {
            jobId,
            entityType,
            docId: id,
            outcome,
            previous,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /** Snapshot a side-effect target (e.g. org when linking a contact) before $addToSet. */
  private async rememberExistingDocTouch(
    jobId: Types.ObjectId | undefined,
    entityType: CrmAssociationObjectType | 'activities',
    docId: Types.ObjectId,
  ) {
    if (!jobId) return;
    const already = await this.touchModel
      .exists({ jobId, docId })
      .exec();
    if (already) return;
    const model = this.modelForEntity(entityType);
    const lean = (await model.findById(docId).lean().exec()) as Record<
      string,
      unknown
    > | null;
    if (!lean) return;
    await this.rememberTouch(
      jobId,
      entityType,
      docId,
      'merged',
      leanPrevious(lean),
    );
  }

  /**
   * Start a file-based migration: parses Excel/CSV then processes in batches.
   */
  async startFileJob(opts: {
    platform: CrmMigrationPlatform;
    entityType: CrmMigrationEntityType;
    buffer: Buffer;
    mapping?: FieldMapping;
    duplicateStrategy?: CrmMigrationDuplicateStrategy;
    user?: any;
    sourceFileName?: string;
  }) {
    const { headers, rows } = this.parseFileToRows(opts.buffer);
    if (!rows.length) {
      throw new BadRequestException('File has no data rows');
    }
    const platform = this.normalizePlatform(opts.platform);
    const entityType = this.normalizeEntity(opts.entityType);
    const mapping =
      opts.mapping && Object.keys(opts.mapping).length
        ? opts.mapping
        : suggestMapping(headers, entityType, platform);

    const job = await this.jobModel.create({
      platform,
      entityType,
      status: 'processing',
      duplicateStrategy: this.normalizeStrategy(opts.duplicateStrategy),
      mapping,
      total: rows.length,
      createdBy: opts.user?._id || opts.user?.userId,
      sourceFileName: opts.sourceFileName,
      errorSamples: [],
    });

    void this.processRowsInBatches(String(job._id), rows).catch(
      async (err: Error) => {
        await this.jobModel.updateOne(
          { _id: job._id },
          {
            status: 'failed',
            error: err?.message || 'Migration failed',
          },
        );
      },
    );

    return {
      ...this.serializeJob(job),
      headers,
      suggestedMapping: mapping,
    };
  }

  /**
   * Push a JSON batch (for custom CRMs / crore-scale streaming ingest).
   * Body rows may be raw source rows (mapped via job.mapping) or already-canonical.
   */
  async ingestBatch(
    jobId: string,
    rows: Row[],
    opts?: { alreadyCanonical?: boolean },
  ) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('rows array is required');
    }
    if (rows.length > MIGRATION_MAX_BATCH_PAYLOAD) {
      throw new BadRequestException(
        `Batch too large (max ${MIGRATION_MAX_BATCH_PAYLOAD} rows)`,
      );
    }
    const job = await this.findJob(jobId);
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new BadRequestException(`Job is ${job.status}`);
    }
    if (job.status === 'pending') {
      job.status = 'processing';
    }
    job.total = (job.total || 0) + rows.length;
    job.batchCount = (job.batchCount || 0) + 1;
    await job.save();

    const result = await this.processBatch(job, rows, opts?.alreadyCanonical);
    return {
      job: this.serializeJob(await this.findJob(jobId)),
      batch: result,
    };
  }

  async completeJob(jobId: string) {
    const job = await this.findJob(jobId);
    if (job.status === 'processing' || job.status === 'pending') {
      job.status = 'completed';
      await job.save();
    }
    await this.bustCaches(job.entityType);
    return this.serializeJob(job);
  }

  private async processRowsInBatches(jobId: string, rows: Row[]) {
    const job = await this.findJob(jobId);
    for (let i = 0; i < rows.length; i += MIGRATION_BATCH_SIZE) {
      const slice = rows.slice(i, i + MIGRATION_BATCH_SIZE);
      const fresh = await this.findJob(jobId);
      if (fresh.status === 'cancelled') return;
      await this.processBatch(fresh, slice, false);
    }
    const done = await this.findJob(jobId);
    if (done.status === 'processing') {
      done.status = 'completed';
      await done.save();
    }
    await this.bustCaches(done.entityType);
  }

  private async processBatch(
    job: CrmMigrationJobDocument,
    rows: Row[],
    alreadyCanonical?: boolean,
  ) {
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let merged = 0;
    let created = 0;
    const samples: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const canonical = alreadyCanonical
          ? (rows[i] as any)
          : mapRowToCanonical(
              rows[i],
              job.platform,
              job.entityType,
              job.mapping,
            );
        if (!canonical) {
          skipped++;
          continue;
        }
        const outcome = await this.upsertCanonical(
          job.entityType,
          job.platform,
          canonical,
          job.duplicateStrategy,
          job._id as Types.ObjectId,
        );
        if (outcome === 'skipped') skipped++;
        else if (outcome === 'merged') {
          merged++;
          success++;
        } else {
          created++;
          success++;
        }
      } catch (err: any) {
        failed++;
        if (samples.length < 20) {
          samples.push(
            `row ${job.processed + i + 1}: ${err?.message || 'failed'}`,
          );
        }
      }
    }

    job.processed = (job.processed || 0) + rows.length;
    job.successCount = (job.successCount || 0) + success;
    job.failedCount = (job.failedCount || 0) + failed;
    job.skippedCount = (job.skippedCount || 0) + skipped;
    job.mergedCount = (job.mergedCount || 0) + merged;
    job.createdCount = (job.createdCount || 0) + created;
    if (samples.length) {
      job.errorSamples = [...(job.errorSamples || []), ...samples].slice(-40);
    }
    await job.save();

    return { success, failed, skipped, merged, created };
  }

  private async upsertCanonical(
    entity: CrmMigrationEntityType,
    platform: CrmMigrationPlatform,
    record: any,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    switch (entity) {
      case 'organizations':
        return this.upsertOrganization(platform, record, strategy, jobId);
      case 'contacts':
        return this.upsertPerson('contacts', platform, record, strategy, jobId);
      case 'leads':
        return this.upsertPerson('leads', platform, record, strategy, jobId);
      case 'deals':
        return this.upsertDeal(platform, record, strategy, jobId);
      case 'associations':
        return this.upsertAssociation(platform, record, strategy, jobId);
      default:
        if (isActivityEntityType(entity)) {
          return this.upsertActivity(platform, entity, record, strategy, jobId);
        }
        throw new BadRequestException(`Unsupported entity ${entity}`);
    }
  }

  private async rememberId(
    platform: CrmMigrationPlatform,
    entityType: CrmAssociationObjectType,
    externalId: string | undefined,
    mongoId: Types.ObjectId | string,
    displayName?: string,
    recordId?: string,
  ) {
    if (!externalId?.trim()) return;
    await this.idMapModel
      .updateOne(
        {
          platform,
          entityType,
          externalId: externalId.trim(),
        },
        {
          $set: {
            mongoId: String(mongoId),
            displayName,
            recordId,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private async resolveMappedId(
    platform: CrmMigrationPlatform,
    entityType: CrmAssociationObjectType,
    externalId?: string,
  ): Promise<Types.ObjectId | null> {
    if (!externalId?.trim()) return null;
    const id = externalId.trim();
    const mapped = await this.idMapModel
      .findOne({ platform, entityType, externalId: id })
      .lean()
      .exec();
    if (mapped?.mongoId && Types.ObjectId.isValid(mapped.mongoId)) {
      return new Types.ObjectId(mapped.mongoId);
    }
    const filter = this.externalIdFilter(platform, entityType, id);
    if (!filter) return null;
    const model = this.modelForEntity(entityType);
    const doc = await model.findOne(filter).select('_id').lean().exec();
    if (doc?._id) {
      await this.rememberId(platform, entityType, id, doc._id as Types.ObjectId);
      return doc._id as Types.ObjectId;
    }
    return null;
  }

  private async resolveManyIds(
    platform: CrmMigrationPlatform,
    entityType: CrmAssociationObjectType,
    externalIds?: string[],
  ): Promise<Types.ObjectId[]> {
    const out: Types.ObjectId[] = [];
    for (const id of externalIds || []) {
      const resolved = await this.resolveMappedId(platform, entityType, id);
      if (resolved) out.push(resolved);
    }
    return out;
  }

  private mergeObjectIdLists(
    existing: Types.ObjectId[] | undefined,
    incoming: Types.ObjectId[],
  ): Types.ObjectId[] {
    return [
      ...new Set([
        ...((existing || []) as Types.ObjectId[]).map(String),
        ...incoming.map(String),
      ]),
    ].map((id) => new Types.ObjectId(id));
  }

  private mergeCustomFields(
    existing: Record<string, unknown> | undefined,
    incoming: Record<string, unknown> | undefined,
    sourcePayload?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(existing || {}),
      ...(incoming || {}),
      ...(sourcePayload ? { _sourcePayload: sourcePayload } : {}),
    };
  }

  private externalIdFilter(
    platform: CrmMigrationPlatform,
    entity: CrmMigrationEntityType | CrmAssociationObjectType,
    externalId?: string,
  ): Record<string, unknown> | null {
    if (!externalId?.trim()) return null;
    const id = externalId.trim();
    if (entity === 'organizations') {
      return {
        $or: [
          { recordId: id },
          { 'customFields.hubspot_company_id': id },
          { 'customFields.salesforce_account_id': id },
          { 'customFields.zoho_account_id': id },
          { [`customFields.${platform}_company_id`]: id },
          { 'customFields._sourcePayload.id': id },
          { 'customFields._sourcePayload.Id': id },
        ],
      };
    }
    if (entity === 'contacts') {
      return {
        $or: [
          { recordId: id },
          { 'customFields.hubspot_contact_id': id },
          { [`customFields.${platform}_contact_id`]: id },
          { 'customFields._sourcePayload.id': id },
          { 'customFields._sourcePayload.Id': id },
        ],
      };
    }
    if (entity === 'leads') {
      return {
        $or: [
          { recordId: id },
          { [`customFields.${platform}_lead_id`]: id },
          { 'customFields.hubspot_contact_id': id },
          { 'customFields._sourcePayload.id': id },
          { 'customFields._sourcePayload.Id': id },
        ],
      };
    }
    if (entity === 'deals') {
      return {
        $or: [
          { recordId: id },
          { 'customFields.hubspot_deal_id': id },
          { 'customFields.salesforce_opportunity_id': id },
          { [`customFields.${platform}_deal_id`]: id },
          { 'customFields._sourcePayload.id': id },
          { 'customFields._sourcePayload.Id': id },
        ],
      };
    }
    if (isActivityEntityType(entity as CrmMigrationEntityType) || entity === 'notes') {
      return {
        $or: [
          { 'metadata.sourceExternalId': id },
          { 'metadata._sourcePayload.id': id },
        ],
      };
    }
    return { recordId: id };
  }

  private async upsertOrganization(
    platform: CrmMigrationPlatform,
    rec: CanonicalOrganization,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    const extFilter = this.externalIdFilter(
      platform,
      'organizations',
      rec.externalId,
    );
    let existing: any = null;
    if (extFilter) existing = await this.organizationModel.findOne(extFilter).exec();
    // Domain / website match before bare name — avoids duplicate companies from email sync.
    if (!existing) {
      const domain =
        normalizeDomainKey(rec.website) ||
        (isCorporateEmailDomain(rec.email)
          ? extractEmailDomain(rec.email)
          : null) ||
        normalizeDomainKey(
          String((rec.customFields as any)?.email_domain || ''),
        );
      if (domain) {
        const filter = organizationDomainMatchFilter(domain);
        if (filter) {
          existing = await this.organizationModel.findOne(filter).exec();
        }
      }
    }
    if (!existing && rec.name?.trim()) {
      existing = await this.organizationModel
        .findOne({
          name: new RegExp(
            `^${rec.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        })
        .exec();
    }

    const relatedContacts = await this.resolveManyIds(
      platform,
      'contacts',
      rec.relatedContactExternalIds,
    );
    const relatedDeals = await this.resolveManyIds(
      platform,
      'deals',
      rec.relatedDealExternalIds,
    );

    const domainForMarker =
      normalizeDomainKey(rec.website) ||
      (isCorporateEmailDomain(rec.email)
        ? extractEmailDomain(rec.email)
        : null) ||
      normalizeDomainKey(String((rec.customFields as any)?.email_domain || ''));

    const customFields = this.mergeCustomFields(
      existing?.customFields,
      rec.customFields,
      rec.sourcePayload,
    );
    if (domainForMarker && !(customFields as any).email_domain) {
      (customFields as any).email_domain = domainForMarker;
    }

    const payload: Record<string, unknown> = {
      name: rec.name,
      website: rec.website || (domainForMarker ? websiteFromDomain(domainForMarker) : undefined),
      phone: rec.phone,
      email: rec.email,
      industry: rec.industry,
      territory: rec.territory,
      noOfEmployees: rec.noOfEmployees,
      annualRevenue: rec.annualRevenue,
      address: rec.address,
      customFields,
      associatedContacts: this.mergeObjectIdLists(
        existing?.associatedContacts,
        relatedContacts,
      ),
      associatedDeals: this.mergeObjectIdLists(
        existing?.associatedDeals,
        relatedDeals,
      ),
    };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });

    const finish = async (
      mongoId: Types.ObjectId,
      recordId?: string,
      outcome: 'created' | 'merged' = 'merged',
      previous: Record<string, unknown> | null = null,
    ) => {
      await this.rememberTouch(
        jobId,
        'organizations',
        mongoId,
        outcome,
        previous,
      );
      await this.rememberId(
        platform,
        'organizations',
        rec.externalId,
        mongoId,
        rec.name,
        recordId,
      );
      return outcome;
    };

    if (existing) {
      if (strategy === 'skip') {
        await this.rememberId(
          platform,
          'organizations',
          rec.externalId,
          existing._id,
          rec.name,
          existing.recordId,
        );
        return 'skipped';
      }
      if (strategy !== 'create') {
        if (strategy === 'merge') {
          for (const [k, v] of Object.entries(payload)) {
            if (
              k === 'customFields' ||
              k === 'associatedContacts' ||
              k === 'associatedDeals'
            ) {
              continue;
            }
            if (
              existing[k] != null &&
              String(existing[k]).trim() !== '' &&
              v != null
            ) {
              delete payload[k];
            }
          }
        }
        const prev = leanPrevious(existing);
        await this.organizationModel
          .updateOne({ _id: existing._id }, { $set: payload })
          .exec();
        return finish(existing._id, existing.recordId, 'merged', prev);
      }
    }

    const doc = new this.organizationModel(payload);
    const rid = await assignUniqueRecordId(
      this.organizationModel,
      rec.externalId || null,
    );
    if (!rid.ok && rec.externalId) {
      const byRid = await this.organizationModel
        .findOne({ recordId: rec.externalId })
        .exec();
      if (byRid) {
        if (strategy === 'skip') return 'skipped';
        const prev = leanPrevious(byRid);
        await this.organizationModel
          .updateOne({ _id: byRid._id }, { $set: payload })
          .exec();
        return finish(byRid._id, byRid.recordId, 'merged', prev);
      }
    }
    if (rid.ok) doc.recordId = rid.recordId;
    else {
      const gen = await assignUniqueRecordId(this.organizationModel, null);
      if (gen.ok) doc.recordId = gen.recordId;
    }
    await doc.save();
    return finish(doc._id as Types.ObjectId, doc.recordId, 'created', null);
  }

  private async resolveOrganizationId(
    platform: CrmMigrationPlatform,
    name?: string,
    externalId?: string,
    website?: string,
  ): Promise<Types.ObjectId | null> {
    const byExt = await this.resolveMappedId(
      platform,
      'organizations',
      externalId,
    );
    if (byExt) return byExt;
    const domain = normalizeDomainKey(website);
    if (domain) {
      const filter = organizationDomainMatchFilter(domain);
      if (filter) {
        const byDomain = await this.organizationModel
          .findOne(filter)
          .select('_id')
          .lean()
          .exec();
        if (byDomain?._id) return byDomain._id as Types.ObjectId;
      }
    }
    if (name?.trim()) {
      const byName = await this.organizationModel
        .findOne({
          name: new RegExp(
            `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        })
        .select('_id')
        .lean()
        .exec();
      if (byName?._id) return byName._id as Types.ObjectId;
    }
    return null;
  }

  private async upsertPerson(
    entity: 'contacts' | 'leads',
    platform: CrmMigrationPlatform,
    rec: CanonicalPerson,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    const model = (
      entity === 'contacts' ? this.contactModel : this.leadModel
    ) as Model<any>;
    const extFilter = this.externalIdFilter(platform, entity, rec.externalId);
    let existing: any = null;
    if (extFilter) existing = await model.findOne(extFilter).exec();
    const email = normalizeEmail(rec.email || '');
    const additionalEmails = (rec.additionalEmails || [])
      .map((e) => normalizeEmail(e))
      .filter(Boolean);
    if (!existing && email) {
      existing = await model
        .findOne({
          $or: [{ email }, { additionalEmails: email }],
        })
        .exec();
    }
    if (!existing) {
      for (const ae of additionalEmails) {
        existing = await model
          .findOne({
            $or: [{ email: ae }, { additionalEmails: ae }],
          })
          .exec();
        if (existing) break;
      }
    }
    if (!existing) {
      const li = linkedInProfileKey(rec.linkedinUrl);
      if (li) {
        // Match stored LinkedIn URLs that contain the same /in/slug
        existing = await model
          .findOne({
            linkedinUrl: { $regex: new RegExp(`/in/${li.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|\\?|#|$)`, 'i') },
          })
          .exec();
      }
    }
    if (!existing) {
      const phones = [
        normalizePhoneDigits(rec.mobileNo),
        normalizePhoneDigits(rec.phone),
      ].filter((p) => p.length >= 7);
      const first = String(rec.firstName || '')
        .trim()
        .toLowerCase();
      const last = String(rec.lastName || '')
        .trim()
        .toLowerCase();
      for (const digits of phones) {
        const re = new RegExp(digits.split('').join('\\D*'));
        const candidates = await model
          .find({
            $or: [{ mobileNo: { $regex: re } }, { phone: { $regex: re } }],
          })
          .limit(5)
          .exec();
        for (const cand of candidates) {
          if (!first && !last) {
            existing = cand;
            break;
          }
          const cf = String(cand.firstName || '')
            .trim()
            .toLowerCase();
          const cl = String(cand.lastName || '')
            .trim()
            .toLowerCase();
          if ((first && cf === first) || (last && cl === last)) {
            existing = cand;
            break;
          }
        }
        if (existing) break;
      }
    }

    const orgIds = await this.resolveManyIds(
      platform,
      'organizations',
      [
        ...(rec.organizationExternalId ? [rec.organizationExternalId] : []),
        ...(rec.organizationExternalIds || []),
      ],
    );
    if (!orgIds.length && rec.organizationName) {
      const one = await this.resolveOrganizationId(
        platform,
        rec.organizationName,
        undefined,
      );
      if (one) orgIds.push(one);
    }
    // Corporate email domain → reuse/create company association when no org mapped
    if (!orgIds.length && email && isCorporateEmailDomain(email)) {
      const domain = extractEmailDomain(email);
      if (domain) {
        const filter = organizationDomainMatchFilter(domain);
        if (filter) {
          const byDomain = await this.organizationModel
            .findOne(filter)
            .select('_id')
            .lean()
            .exec();
          if (byDomain?._id) orgIds.push(byDomain._id as Types.ObjectId);
        }
      }
    }
    const relatedContacts = await this.resolveManyIds(
      platform,
      'contacts',
      rec.relatedContactExternalIds,
    );
    const relatedDeals = await this.resolveManyIds(
      platform,
      'deals',
      rec.relatedDealExternalIds,
    );
    const relatedLeads = await this.resolveManyIds(
      platform,
      'leads',
      rec.relatedLeadExternalIds,
    );

    const pipelines = await this.pipelinesService.findAll(
      entity === 'leads' ? 'leads' : 'leads',
    );
    const defaultPipeline =
      pipelines.find((p) => (p as any).isDefault) || pipelines[0];

    let mergedAdditional = additionalEmails;
    if (existing && strategy === 'merge') {
      const emailMerge = mergePersonEmailFields(
        {
          email: existing.email,
          additionalEmails: existing.additionalEmails,
        },
        [{ email, additionalEmails }],
      );
      mergedAdditional = emailMerge.additionalEmails;
    } else if (existing && strategy === 'replace') {
      mergedAdditional = additionalEmails;
    } else if (existing) {
      mergedAdditional = [
        ...new Set([
          ...(existing.additionalEmails || []).map((e: string) =>
            normalizeEmail(e),
          ),
          ...additionalEmails,
        ]),
      ].filter((e) => e && e !== (email || normalizeEmail(existing.email)));
    }

    const payload: Record<string, unknown> = {
      firstName: rec.firstName,
      lastName: rec.lastName,
      email: email || rec.email,
      additionalEmails: mergedAdditional.length ? mergedAdditional : undefined,
      mobileNo: rec.mobileNo,
      phone: rec.phone,
      jobTitle: rec.jobTitle,
      organization: rec.organizationName,
      website: rec.website,
      linkedinUrl: rec.linkedinUrl,
      industry: rec.industry,
      territory: rec.territory,
      source: rec.source,
      status: rec.status,
      stage: rec.stage,
      leadOwner: rec.ownerLabel,
      annualRevenue: rec.annualRevenue,
      noOfEmployees: rec.noOfEmployees,
      customFields: this.mergeCustomFields(
        existing?.customFields,
        rec.customFields,
        rec.sourcePayload,
      ),
      associatedOrganizations: this.mergeObjectIdLists(
        existing?.associatedOrganizations,
        orgIds,
      ),
      associatedContacts: this.mergeObjectIdLists(
        existing?.associatedContacts,
        relatedContacts,
      ),
      associatedDeals: this.mergeObjectIdLists(
        existing?.associatedDeals,
        relatedDeals,
      ),
      associatedLeads: this.mergeObjectIdLists(
        existing?.associatedLeads,
        relatedLeads,
      ),
    };
    if (!payload.pipeline && defaultPipeline) {
      payload.pipeline = (defaultPipeline as any)._id;
      const firstStage = (defaultPipeline as any).stages?.sort(
        (a: any, b: any) => a.order - b.order,
      )?.[0];
      if (firstStage && !payload.stage) {
        payload.stage = firstStage.name;
        payload.status = firstStage.name;
      }
    }
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });

    if (existing) {
      if (strategy === 'skip') {
        await this.rememberId(
          platform,
          entity,
          rec.externalId,
          existing._id,
          `${rec.firstName || ''} ${rec.lastName || ''}`.trim(),
          existing.recordId,
        );
        return 'skipped';
      }
      if (strategy !== 'create') {
        if (strategy === 'merge') {
          for (const [k, v] of Object.entries(payload)) {
            if (String(k).startsWith('associated') || k === 'customFields') {
              continue;
            }
            if (
              existing[k] != null &&
              String(existing[k]).trim() !== '' &&
              v != null
            ) {
              delete payload[k];
            }
          }
        }
        const prev = leanPrevious(existing);
        await model.updateOne({ _id: existing._id }, { $set: payload }).exec();
        await this.rememberTouch(jobId, entity, existing._id, 'merged', prev);
        await this.rememberId(
          platform,
          entity,
          rec.externalId,
          existing._id,
          `${rec.firstName || ''} ${rec.lastName || ''}`.trim(),
          existing.recordId,
        );
        if (entity === 'contacts') {
          for (const oid of orgIds) {
            await this.rememberExistingDocTouch(
              jobId,
              'organizations',
              oid,
            );
            await this.organizationModel
              .updateOne(
                { _id: oid },
                { $addToSet: { associatedContacts: existing._id } },
              )
              .exec();
          }
        }
        return 'merged';
      }
    }

    const doc = new model(payload);
    const rid = await assignUniqueRecordId(model as any, rec.externalId || null);
    if (rid.ok) (doc as any).recordId = rid.recordId;
    else if (rec.externalId) {
      const byRid = await model.findOne({ recordId: rec.externalId }).exec();
      if (byRid) {
        const prev = leanPrevious(byRid);
        await model.updateOne({ _id: byRid._id }, { $set: payload }).exec();
        await this.rememberTouch(jobId, entity, byRid._id, 'merged', prev);
        await this.rememberId(
          platform,
          entity,
          rec.externalId,
          byRid._id,
          `${rec.firstName || ''} ${rec.lastName || ''}`.trim(),
          byRid.recordId,
        );
        return 'merged';
      }
      const gen = await assignUniqueRecordId(model as any, null);
      if (gen.ok) (doc as any).recordId = gen.recordId;
    }
    await doc.save();
    await this.rememberTouch(
      jobId,
      entity,
      doc._id as Types.ObjectId,
      'created',
      null,
    );
    await this.rememberId(
      platform,
      entity,
      rec.externalId,
      doc._id as Types.ObjectId,
      `${rec.firstName || ''} ${rec.lastName || ''}`.trim(),
      (doc as any).recordId,
    );
    if (entity === 'contacts') {
      for (const oid of orgIds) {
        await this.rememberExistingDocTouch(jobId, 'organizations', oid);
        await this.organizationModel
          .updateOne(
            { _id: oid },
            { $addToSet: { associatedContacts: doc._id } },
          )
          .exec();
      }
    }
    return 'created';
  }

  private async upsertDeal(
    platform: CrmMigrationPlatform,
    rec: CanonicalDeal,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    const extFilter = this.externalIdFilter(platform, 'deals', rec.externalId);
    let existing: any = null;
    if (extFilter) existing = await this.dealModel.findOne(extFilter).exec();

    // Resolve contacts/orgs first so title match can be scoped (avoid false merges).
    const orgIds = await this.resolveManyIds(
      platform,
      'organizations',
      [
        ...(rec.organizationExternalId ? [rec.organizationExternalId] : []),
        ...(rec.organizationExternalIds || []),
      ],
    );
    if (!orgIds.length && rec.organizationName) {
      const one = await this.resolveOrganizationId(
        platform,
        rec.organizationName,
        undefined,
      );
      if (one) orgIds.push(one);
    }

    const contactIds = await this.resolveManyIds(
      platform,
      'contacts',
      [
        ...(rec.contactExternalId ? [rec.contactExternalId] : []),
        ...(rec.contactExternalIds || []),
      ],
    );
    if (!contactIds.length && rec.contactEmail) {
      const email = normalizeEmail(rec.contactEmail);
      if (email) {
        const c = await this.contactModel
          .findOne({
            $or: [{ email }, { additionalEmails: email }],
          })
          .select('_id')
          .lean()
          .exec();
        if (c?._id) contactIds.push(c._id as Types.ObjectId);
      }
    }

    if (!existing && rec.title?.trim()) {
      const titleRe = new RegExp(
        `^${rec.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'i',
      );
      if (contactIds[0]) {
        existing = await this.dealModel
          .findOne({
            title: titleRe,
            $or: [
              { contactPerson: contactIds[0] },
              { associatedContacts: contactIds[0] },
            ],
          })
          .exec();
      } else if (orgIds[0]) {
        existing = await this.dealModel
          .findOne({
            title: titleRe,
            $or: [
              { associatedCompanies: orgIds[0] },
              { organization: orgIds[0] },
            ],
          } as any)
          .exec();
      } else if (!rec.externalId) {
        // Bare title only when there is no external id (safer identity).
        existing = await this.dealModel.findOne({ title: titleRe } as any).exec();
      }
    }

    const leadId = await this.resolveMappedId(
      platform,
      'leads',
      rec.leadExternalId,
    );

    const pipelines = await this.pipelinesService.findAll('deals');
    const defaultPipeline =
      pipelines.find((p) => (p as any).isDefault) || pipelines[0];

    const payload: Record<string, unknown> = {
      title: rec.title,
      dealValue: rec.dealValue,
      stage: rec.stage,
      probability: rec.probability,
      organization: rec.organizationName,
      dealOwner: rec.ownerLabel,
      currency: rec.currency,
      nextStep: rec.nextStep,
      expectedClosureDate: rec.expectedClosureDate
        ? new Date(rec.expectedClosureDate)
        : undefined,
      closedDate: rec.closedDate ? new Date(rec.closedDate) : undefined,
      customFields: this.mergeCustomFields(
        existing?.customFields,
        rec.customFields,
        rec.sourcePayload,
      ),
      associatedCompanies: this.mergeObjectIdLists(
        existing?.associatedCompanies,
        orgIds,
      ),
      associatedContacts: this.mergeObjectIdLists(
        existing?.associatedContacts,
        contactIds,
      ),
    };
    if (contactIds[0]) payload.contactPerson = contactIds[0];
    if (leadId) payload.lead = leadId;
    if (!payload.pipeline && defaultPipeline) {
      payload.pipeline = (defaultPipeline as any)._id;
      const firstStage = (defaultPipeline as any).stages?.sort(
        (a: any, b: any) => a.order - b.order,
      )?.[0];
      if (firstStage && !payload.stage) payload.stage = firstStage.name;
    }
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k];
    });

    const afterSave = async (
      dealId: Types.ObjectId,
      recordId?: string,
      outcome: 'created' | 'merged' = 'merged',
      previous: Record<string, unknown> | null = null,
    ) => {
      await this.rememberTouch(jobId, 'deals', dealId, outcome, previous);
      await this.rememberId(
        platform,
        'deals',
        rec.externalId,
        dealId,
        rec.title,
        recordId,
      );
      for (const oid of orgIds) {
        await this.rememberExistingDocTouch(jobId, 'organizations', oid);
        await this.organizationModel
          .updateOne({ _id: oid }, { $addToSet: { associatedDeals: dealId } })
          .exec();
      }
      for (const cid of contactIds) {
        await this.rememberExistingDocTouch(jobId, 'contacts', cid);
        await this.contactModel
          .updateOne({ _id: cid }, { $addToSet: { associatedDeals: dealId } })
          .exec();
      }
    };

    if (existing) {
      if (strategy === 'skip') {
        await this.rememberId(
          platform,
          'deals',
          rec.externalId,
          existing._id,
          rec.title,
          existing.recordId,
        );
        return 'skipped';
      }
      if (strategy !== 'create') {
        if (strategy === 'merge') {
          for (const [k, v] of Object.entries(payload)) {
            if (
              String(k).startsWith('associated') ||
              k === 'customFields' ||
              k === 'contactPerson'
            ) {
              continue;
            }
            if (
              existing[k] != null &&
              String(existing[k]).trim() !== '' &&
              v != null
            ) {
              delete payload[k];
            }
          }
        }
        const prev = leanPrevious(existing);
        await this.dealModel
          .updateOne({ _id: existing._id }, { $set: payload })
          .exec();
        await afterSave(existing._id, existing.recordId, 'merged', prev);
        return 'merged';
      }
    }

    const doc = new this.dealModel(payload);
    const rid = await assignUniqueRecordId(
      this.dealModel,
      rec.externalId || null,
    );
    if (rid.ok) doc.recordId = rid.recordId;
    else {
      const gen = await assignUniqueRecordId(this.dealModel, null);
      if (gen.ok) doc.recordId = gen.recordId;
    }
    await doc.save();
    await afterSave(doc._id as Types.ObjectId, doc.recordId, 'created', null);
    return 'created';
  }

  private async upsertActivity(
    platform: CrmMigrationPlatform,
    entity: CrmMigrationEntityType,
    rec: CanonicalActivity,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    const activityType =
      rec.activityType || defaultActivityTypeForEntity(entity);

    let existing: any = null;
    if (rec.externalId) {
      existing = await this.activityModel
        .findOne({ 'metadata.sourceExternalId': rec.externalId })
        .exec();
    }

    const involved: { id: Types.ObjectId; type: string }[] = [];
    const links = [
      ...(rec.relatedLinks || []),
      ...(rec.relatedExternalId && rec.relatedEntityType
        ? [
            {
              entityType: rec.relatedEntityType,
              externalId: rec.relatedExternalId,
            },
          ]
        : []),
    ];
    for (const link of links) {
      const id = await this.resolveMappedId(
        platform,
        link.entityType,
        link.externalId,
      );
      if (id) {
        involved.push({
          id,
          type: RELATED_TYPE_LABEL[link.entityType],
        });
      }
    }
    if (!involved.length && rec.relatedEmail) {
      const email = normalizeEmail(rec.relatedEmail);
      const c = await this.contactModel
        .findOne({ email })
        .select('_id')
        .lean()
        .exec();
      if (c?._id) {
        involved.push({ id: c._id as Types.ObjectId, type: 'Contact' });
      }
    }
    if (!involved.length) {
      throw new BadRequestException(
        `${activityType} could not be linked — import parent records first and provide related source IDs`,
      );
    }

    const primary = involved[0];
    const metadata = {
      sourcePlatform: platform,
      sourceExternalId: rec.externalId,
      authorLabel: rec.authorLabel,
      assigneeLabel: rec.assigneeLabel,
      durationSeconds: rec.durationSeconds,
      direction: rec.direction,
      outcome: rec.outcome,
      disposition: rec.disposition,
      scheduledAt: rec.scheduledAt,
      completedAt: rec.completedAt,
      phoneNumber: rec.phoneNumber,
      meetingUrl: rec.meetingUrl,
      importedAt: new Date().toISOString(),
      _sourcePayload: rec.sourcePayload,
      ...(rec.customFields || {}),
    };

    if (existing) {
      if (strategy === 'skip') return 'skipped';
      if (strategy !== 'create') {
        const prev = leanPrevious(existing);
        await this.activityModel
          .updateOne(
            { _id: existing._id },
            {
              $set: {
                title: rec.title || existing.title,
                content: rec.content,
                type: activityType,
                relatedTo: primary.id,
                relatedType: primary.type,
                involvedEntities: involved,
                status: rec.status || existing.status,
                metadata: { ...(existing.metadata || {}), ...metadata },
              },
            },
          )
          .exec();
        await this.rememberTouch(
          jobId,
          'activities',
          existing._id,
          'merged',
          prev,
        );
        return 'merged';
      }
    }

    const created = await this.activityModel.create({
      type: activityType,
      title: rec.title || `Imported ${activityType}`,
      content: rec.content,
      relatedTo: primary.id,
      relatedType: primary.type,
      involvedEntities: involved,
      status: rec.status,
      metadata,
      ...(rec.createdAt ? { createdAt: new Date(rec.createdAt) } : {}),
    });
    await this.rememberTouch(
      jobId,
      'activities',
      created._id as Types.ObjectId,
      'created',
      null,
    );
    return 'created';
  }

  /**
   * Apply an explicit association edge exactly as it existed in the source CRM.
   * Writes both directions on association arrays where applicable.
   */
  private async upsertAssociation(
    platform: CrmMigrationPlatform,
    rec: CanonicalAssociation,
    strategy: CrmMigrationDuplicateStrategy,
    jobId?: Types.ObjectId,
  ): Promise<'created' | 'merged' | 'skipped'> {
    const fromId = await this.resolveMappedId(
      platform,
      rec.fromEntityType,
      rec.fromExternalId,
    );
    const toId = await this.resolveMappedId(
      platform,
      rec.toEntityType,
      rec.toExternalId,
    );
    if (!fromId || !toId) {
      throw new BadRequestException(
        `Association unresolved: ${rec.fromEntityType}:${rec.fromExternalId} → ${rec.toEntityType}:${rec.toExternalId}. Import both records first.`,
      );
    }

    // Snapshot both ends before mutating so revert can restore links.
    await this.rememberExistingDocTouch(jobId, rec.fromEntityType, fromId);
    await this.rememberExistingDocTouch(jobId, rec.toEntityType, toId);

    const labelMeta = {
      label: rec.label,
      isPrimary: !!rec.isPrimary,
      sourceExternalId: rec.externalId,
      sourcePlatform: platform,
      _sourcePayload: rec.sourcePayload,
    };

    await this.applyAssociationEdge(
      rec.fromEntityType,
      fromId,
      rec.toEntityType,
      toId,
      labelMeta,
      !!rec.isPrimary,
    );
    // Reverse edge so both records show the relationship
    await this.applyAssociationEdge(
      rec.toEntityType,
      toId,
      rec.fromEntityType,
      fromId,
      labelMeta,
      false,
    );

    void strategy;
    return 'created';
  }

  private async applyAssociationEdge(
    fromType: CrmAssociationObjectType,
    fromId: Types.ObjectId,
    toType: CrmAssociationObjectType,
    toId: Types.ObjectId,
    meta: Record<string, unknown>,
    isPrimary: boolean,
  ) {
    const setOps: Record<string, unknown> = {};
    const addToSet: Record<string, unknown> = {};

    if (fromType === 'contacts') {
      if (toType === 'organizations') {
        addToSet.associatedOrganizations = toId;
      } else if (toType === 'deals') {
        addToSet.associatedDeals = toId;
      } else if (toType === 'contacts') {
        addToSet.associatedContacts = toId;
      } else if (toType === 'leads') {
        addToSet.associatedLeads = toId;
      }
    } else if (fromType === 'leads') {
      if (toType === 'organizations') addToSet.associatedOrganizations = toId;
      else if (toType === 'deals') addToSet.associatedDeals = toId;
      else if (toType === 'contacts') addToSet.associatedContacts = toId;
      else if (toType === 'leads') addToSet.associatedLeads = toId;
    } else if (fromType === 'organizations') {
      if (toType === 'contacts') addToSet.associatedContacts = toId;
      else if (toType === 'deals') addToSet.associatedDeals = toId;
    } else if (fromType === 'deals') {
      if (toType === 'organizations') addToSet.associatedCompanies = toId;
      else if (toType === 'contacts') {
        addToSet.associatedContacts = toId;
        if (isPrimary) setOps.contactPerson = toId;
      } else if (toType === 'leads') {
        if (isPrimary) setOps.lead = toId;
      }
    }

    // Store association provenance on the from-record customFields
    setOps['customFields._lastAssociation'] = meta;

    const update: Record<string, unknown> = {};
    if (Object.keys(addToSet).length) update.$addToSet = addToSet;
    if (Object.keys(setOps).length) update.$set = setOps;
    if (!Object.keys(update).length) return;

    const model = this.modelForEntity(fromType);
    await model.updateOne({ _id: fromId }, update).exec();
  }

  private modelForEntity(
    entity: CrmMigrationEntityType | CrmAssociationObjectType,
  ): Model<any> {
    switch (entity) {
      case 'organizations':
        return this.organizationModel;
      case 'contacts':
        return this.contactModel;
      case 'leads':
        return this.leadModel;
      case 'deals':
        return this.dealModel;
      default:
        return this.activityModel;
    }
  }

  private async bustCaches(entity: CrmMigrationEntityType) {
    const map: Record<string, 'leads' | 'contacts' | 'organizations' | 'deals'> =
      {
        organizations: 'organizations',
        contacts: 'contacts',
        leads: 'leads',
        deals: 'deals',
      };
    const key = map[entity];
    if (key) await this.appCache.invalidateCrm(key);
    else await this.appCache.invalidateReporting();
  }

  private async findJob(jobId: string) {
    if (!isMongoObjectIdString(jobId)) {
      throw new NotFoundException('Migration job not found');
    }
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new NotFoundException('Migration job not found');
    return job;
  }

  private serializeJob(job: CrmMigrationJobDocument) {
    const total = job.total || 0;
    const processed = job.processed || 0;
    const revertible =
      job.status !== 'reverted' &&
      ((job.successCount || 0) > 0 || (job.processed || 0) > 0);
    return {
      jobId: String(job._id),
      platform: job.platform,
      entityType: job.entityType,
      status: job.status,
      duplicateStrategy: job.duplicateStrategy,
      mapping: job.mapping,
      total,
      processed,
      successCount: job.successCount,
      failedCount: job.failedCount,
      skippedCount: job.skippedCount,
      mergedCount: job.mergedCount,
      createdCount: job.createdCount,
      batchCount: job.batchCount,
      error: job.error,
      errorSamples: job.errorSamples || [],
      sourceFileName: job.sourceFileName,
      progress:
        total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0,
      recommendedOrder: MIGRATION_ENTITY_ORDER,
      revertible,
      revertedAt: job.revertedAt
        ? new Date(job.revertedAt).toISOString()
        : null,
      revertRestoredCount: job.revertRestoredCount || 0,
      revertDeletedCount: job.revertDeletedCount || 0,
      createdAt: (job as any).createdAt
        ? new Date((job as any).createdAt).toISOString()
        : null,
    };
  }

  private normalizePlatform(v: string): CrmMigrationPlatform {
    const p = String(v || 'custom').toLowerCase();
    if (
      p === 'hubspot' ||
      p === 'salesforce' ||
      p === 'zoho' ||
      p === 'pipedrive' ||
      p === 'custom'
    ) {
      return p;
    }
    throw new BadRequestException(
      'platform must be hubspot | salesforce | zoho | pipedrive | custom',
    );
  }

  private normalizeEntity(v: string): CrmMigrationEntityType {
    const e = String(v || '').toLowerCase();
    const allowed: CrmMigrationEntityType[] = [
      'organizations',
      'contacts',
      'leads',
      'deals',
      'notes',
      'calls',
      'meetings',
      'emails',
      'tasks',
      'activities',
      'associations',
    ];
    if (allowed.includes(e as CrmMigrationEntityType)) {
      return e as CrmMigrationEntityType;
    }
    if (e === 'companies' || e === 'accounts') return 'organizations';
    if (e === 'persons' || e === 'people') return 'contacts';
    if (e === 'opportunities') return 'deals';
    if (e === 'engagements') return 'activities';
    if (e === 'relationships' || e === 'links') return 'associations';
    throw new BadRequestException(
      'entityType must be organizations | contacts | leads | deals | notes | calls | meetings | emails | tasks | activities | associations',
    );
  }

  private normalizeStrategy(v?: string): CrmMigrationDuplicateStrategy {
    const s = String(v || 'merge').toLowerCase();
    if (s === 'merge' || s === 'replace' || s === 'skip' || s === 'create') {
      return s;
    }
    return 'merge';
  }
}
