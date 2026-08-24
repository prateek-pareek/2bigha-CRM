import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CrmGlobalSettings, CrmGlobalSettingsDocument } from '../schemas/crm-global-settings.schema';
import { Model, Types } from 'mongoose';
import { MailService } from '../../mail/mail.service';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  CustomField,
  CustomFieldDocument,
} from '../admin/schemas/custom-field.schema';
import { ReportingService } from '../reporting/reporting.service';
import { TeamsBotService } from '../../teams-bot/teams-bot.service';
import { PipelinesService } from './pipelines.service';
import { WorkflowsService } from '../automation/workflows.service';
import { LeadEngagementAutomationService } from '../automation/lead-engagement-automation.service';
import { appendCrmListFilters, CrmFilterCriterion } from '../shared/crm-list-filters';
import {
  CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS,
  mergeOpportunitySourcePlatforms,
  sanitizeCustomOpportunityPlatforms,
} from '../shared/crm-opportunity-platforms.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  CrmEmailEngagementFilterService,
  CrmEmailEngagementListFilter,
} from '../email/crm-email-engagement-filter.service';
import * as XLSX from 'xlsx';
import {
  displayName,
  hasAtLeastOneContactOrPortalListing,
  hasValidPlatformLeadIdentity,
  isPlatformLeadType,
  linkedInProfileKey,
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizePhoneDigits,
} from '../shared/crm-person-identifiers.util';
import {
  extractEmailDomain,
  isCorporateEmailDomain,
  normalizeDomainKey,
  organizationDomainMatchFilter,
  websiteFromDomain,
} from '../shared/crm-email-domain.util';
import { normalizeTwitterHandle } from '../shared/crm-x-handle.util';
import {
  assignUniqueRecordId,
  isMongoObjectIdString,
} from '../shared/crm-record-id.util';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import {
  leadModuleFilter,
  roleAllowsModule,
  resolveRoleModule,
  DEFAULT_LEAD_WORKSPACE_MODULE,
  CRM_WORKSPACE_MODULES,
  CRM_ROLE_MODULE_ALL,
} from '../shared/crm-workspace-module.util';
import { RoleAuditLogService } from '../../users/role-audit-log.service';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import { InboxIdleService } from '../inbox/inbox-idle.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import {
  PM_PROGRESS_READ_PORT,
  PmProgressReadPort,
} from '../shared/pm-progress-read.port';
import { assertCrmPipelineScopedUpdate } from '../shared/crm-jwt-perms.util';
import {
  canViewCrmRevenue,
  redactCrmRevenueForUser,
} from '../shared/crm-admin-access.util';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AppCacheService } from '../../redis/app-cache.service';
import {
  buildScalableListResult,
  clampPageSize,
  CRM_DEFAULT_PAGE,
  CRM_DEFAULT_PAGE_SIZE,
  CRM_LIST_MAX_TIME_MS,
  CRM_MAX_BOARD_PAGE_SIZE,
  CRM_MAX_EXPORT_ROWS,
  CRM_MAX_PAGE_SIZE,
  CRM_MAX_PICKER_LIMIT,
  ScalableListResult,
} from '../../common/lib/pagination/list-pagination';
import { countDocumentsCapped } from '../../common/lib/pagination/capped-count';
import {
  CONTACT_MERGE_SCALAR,
  LEAD_MERGE_SCALAR,
  mergePersonScalarFields,
  unionObjectIdStrings,
} from '../shared/crm-duplicate.util';
import { SalesAgentTriggerService } from '../sales-agent/sales-agent-cron.service';
import { AssociationsService } from '../associations/associations.service';
import { LeadIntentService } from '../records/lead-intent.service';
import { ExportQuotaService } from '../admin/export-quota.service';

type ImportDuplicateStrategy = 'create' | 'skip' | 'merge' | 'replace';
type ImportRowOutcome = 'created' | 'merged' | 'replaced' | 'skipped';

@Injectable()
export class CRMService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(CustomField.name, 'crmConnection')
    private customFieldModel: Model<CustomFieldDocument>,
    @InjectModel(CrmGlobalSettings.name, 'crmConnection')
    private globalSettingsModel: Model<CrmGlobalSettingsDocument>,
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private accountModel: Model<UserEmailAccountDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private trackingModel: Model<EmailTrackingDocument>,
    @InjectModel(User.name)
    private hrmsUserModel: Model<UserDocument>,
    private readonly reportingService: ReportingService,
    private readonly teamsBotService: TeamsBotService,
    private readonly pipelinesService: PipelinesService,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    private readonly leadEngagementAutomation: LeadEngagementAutomationService,
    private readonly inboxIdleService: InboxIdleService,
    @Inject(PM_PROGRESS_READ_PORT)
    private readonly pmProgressReadService: PmProgressReadPort,
    private readonly emailEngagementFilter: CrmEmailEngagementFilterService,
    private readonly appCache: AppCacheService,
    @Inject(forwardRef(() => SalesAgentTriggerService))
    private readonly salesAgentTrigger: SalesAgentTriggerService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly mailService: MailService,
    private readonly associationsService: AssociationsService,
    private readonly leadIntentService: LeadIntentService,
    private readonly exportQuotaService: ExportQuotaService,
    private readonly roleAuditLog: RoleAuditLogService,
  ) { }

  private notifySalesAgent(event: {
    trigger:
      | 'lead_created'
      | 'lead_stage_changed'
      | 'website_inbound'
      | 'email_reply_received';
    recordType: 'Lead';
    recordId: string;
    user?: any;
    metadata?: Record<string, unknown>;
  }): void {
    this.salesAgentTrigger.onEvent(event);
  }

  private static readonly IMPORT_JOB_TTL_MS = 2 * 60 * 60 * 1000;

  private readonly importJobs = new Map<
    string,
    {
      id: string;
      type: string;
      status: 'processing' | 'completed' | 'failed';
      total: number;
      processed: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
      mergedCount: number;
      replacedCount: number;
      createdCount: number;
      /** Rows where the Role/WhatsApp/Address columns matched an existing Client by phone or email. */
      existingClientCount: number;
      /** Rows whose Role column wasn't OWNER/AGENT/USER — defaulted to USER. */
      invalidRoleCount: number;
      duplicateStrategy: ImportDuplicateStrategy;
      error?: string;
      createdAt: number;
    }
  >();

  private async bustCrmCache(
    entity: 'leads' | 'contacts' | 'organizations',
    recordId?: string,
  ): Promise<void> {
    await this.appCache.invalidateCrm(entity, recordId);
  }

  private async applyListEmailEngagement(
    filter: Record<string, unknown>,
    module: 'leads' | 'contacts' | 'organizations',
    emailEngagement?: CrmEmailEngagementListFilter | null,
  ): Promise<Record<string, unknown>> {
    if (!emailEngagement) return filter;
    return this.emailEngagementFilter.applyEmailEngagementToFilter(
      filter,
      module,
      emailEngagement,
    );
  }

  private static readonly FILTER_BUILTIN_OPTIONS: Record<string, string[]> = {
    status: ['New', 'Open', 'Qualified', 'Unqualified', 'Won', 'Lost', 'Active', 'Inactive'],
    source: ['Website', 'Referral', 'Email', 'Call', 'LinkedIn', 'Campaign', 'Manual'],
    gender: ['Male', 'Female', 'Other'],
    territory: ['North', 'South', 'East', 'West'],
    currency: ['USD', 'EUR', 'INR', 'GBP', 'AED'],
    salutation: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'],
    pricingType: ['fixed', 'retainer', 'hourly', 'subscription'],
    platformEngagementStatus: ['New', 'Engaged', 'Won', 'Lost', 'Archived'],
    callStatus: ['Not Called', 'Completed', 'Missed', 'Busy', 'Failed'],
  };

  private mergeDistinctOptionLists(
    ...lists: Array<string[] | undefined | null>
  ): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
      if (!list?.length) continue;
      for (const raw of list) {
        const v = String(raw ?? '').trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  /** Catalog options (custom-field defs, pipeline stages, builtins) — not only values present on records. */
  private async getFilterCatalogOptions(
    moduleName: string,
    fieldKey: string,
    pipelineId?: string,
  ): Promise<string[]> {
    if (fieldKey.startsWith('customFields.')) {
      const cfKey = fieldKey.slice('customFields.'.length);
      const def = await this.customFieldModel
        .findOne({
          module: moduleName,
          key: cfKey,
          isActive: true,
        })
        .select({ options: 1 })
        .lean()
        .exec();
      return Array.isArray(def?.options)
        ? def!.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
    }

    if (fieldKey === 'stage' || fieldKey === 'status') {
      // Contacts/leads both have stage; contacts share lead pipelines.
      const types: Array<'leads'> =
        moduleName === 'leads' || moduleName === 'contacts' ? ['leads'] : [];

      const stages: string[] = [];
      for (const type of types) {
        const pipes = await this.pipelinesService.findAll(type);
        for (const p of pipes) {
          if (pipelineId && String((p as any)._id) !== String(pipelineId)) continue;
          for (const st of (p as any).stages || []) {
            if (st?.name) stages.push(String(st.name));
          }
        }
      }
      if (fieldKey === 'status') {
        return this.mergeDistinctOptionLists(
          stages,
          CRMService.FILTER_BUILTIN_OPTIONS.status,
        );
      }
      return this.mergeDistinctOptionLists(stages);
    }

    return CRMService.FILTER_BUILTIN_OPTIONS[fieldKey] || [];
  }

  async getDistinctValues(moduleName: string, fieldKey: string, pipelineId?: string): Promise<string[]> {
    let model: Model<any>;
    switch (moduleName) {
      case 'leads': model = this.leadModel; break;
      case 'organizations': model = this.organizationModel; break;
      case 'contacts': model = this.contactModel; break;
      case 'clients': model = this.clientModel; break;
      default: return [];
    }

    const rawKey = String(fieldKey || '').trim();
    // Block operator injection and unbounded scans on arbitrary paths.
    if (
      !rawKey ||
      rawKey.startsWith('$') ||
      rawKey.includes('\0') ||
      rawKey.length > 120
    ) {
      return [];
    }
    const isCustom = /^customFields\.[A-Za-z0-9_.-]+$/.test(rawKey);
    const allowed = new Set([
      'firstName', 'lastName', 'email', 'organization', 'stage', 'status', 'phone',
      'mobileNo', 'jobTitle', 'source', 'industry', 'annualRevenue', 'noOfEmployees',
      'territory', 'linkedinUrl', 'twitterHandle', 'relatedService',
      'leadOwner', 'telegram', 'gender', 'address', 'name', 'website', 'title',
      'contactPerson', 'currency', 'content', 'type', 'createdAt', 'subject', 'from', 'to',
      'opportunitySourcePlatform', 'platformClientLabel', 'platformEngagementStatus',
      'opportunityListingUrl', 'ownerLabel', 'notes',
      'salutation', 'converted', 'callStatus',
    ]);
    if (!isCustom && !allowed.has(rawKey)) {
      return this.getFilterCatalogOptions(moduleName, rawKey, pipelineId);
    }

    const catalogPromise = this.getFilterCatalogOptions(
      moduleName,
      rawKey,
      pipelineId,
    );

    try {
      const query: Record<string, any> = { isDeleted: { $ne: true } };
      if (pipelineId && Types.ObjectId.isValid(pipelineId)) {
        query.pipeline = new Types.ObjectId(pipelineId);
      }

      // Cap distinct work — full-collection distinct() was OOM'ing Mongo on the VPS.
      // Normalize scalars + multiselect arrays into a values array, then unwind.
      const rows = await model
        .aggregate([
          { $match: query },
          {
            $project: {
              vals: {
                $let: {
                  vars: { raw: `$${rawKey}` },
                  in: {
                    $cond: [
                      { $isArray: '$$raw' },
                      '$$raw',
                      {
                        $cond: [
                          {
                            $or: [
                              { $eq: ['$$raw', null] },
                              { $eq: ['$$raw', ''] },
                            ],
                          },
                          [],
                          ['$$raw'],
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
          { $unwind: '$vals' },
          { $group: { _id: '$vals' } },
          { $match: { _id: { $nin: [null, ''] } } },
          { $limit: 2000 },
          { $project: { _id: 0, v: { $toString: '$_id' } } },
        ])
        .option({ allowDiskUse: false, maxTimeMS: 8_000 })
        .exec();

      const fromData = rows
        .map((r: any) => String(r?.v ?? '').trim())
        .filter(Boolean);

      const catalog = await catalogPromise;
      return this.mergeDistinctOptionLists(catalog, fromData);
    } catch {
      try {
        const catalog = await catalogPromise;
        return catalog;
      } catch {
        return [];
      }
    }
  }

  async getGlobalSettings() {
    const doc = await this.globalSettingsModel.findOne({ key: 'default' }).lean().exec();
    const usdToInr = doc?.usdToInr ?? 83;
    const currencyRates = (doc?.currencyRates && doc.currencyRates.length > 0)
      ? doc.currencyRates
      : [{ code: 'USD', symbol: '$', rateToInr: usdToInr }];
    const emailDeliverability = doc?.emailDeliverability ?? {
      enforceSendLimits: false,
      maxEmailsPerHourPerAccount: 40,
      maxEmailsPerDayPerAccount: 200,
    };
    const workflowSchedulerEnabled = doc?.workflowSchedulerEnabled !== false;
    return { usdToInr, currencyRates, emailDeliverability, workflowSchedulerEnabled };
  }

  async updateCurrencyRate(usdToInr: number) {
    if (!usdToInr || usdToInr <= 0) throw new BadRequestException('Rate must be a positive number');
    // Also sync into currencyRates array for USD
    const existing = await this.globalSettingsModel.findOne({ key: 'default' }).lean().exec();
    const rates: any[] = existing?.currencyRates ?? [{ code: 'USD', symbol: '$', rateToInr: usdToInr }];
    const usdIdx = rates.findIndex((r: any) => r.code === 'USD');
    if (usdIdx >= 0) rates[usdIdx].rateToInr = usdToInr;
    else rates.unshift({ code: 'USD', symbol: '$', rateToInr: usdToInr });
    const doc = await this.globalSettingsModel.findOneAndUpdate(
      { key: 'default' },
      { $set: { usdToInr, currencyRates: rates } },
      { upsert: true, new: true },
    ).lean().exec();
    return { usdToInr: doc.usdToInr, currencyRates: doc.currencyRates };
  }

  async upsertCurrencyRate(code: string, symbol: string, rateToInr: number) {
    if (!code) throw new BadRequestException('Currency code is required');
    if (!rateToInr || rateToInr <= 0) throw new BadRequestException('Rate must be a positive number');
    const upperCode = code.toUpperCase();
    const existing = await this.globalSettingsModel.findOne({ key: 'default' }).lean().exec();
    const rates: any[] = existing?.currencyRates ? [...existing.currencyRates] : [];
    const idx = rates.findIndex((r: any) => r.code === upperCode);
    if (idx >= 0) rates[idx] = { code: upperCode, symbol, rateToInr };
    else rates.push({ code: upperCode, symbol, rateToInr });
    const update: any = { $set: { currencyRates: rates } };
    if (upperCode === 'USD') update.$set.usdToInr = rateToInr;
    const doc = await this.globalSettingsModel.findOneAndUpdate(
      { key: 'default' },
      update,
      { upsert: true, new: true },
    ).lean().exec();
    return { usdToInr: doc.usdToInr, currencyRates: doc.currencyRates };
  }

  async deleteCurrencyRate(code: string) {
    if (code.toUpperCase() === 'USD') throw new BadRequestException('USD rate cannot be deleted');
    const existing = await this.globalSettingsModel.findOne({ key: 'default' }).lean().exec();
    const rates = (existing?.currencyRates ?? []).filter((r: any) => r.code !== code.toUpperCase());
    const doc = await this.globalSettingsModel.findOneAndUpdate(
      { key: 'default' },
      { $set: { currencyRates: rates } },
      { upsert: true, new: true },
    ).lean().exec();
    return { currencyRates: doc.currencyRates };
  }

  async getWorkflowSchedulerSettings(): Promise<{
    workflowSchedulerEnabled: boolean;
  }> {
    const doc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('workflowSchedulerEnabled')
      .lean()
      .exec();
    return { workflowSchedulerEnabled: doc?.workflowSchedulerEnabled !== false };
  }

  async updateWorkflowSchedulerSettings(dto: {
    workflowSchedulerEnabled: boolean;
  }): Promise<{ workflowSchedulerEnabled: boolean }> {
    const workflowSchedulerEnabled = dto.workflowSchedulerEnabled;
    await this.globalSettingsModel
      .findOneAndUpdate(
        { key: 'default' },
        { $set: { workflowSchedulerEnabled } },
        { upsert: true },
      )
      .exec();
    return { workflowSchedulerEnabled };
  }

  async getOpportunitySourcePlatforms(): Promise<{
    builtin: string[];
    custom: string[];
    options: string[];
  }> {
    const doc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('customOpportunitySourcePlatforms')
      .lean()
      .exec();
    const custom = sanitizeCustomOpportunityPlatforms(
      doc?.customOpportunitySourcePlatforms,
    );
    return {
      builtin: [...CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS],
      custom,
      options: mergeOpportunitySourcePlatforms(custom),
    };
  }

  async updateOpportunitySourcePlatforms(
    customPlatforms: unknown,
  ): Promise<{ custom: string[]; options: string[] }> {
    const custom = sanitizeCustomOpportunityPlatforms(customPlatforms);
    const doc = await this.globalSettingsModel
      .findOneAndUpdate(
        { key: 'default' },
        { $set: { customOpportunitySourcePlatforms: custom } },
        { upsert: true, new: true },
      )
      .select('customOpportunitySourcePlatforms')
      .lean()
      .exec();
    const saved = sanitizeCustomOpportunityPlatforms(
      doc?.customOpportunitySourcePlatforms,
    );
    return {
      custom: saved,
      options: mergeOpportunitySourcePlatforms(saved),
    };
  }

  async getCrmWikiLinks(): Promise<{
    wikiLinks: {
      type: 'space' | 'page';
      spaceId: string;
      pageId?: string;
      title: string;
      urlPath: string;
    }[];
  }> {
    const doc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('wikiLinks')
      .lean()
      .exec();
    const raw = doc?.wikiLinks;
    return { wikiLinks: Array.isArray(raw) ? raw : [] };
  }

  async updateCrmWikiLinks(wikiLinks: unknown): Promise<{
    wikiLinks: {
      type: 'space' | 'page';
      spaceId: string;
      pageId?: string;
      title: string;
      urlPath: string;
    }[];
  }> {
    if (!Array.isArray(wikiLinks)) {
      throw new BadRequestException('wikiLinks must be an array');
    }
    const sanitized: {
      type: 'space' | 'page';
      spaceId: string;
      pageId?: string;
      title: string;
      urlPath: string;
    }[] = [];
    for (const item of wikiLinks) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const type = o.type === 'page' ? 'page' : 'space';
      const spaceId = String(o.spaceId || '').trim();
      const title = String(o.title || '').trim();
      const urlPath = String(o.urlPath || '').trim();
      if (!spaceId || !title || !urlPath) continue;
      if (type === 'page') {
        const pageId = String(o.pageId || '').trim();
        if (!pageId) continue;
        sanitized.push({ type: 'page', spaceId, pageId, title, urlPath });
      } else {
        sanitized.push({ type: 'space', spaceId, title, urlPath });
      }
    }
    const doc = await this.globalSettingsModel
      .findOneAndUpdate(
        { key: 'default' },
        { $set: { wikiLinks: sanitized } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    const out = doc?.wikiLinks;
    return { wikiLinks: Array.isArray(out) ? out : [] };
  }

  private entityPlain(doc: unknown): Record<string, unknown> {
    if (
      doc &&
      typeof doc === 'object' &&
      'toObject' in doc &&
      typeof (doc as { toObject: () => unknown }).toObject === 'function'
    ) {
      return (doc as { toObject: () => Record<string, unknown> }).toObject();
    }
    return { ...(doc as Record<string, unknown>) };
  }

  /** Compare ObjectId refs and strings consistently for workflow change detection. */
  private strId(v: unknown): string {
    if (v == null) return '';
    return String(v);
  }

  private normalizeObjectIdArray(arr: unknown): Types.ObjectId[] {
    if (!Array.isArray(arr)) return [];
    const out: Types.ObjectId[] = [];
    for (const id of arr) {
      if (id instanceof Types.ObjectId) {
        out.push(id);
      } else if (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
        out.push(new Types.ObjectId(id));
      } else if (id && typeof id === 'object' && String(id).match(/^[0-9a-fA-F]{24}$/)) {
        out.push(new Types.ObjectId(String(id)));
      }
    }
    return out;
  }

  /** Read association arrays from a lean/toObject doc (may be populated). */
  private objectIdListFromDocField(val: unknown): Types.ObjectId[] {
    if (!Array.isArray(val)) return [];
    const out: Types.ObjectId[] = [];
    for (const x of val) {
      if (x instanceof Types.ObjectId) {
        out.push(x);
        continue;
      }
      if (x && typeof x === 'object' && '_id' in (x as object)) {
        const id = String((x as { _id: unknown })._id);
        if (/^[0-9a-fA-F]{24}$/.test(id)) out.push(new Types.ObjectId(id));
        continue;
      }
      const s = String(x ?? '');
      if (/^[0-9a-fA-F]{24}$/.test(s)) out.push(new Types.ObjectId(s));
    }
    return out;
  }

  private setDiffIds(
    before: Types.ObjectId[],
    after: Types.ObjectId[],
  ): { removed: Types.ObjectId[]; added: Types.ObjectId[] } {
    const a = new Set(before.map(String));
    const b = new Set(after.map(String));
    const removed = before.filter((x) => !b.has(String(x)));
    const added = after.filter((x) => !a.has(String(x)));
    return { removed, added };
  }

  /**
   * Best-effort Associations v2 dual-write.
   * Never blocks or fails the legacy associated* array path.
   */
  private queueAssociationMirror(opts: {
    fromType: string;
    fromId: string;
    toType: string;
    associationType?: string;
    added: Array<string | Types.ObjectId>;
    removed: Array<string | Types.ObjectId>;
  }): void {
    if ((!opts.added || opts.added.length === 0) && (!opts.removed || opts.removed.length === 0)) {
      return;
    }
    void this.associationsService.mirrorArrayDiff(opts).catch(() => undefined);
  }

  /** Keep contact ↔ company / contact edges in sync (HubSpot-style). */
  private async syncContactAssociationMirrors(
    contactId: string,
    prev: Record<string, unknown>,
    next: {
      associatedOrganizations: Types.ObjectId[];
      associatedContacts: Types.ObjectId[];
    },
  ): Promise<void> {
    const cid = new Types.ObjectId(contactId);
    const prevO = this.objectIdListFromDocField(prev.associatedOrganizations);
    const prevP = this.objectIdListFromDocField(prev.associatedContacts);

    const { removed: ro, added: ao } = this.setDiffIds(prevO, next.associatedOrganizations);
    for (const id of ro) {
      await this.organizationModel
        .updateOne({ _id: id }, { $pull: { associatedContacts: cid } })
        .exec();
      await this.bustCrmCache('organizations', String(id));
    }
    for (const id of ao) {
      await this.organizationModel
        .updateOne({ _id: id }, { $addToSet: { associatedContacts: cid } })
        .exec();
      await this.bustCrmCache('organizations', String(id));
    }

    const { removed: rp, added: ap } = this.setDiffIds(prevP, next.associatedContacts);
    for (const id of rp) {
      if (String(id) === contactId) continue;
      await this.contactModel
        .updateOne({ _id: id }, { $pull: { associatedContacts: cid } })
        .exec();
    }
    for (const id of ap) {
      if (String(id) === contactId) continue;
      await this.contactModel
        .updateOne({ _id: id }, { $addToSet: { associatedContacts: cid } })
        .exec();
    }

    // Associations v2 dual-write (best-effort; arrays already updated above).
    this.queueAssociationMirror({
      fromType: 'contacts',
      fromId: contactId,
      toType: 'organizations',
      associationType: 'contact_company',
      added: ao,
      removed: ro,
    });
    this.queueAssociationMirror({
      fromType: 'contacts',
      fromId: contactId,
      toType: 'contacts',
      associationType: 'contact_contact',
      added: ap.filter((id) => String(id) !== contactId),
      removed: rp.filter((id) => String(id) !== contactId),
    });
  }

  /** Keep lead ↔ company edges in sync. */
  private async syncLeadAssociationMirrors(
    leadId: string,
    prev: Record<string, unknown>,
    nextOrganizations: Types.ObjectId[],
  ): Promise<void> {
    const lid = new Types.ObjectId(leadId);
    const prevOrganizations = this.objectIdListFromDocField(
      prev.associatedOrganizations,
    );
    const { removed, added } = this.setDiffIds(
      prevOrganizations,
      nextOrganizations,
    );
    for (const id of removed) {
      await this.organizationModel
        .updateOne({ _id: id }, { $pull: { associatedLeads: lid } })
        .exec();
      await this.bustCrmCache('organizations', String(id));
    }
    for (const id of added) {
      await this.organizationModel
        .updateOne({ _id: id }, { $addToSet: { associatedLeads: lid } })
        .exec();
      await this.bustCrmCache('organizations', String(id));
    }

    this.queueAssociationMirror({
      fromType: 'leads',
      fromId: leadId,
      toType: 'organizations',
      associationType: 'lead_company',
      added,
      removed,
    });
  }

  private async syncOrganizationAssociationMirrors(
    orgId: string,
    prev: Record<string, unknown>,
    next: {
      associatedContacts: Types.ObjectId[];
      associatedLeads: Types.ObjectId[];
    },
  ): Promise<void> {
    const oid = new Types.ObjectId(orgId);
    const prevC = this.objectIdListFromDocField(prev.associatedContacts);
    const prevL = this.objectIdListFromDocField(prev.associatedLeads);

    const { removed: rc, added: ac } = this.setDiffIds(prevC, next.associatedContacts);
    for (const id of rc) {
      await this.contactModel
        .updateOne({ _id: id }, { $pull: { associatedOrganizations: oid } })
        .exec();
    }
    for (const id of ac) {
      await this.contactModel
        .updateOne({ _id: id }, { $addToSet: { associatedOrganizations: oid } })
        .exec();
    }

    const { removed: rl, added: al } = this.setDiffIds(
      prevL,
      next.associatedLeads,
    );
    for (const id of rl) {
      await this.leadModel
        .updateOne({ _id: id }, { $pull: { associatedOrganizations: oid } })
        .exec();
    }
    for (const id of al) {
      await this.leadModel
        .updateOne({ _id: id }, { $addToSet: { associatedOrganizations: oid } })
        .exec();
    }

    this.queueAssociationMirror({
      fromType: 'organizations',
      fromId: orgId,
      toType: 'contacts',
      associationType: 'contact_company',
      added: ac,
      removed: rc,
    });
    this.queueAssociationMirror({
      fromType: 'organizations',
      fromId: orgId,
      toType: 'leads',
      associationType: 'lead_company',
      added: al,
      removed: rl,
    });
  }

  private normalizeAssociations(dto: any) {
    if (dto.organization !== undefined) {
      const orgId = this.toObjectIdSafe(dto.organization);
      if (orgId) {
        if (!dto.associatedCompanies) dto.associatedCompanies = [];
        const exists = dto.associatedCompanies.some(
          (id: any) => String(id) === String(orgId),
        );
        if (!exists) dto.associatedCompanies.push(orgId);
      }
    }
    if (dto.contactPerson !== undefined) {
      const contactId = this.toObjectIdSafe(dto.contactPerson);
      if (contactId) {
        if (!dto.associatedContacts) dto.associatedContacts = [];
        const exists = dto.associatedContacts.some(
          (id: any) => String(id) === String(contactId),
        );
        if (!exists) dto.associatedContacts.push(contactId);
      }
    }
  }

  private toObjectIdSafe(v: any): Types.ObjectId | null {
    if (!v) return null;
    if (v instanceof Types.ObjectId) return v;
    const s = String(v).trim();
    if (s === '' || s === 'null' || s === 'undefined') return null;
    if (/^[0-9a-fA-F]{24}$/.test(s)) return new Types.ObjectId(s);
    return null;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async nextRecordId(
    model: Model<any>,
    requested?: string | null,
  ): Promise<string> {
    const r = await assignUniqueRecordId(model, requested);
    if (!r.ok) throw new BadRequestException('Record ID is already in use');
    return r.recordId;
  }

  /** Resolve route param: Mongo _id or HubSpot-style `recordId`. */
  private async resolveDocumentId(
    model: Model<any>,
    id: string,
  ): Promise<string | null> {
    if (isMongoObjectIdString(id)) {
      const byId = await model.findById(id).select('_id').lean().exec();
      if (byId) return String((byId as { _id: Types.ObjectId })._id);
    }
    const byRid = await model
      .findOne({ recordId: id })
      .select('_id')
      .lean()
      .exec();
    return byRid ? String((byRid as { _id: Types.ObjectId })._id) : null;
  }

  /**
   * Find or create organization by name; returns Mongo _id for associations import (HubSpot, etc.).
   */
  private async ensureOrganization(
    name: string,
    extraData: any = {},
  ): Promise<Types.ObjectId | null> {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const domain =
        normalizeDomainKey(extraData?.website) ||
        (isCorporateEmailDomain(extraData?.email)
          ? extractEmailDomain(extraData.email)
          : null) ||
        normalizeDomainKey(extraData?.customFields?.email_domain);
      if (domain) {
        const filter = organizationDomainMatchFilter(domain);
        if (filter) {
          const byDomain = await this.organizationModel.findOne(filter).exec();
          if (byDomain) {
            if (!(byDomain.customFields as any)?.email_domain) {
              await this.organizationModel
                .updateOne(
                  { _id: byDomain._id },
                  {
                    $set: {
                      'customFields.email_domain': domain,
                      website: byDomain.website || websiteFromDomain(domain),
                    },
                  },
                )
                .exec();
            }
            return byDomain._id as Types.ObjectId;
          }
        }
      }
      let doc = await this.organizationModel
        .findOne({
          name: { $regex: new RegExp(`^${this.escapeRegex(trimmed)}$`, 'i') },
        })
        .exec();
      if (!doc) {
        doc = await this.organizationModel.create({
          name: trimmed,
          website: extraData.website || (domain ? websiteFromDomain(domain) : undefined),
          industry: extraData.industry,
          territory: extraData.territory,
          noOfEmployees: extraData.noOfEmployees,
          annualRevenue: extraData.annualRevenue,
          customFields: domain
            ? {
                ...(extraData.customFields || {}),
                email_domain: domain,
              }
            : extraData.customFields,
          recordId: await this.nextRecordId(this.organizationModel),
        });
      }
      return doc._id as Types.ObjectId;
    } catch (err: any) {
      console.error(
        `[CRMService] Failed to ensure organization "${trimmed}":`,
        err?.message,
      );
      return null;
    }
  }

  /** Remove CSV mapping keys that are not stored on Lead/Contact documents. */
  private stripImportRoutingFields(d: Record<string, any>): void {
    delete d.organizationId;
    delete d.hubspotCompanyId;
    delete d.hsCompanyId;
    delete d.contactEmail;
    delete d.hubspotContactId;
    delete d.hsContactId;
  }

  /**
   * Strips the client-routing-only columns (Role/WhatsApp/Address) from a lead import row
   * once `resolveImportClientId` has consumed them — separate from `stripImportRoutingFields`
   * because those same column names are legitimate target fields when importing INTO clients.
   */
  private stripLeadImportClientRoutingFields(d: Record<string, any>): void {
    delete d.role;
    delete d.whatsappNumber;
    delete d.address;
  }

  private readonly CLIENT_ROLE_OPTIONS = ['OWNER', 'AGENT', 'USER'];

  /**
   * Bulk-import counterpart to the Add Lead "search or create a client" step: find an
   * existing Client by phone/email, or create one from the Role/WhatsApp/Address columns.
   * Returns null (no-op) when the row has none of those columns, so plain lead-only CSVs
   * (no Role/WhatsApp/Address) behave exactly as before this feature existed.
   */
  private async resolveImportClientId(
    mappedData: Record<string, any>,
  ): Promise<{ clientId: Types.ObjectId; wasExisting: boolean; invalidRole: boolean } | null> {
    const hasRoutingColumn =
      mappedData.role != null ||
      mappedData.whatsappNumber != null ||
      mappedData.address != null;
    if (!hasRoutingColumn) return null;

    const rawRole = String(mappedData.role ?? '').trim().toUpperCase();
    const invalidRole = rawRole !== '' && !this.CLIENT_ROLE_OPTIONS.includes(rawRole);
    const role = this.CLIENT_ROLE_OPTIONS.includes(rawRole) ? rawRole : 'USER';

    const email = String(mappedData.email ?? '').trim();
    const phone = this.sanitizePhone(mappedData.mobileNo ?? mappedData.phone);
    const name =
      `${mappedData.firstName || ''} ${mappedData.lastName || ''}`.trim() || 'Unknown';

    const matchOr: Record<string, unknown>[] = [];
    if (email && email.includes('@')) matchOr.push({ email: this.emailRegexForMatch(email) });
    if (phone) matchOr.push({ phone });
    const existing = matchOr.length
      ? await this.clientModel.findOne({ $or: matchOr }).exec()
      : null;

    if (existing) {
      return { clientId: existing._id as Types.ObjectId, wasExisting: true, invalidRole };
    }

    const created = await this.clientModel.create({
      name,
      email: email || undefined,
      phone: phone || undefined,
      whatsappNumber: mappedData.whatsappNumber
        ? String(mappedData.whatsappNumber).trim()
        : undefined,
      address: mappedData.address ? String(mappedData.address).trim() : undefined,
      role,
    });
    return { clientId: created._id as Types.ObjectId, wasExisting: false, invalidRole };
  }

  /**
   * Resolve company for import: explicit Mongo id, HubSpot company id on Organization.customFields,
   * or create/find by company name (HubSpot "Company name" / Associated Company).
   */
  private async resolveImportOrganizationId(
    mappedData: Record<string, any>,
  ): Promise<Types.ObjectId | null> {
    const rawOid = mappedData.organizationId;
    if (rawOid != null && String(rawOid).trim() !== '') {
      const s = String(rawOid).trim();
      if (isMongoObjectIdString(s)) return new Types.ObjectId(s);
      const byCompanyRecordId = await this.organizationModel
        .findOne({ recordId: s })
        .exec();
      if (byCompanyRecordId)
        return byCompanyRecordId._id as Types.ObjectId;
    }
    const hsRaw =
      mappedData.hubspotCompanyId ?? mappedData.hsCompanyId ?? null;
    if (hsRaw != null && String(hsRaw).trim() !== '') {
      const hs = String(hsRaw).trim();
      const org = await this.organizationModel
        .findOne({
          $or: [
            { 'customFields.hubspot_company_id': hs },
            { 'customFields.hs_object_id': hs },
            { 'customFields.hs_company_id': hs },
          ],
        })
        .exec();
      if (org) return org._id as Types.ObjectId;
    }
    const orgName = mappedData.organization;
    if (orgName && typeof orgName === 'string' && orgName.trim()) {
      return this.ensureOrganization(orgName.trim(), mappedData);
    }
    return null;
  }

  private async addContactToOrganizationAssoc(
    orgId: Types.ObjectId,
    contactId: Types.ObjectId,
  ): Promise<void> {
    try {
      await this.organizationModel
        .updateOne(
          { _id: orgId },
          { $addToSet: { associatedContacts: contactId } },
        )
        .exec();
    } catch (e: any) {
      console.error('[CRMService] addContactToOrganizationAssoc:', e?.message);
    }
  }

  /**
   * Merge custom field objects; later walks overwrite (incoming wins).
   * Supports string values and string[] for multi-select fields.
   */
  private mergeCustomFieldsMaps(
    existing: Map<string, unknown> | Record<string, unknown> | undefined,
    incoming: Map<string, unknown> | Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const setVal = (k: string, v: unknown) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) {
        const filtered = v
          .map((x) => (typeof x === 'string' ? x.trim() : x))
          .filter((x) => x !== '' && x != null) as string[];
        if (filtered.length) out[k] = filtered;
      } else if (typeof v === 'string' && v.trim() !== '') {
        out[k] = v.trim();
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        out[k] = String(v);
      }
    };
    const walk = (m: any) => {
      if (!m) return;
      if (m instanceof Map) {
        m.forEach((v, k) => setVal(String(k), v));
      } else if (typeof m === 'object' && !Array.isArray(m)) {
        for (const [k, v] of Object.entries(m)) setVal(k, v);
      }
    };
    walk(existing);
    walk(incoming);
    return out;
  }

  private emailRegexForMatch(email: string): RegExp {
    const trimmed = (email || '').trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private toObjectIdSet(ids: Iterable<string>): Types.ObjectId[] {
    return [...ids]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  /** Lead ↔ contact sync pairs share the same primary email — exclude both sides from duplicate checks when appropriate. */
  private async augmentExcludeIdsForSyncPair(opts: {
    entity: 'lead' | 'contact';
    merged: Record<string, any>;
    excludeLeadIds: Set<string>;
    excludeContactIds: Set<string>;
    existingLead?: any;
    existingContact?: any;
  }): Promise<void> {
    const mergedEmail = normalizeEmail(opts.merged.email);

    if (opts.entity === 'lead' && opts.existingLead) {
      const leadId = String(opts.existingLead._id);
      // Always exclude the contact synced from this lead (by sourceLead link)
      const syncedContact = await this.contactModel
        .findOne({ sourceLead: this.toObjectIdSafe(leadId) })
        .select('_id')
        .lean()
        .exec();
      if (syncedContact) {
        opts.excludeContactIds.add(String(syncedContact._id));
      }
      // Also exclude by email match (handles edge cases where sourceLead isn't set)
      if (mergedEmail) {
        const c = await this.contactModel
          .findOne({ email: this.emailRegexForMatch(opts.merged.email) })
          .select('_id email')
          .lean()
          .exec();
        if (c && normalizeEmail(c.email) === mergedEmail) {
          opts.excludeContactIds.add(String(c._id));
        }
      }
    }
    if (opts.entity === 'contact' && opts.existingContact) {
      // Always exclude the lead this contact was synced from (by sourceLead link) —
      // mirrors the lead-side exclusion above, so editing a synced contact's own
      // phone/mobile doesn't get flagged as a conflict against its own source lead.
      if (opts.existingContact.sourceLead) {
        opts.excludeLeadIds.add(String(opts.existingContact.sourceLead));
      }
      // Also exclude by email match (handles edge cases where sourceLead isn't set)
      if (mergedEmail) {
        const l = await this.leadModel
          .findOne({ email: this.emailRegexForMatch(opts.merged.email) })
          .select('_id email')
          .lean()
          .exec();
        if (l && normalizeEmail(l.email) === mergedEmail) {
          opts.excludeLeadIds.add(String(l._id));
        }
      }
    }
  }

  private async findEmailConflict(
    email: string,
    excludeLeadIds: Set<string>,
    excludeContactIds: Set<string>,
  ): Promise<{ kind: 'Lead' | 'Contact'; doc: any } | null> {
    const re = this.emailRegexForMatch(email);
    const lead = await this.leadModel
      .findOne({
        _id: { $nin: this.toObjectIdSet(excludeLeadIds) },
        $or: [{ email: { $regex: re } }, { additionalEmails: re }],
      })
      .lean()
      .exec();
    if (lead) return { kind: 'Lead', doc: lead };
    const contact = await this.contactModel
      .findOne({
        _id: { $nin: this.toObjectIdSet(excludeContactIds) },
        $or: [{ email: { $regex: re } }, { additionalEmails: re }],
      })
      .lean()
      .exec();
    if (contact) return { kind: 'Contact', doc: contact };
    return null;
  }

  private async findLinkedInConflict(
    linkedinUrl: string,
    excludeLeadIds: Set<string>,
    excludeContactIds: Set<string>,
  ): Promise<{ kind: 'Lead' | 'Contact'; doc: any } | null> {
    const key = linkedInProfileKey(linkedinUrl);
    if (!key) return null;
    const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`linkedin\\.com/in/${safe}(/|$|\\?)`, 'i');

    const contact = await this.contactModel
      .findOne({
        _id: { $nin: this.toObjectIdSet(excludeContactIds) },
        linkedinUrl: { $regex: re },
      })
      .lean()
      .exec();
    if (contact && linkedInProfileKey(contact.linkedinUrl) === key) {
      // Lead was deleted but contact remains (contacts are superset). Drop stale sourceLead link only.
      if (contact.sourceLead) {
        const parentLead = await this.leadModel.findById(contact.sourceLead).select('_id').lean().exec();
        if (!parentLead) {
          await this.contactModel
            .findByIdAndUpdate(contact._id, { $unset: { sourceLead: 1 } })
            .exec();
          const fresh = await this.contactModel.findById(contact._id).lean().exec();
          if (fresh) return { kind: 'Contact', doc: fresh };
          return null;
        }
      }
      return { kind: 'Contact', doc: contact };
    }
    return null;
  }

  private async findPhoneConflict(
    norm: string,
    excludeLeadIds: Set<string>,
    excludeContactIds: Set<string>,
  ): Promise<{ kind: 'Lead' | 'Contact'; doc: any } | null> {
    if (norm.length < 7) return null;
    const tail = norm.slice(-Math.min(15, norm.length));
    const safeTail = tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(safeTail);

    const leads = await this.leadModel
      .find({
        _id: { $nin: this.toObjectIdSet(excludeLeadIds) },
        $or: [{ mobileNo: { $regex: re } }, { phone: { $regex: re } }],
      })
      .limit(80)
      .lean()
      .exec();
    for (const L of leads) {
      if (
        normalizePhoneDigits(L.mobileNo) === norm ||
        normalizePhoneDigits(L.phone) === norm
      ) {
        return { kind: 'Lead', doc: L };
      }
    }

    const contacts = await this.contactModel
      .find({
        _id: { $nin: this.toObjectIdSet(excludeContactIds) },
        $or: [{ mobileNo: { $regex: re } }, { phone: { $regex: re } }],
      })
      .limit(80)
      .lean()
      .exec();
    for (const C of contacts) {
      if (
        normalizePhoneDigits(C.mobileNo) === norm ||
        normalizePhoneDigits(C.phone) === norm
      ) {
        return { kind: 'Contact', doc: C };
      }
    }
    return null;
  }

  private conflictMessage(
    fieldLabel: string,
    hit: { kind: 'Lead' | 'Contact'; doc: any },
  ): string {
    const d = hit.doc;
    const name = displayName(d.firstName, d.lastName);
    return `This ${fieldLabel} is already used by ${hit.kind} "${name}". Open that record instead of creating a duplicate.`;
  }

  private async assertPersonContactIdentifiersValid(opts: {
    entity: 'lead' | 'contact';
    merged: Record<string, any>;
    excludeLeadId?: string;
    excludeContactId?: string;
    existingLead?: any;
    existingContact?: any;
  }): Promise<void> {
    const merged = opts.merged || {};
    const platform =
      isPlatformLeadType(merged.leadType) ||
      (opts.existingLead && isPlatformLeadType((opts.existingLead as any).leadType));
    if (platform) {
      if (!hasValidPlatformLeadIdentity(merged)) {
        throw new BadRequestException(
          'Platform opportunity requires a marketplace (e.g. Upwork) and either a valid https listing/project URL or a client name on the platform.',
        );
      }
    } else if (!hasAtLeastOneContactOrPortalListing(merged)) {
      throw new BadRequestException(
        opts.entity === 'lead'
          ? 'Add at least one of email, phone (mobile or alternate), or a valid https job/freelance listing URL so we can track this prospect.'
          : 'Add at least one of email, phone (mobile or alternate), LinkedIn URL, or a valid https job/freelance listing URL so we can track this prospect.',
      );
    }

    const excludeLeadIds = new Set<string>();
    const excludeContactIds = new Set<string>();
    if (opts.excludeLeadId) excludeLeadIds.add(opts.excludeLeadId);
    if (opts.excludeContactId) excludeContactIds.add(opts.excludeContactId);

    await this.augmentExcludeIdsForSyncPair({
      entity: opts.entity,
      merged,
      excludeLeadIds,
      excludeContactIds,
      existingLead: opts.existingLead,
      existingContact: opts.existingContact,
    });

    const em = normalizeEmail(merged.email);
    if (em) {
      const hit = await this.findEmailConflict(
        merged.email,
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit)
        throw new BadRequestException(
          this.conflictMessage('email address', hit),
        );
    }

    const liRaw = merged.linkedinUrl;
    if (liRaw != null && String(liRaw).trim() && normalizeLinkedInUrl(liRaw)) {
      const hit = await this.findLinkedInConflict(
        String(liRaw),
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit)
        throw new BadRequestException(
          this.conflictMessage('LinkedIn profile', hit),
        );
    }

    for (const field of ['mobileNo', 'phone'] as const) {
      const raw = merged[field];
      if (raw == null || String(raw).trim() === '') continue;
      const norm = normalizePhoneDigits(String(raw));
      if (norm.length < 7) continue;
      const hit = await this.findPhoneConflict(
        norm,
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit) {
        const label = field === 'mobileNo' ? 'mobile number' : 'phone number';
        throw new BadRequestException(this.conflictMessage(label, hit));
      }
    }
  }

  /**
   * Real-time duplicate check for CRM forms (query non-empty fields only).
   */
  async checkPersonIdentifiers(q: {
    email?: string;
    mobileNo?: string;
    phone?: string;
    linkedinUrl?: string;
    entityType: 'lead' | 'contact';
    excludeLeadId?: string;
    excludeContactId?: string;
  }): Promise<{
    conflicts: Record<
      string,
      {
        entityType: 'Lead' | 'Contact';
        id: string;
        name: string;
        message: string;
      }
    >;
  }> {
    const conflicts: Record<
      string,
      {
        entityType: 'Lead' | 'Contact';
        id: string;
        name: string;
        message: string;
      }
    > = {};

    const existingLead = q.excludeLeadId
      ? await this.leadModel.findById(q.excludeLeadId).lean().exec()
      : null;
    const existingContact = q.excludeContactId
      ? await this.contactModel.findById(q.excludeContactId).lean().exec()
      : null;

    const merged: Record<string, any> = {
      email: q.email,
      mobileNo: q.mobileNo,
      phone: q.phone,
      linkedinUrl: q.linkedinUrl,
    };

    const excludeLeadIds = new Set<string>();
    const excludeContactIds = new Set<string>();
    if (q.excludeLeadId) excludeLeadIds.add(q.excludeLeadId);
    if (q.excludeContactId) excludeContactIds.add(q.excludeContactId);

    await this.augmentExcludeIdsForSyncPair({
      entity: q.entityType,
      merged,
      excludeLeadIds,
      excludeContactIds,
      existingLead: existingLead || undefined,
      existingContact: existingContact || undefined,
    });

    if (q.email != null && String(q.email).trim()) {
      const hit = await this.findEmailConflict(
        q.email,
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit) {
        const d = hit.doc;
        conflicts.email = {
          entityType: hit.kind,
          id: String(d._id),
          name: displayName(d.firstName, d.lastName),
          message: this.conflictMessage('email address', hit),
        };
      }
    }

    if (
      q.linkedinUrl != null &&
      String(q.linkedinUrl).trim() &&
      normalizeLinkedInUrl(q.linkedinUrl)
    ) {
      const hit = await this.findLinkedInConflict(
        q.linkedinUrl,
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit) {
        const d = hit.doc;
        conflicts.linkedinUrl = {
          entityType: hit.kind,
          id: String(d._id),
          name: displayName(d.firstName, d.lastName),
          message: this.conflictMessage('LinkedIn profile', hit),
        };
      }
    }

    for (const field of ['mobileNo', 'phone'] as const) {
      const raw = q[field];
      if (raw == null || String(raw).trim() === '') continue;
      const norm = normalizePhoneDigits(String(raw));
      if (norm.length < 7) continue;
      const hit = await this.findPhoneConflict(
        norm,
        excludeLeadIds,
        excludeContactIds,
      );
      if (hit) {
        const d = hit.doc;
        const label = field === 'mobileNo' ? 'mobile number' : 'phone number';
        conflicts[field] = {
          entityType: hit.kind,
          id: String(d._id),
          name: displayName(d.firstName, d.lastName),
          message: this.conflictMessage(label, hit),
        };
      }
    }

    return { conflicts };
  }

  /**
   * Keeps Contacts in sync with Leads: create or update contact; does not run on delete.
   * If email is missing, syncs based on the sourceLead linkage.
   */
  private async syncContactFromLead(lead: any): Promise<any> {
    const email = (lead?.email || '').trim();
    // Allow syncing even without email if we have enough name data
    if (!email && !lead?.firstName?.trim() && !lead?.lastName?.trim()) return null;

    const patch: Record<string, unknown> = {
      firstName: lead.firstName || 'Unknown',
      lastName: lead.lastName || '',
      ...(email ? { email } : {}),
      salutation: lead.salutation || undefined,
      gender: lead.gender || undefined,
      phone: lead.phone || undefined,
      mobileNo: lead.mobileNo || undefined,
      organization: lead.organization || undefined,
      jobTitle: lead.jobTitle || undefined,
      industry: lead.industry || undefined,
      annualRevenue: lead.annualRevenue ?? undefined,
      noOfEmployees: lead.noOfEmployees || undefined,
      leadOwner: lead.leadOwner || undefined,
      website: lead.website || undefined,
      territory: lead.territory || undefined,
      image: lead.image || undefined,
      status: lead.status || undefined,
      stage: lead.stage || undefined,
      pipeline: lead.pipeline || undefined,
    };
    if (lead.converted !== undefined && lead.converted !== null) {
      patch.converted = !!lead.converted;
    }
    if (Array.isArray(lead.additionalEmails) && lead.additionalEmails.length) {
      patch.additionalEmails = lead.additionalEmails;
    }

    Object.keys(patch).forEach(
      (k) => patch[k] === undefined && delete patch[k],
    );

    const leadOid = new Types.ObjectId(String(lead._id));

    let existing: any = null;
    if (email) {
      existing = await this.contactModel.findOne({ email: this.emailRegexForMatch(email) }).exec();
    }
    if (!existing) {
      existing = await this.contactModel.findOne({ sourceLead: leadOid }).exec();
    }

    // Ensure we pick up ALL organizations linked to the lead
    const leadOrgIds = this.objectIdListFromDocField(lead.associatedOrganizations);
    if (leadOrgIds.length) {
      const prev = this.objectIdListFromDocField(existing?.associatedOrganizations).map(String);
      const merged = [
        ...new Set([...prev, ...leadOrgIds.map(String)]),
      ].filter((id) => Types.ObjectId.isValid(id));
      
      if (merged.length) {
        (patch as any).associatedOrganizations = merged.map(
          (id) => new Types.ObjectId(id),
        );
      }
    }

    const cf = this.mergeCustomFieldsMaps(
      existing?.customFields,
      lead?.customFields,
    );
    if (Object.keys(cf).length) patch.customFields = cf;

    if (!existing || !(existing as any).sourceLead) {
      patch.sourceLead = leadOid;
    }

    if (existing) {
      const previousContact =
        existing.toObject() as unknown as Record<string, unknown>;
      await this.contactModel.findByIdAndUpdate(existing._id, {
        ...patch,
        $addToSet: { associatedLeads: leadOid }
      }).exec();
      const updatedContact = await this.contactModel
        .findById(existing._id)
        .exec();
      if (updatedContact) {
        await this.syncContactAssociationMirrors(
          String(existing._id),
          previousContact,
          {
            associatedOrganizations: this.objectIdListFromDocField(
              updatedContact.associatedOrganizations,
            ),
            associatedContacts: this.objectIdListFromDocField(
              updatedContact.associatedContacts,
            ),
          },
        );
      }
      return updatedContact;
    } else {
      const created = await this.contactModel.create({
        ...patch,
        associatedLeads: [leadOid],
        sourceLead: leadOid,
        ...(lead.createdBy ? { createdBy: lead.createdBy } : {}),
        recordId: await this.nextRecordId(this.contactModel),
      });
      await this.syncContactAssociationMirrors(
        String(created._id),
        {
          associatedOrganizations: [],
          associatedContacts: [],
        },
        {
          associatedOrganizations: this.objectIdListFromDocField(
            created.associatedOrganizations,
          ),
          associatedContacts: this.objectIdListFromDocField(
            created.associatedContacts,
          ),
        },
      );

      // Log creation activity (Professional Tone)
      const authorId = lead.createdBy || lead.leadOwner;
      const leadFullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'lead';
      await this.createActivity({
        type: 'System',
        title: 'Contact Created',
        content: `Contact profile was established from Lead: ${leadFullName}.`,
        relatedTo: created._id,
        relatedType: 'Contact',
        author: authorId,
      });

      return created;
    }
  }

  private async syncContactFromLeadSafe(lead: any): Promise<any> {
    try {
      return await this.syncContactFromLead(lead);
    } catch (err: any) {
      console.error(
        '[CRMService] syncContactFromLead failed:',
        err?.message || err,
      );
      return null;
    }
  }

  /**
   * Reverse of syncContactFromLead: keeps the originating Lead's duplicated
   * fields aligned when a Contact is edited directly (Contact was previously
   * a write-only mirror target — edits never flowed back). Only pushes to the
   * contact's `sourceLead` (or a lead matched by email if sourceLead is
   * unset) — does not fan out across every entry in `associatedLeads`.
   *
   * Deliberately excludes `converted`/`status`/`stage` (pipeline progression
   * is lead-owned state; a contact-side edit shouldn't silently move the
   * lead's stage).
   */
  private async syncLeadFromContact(contact: any): Promise<any> {
    const email = (contact?.email || '').trim();
    if (!email && !contact?.firstName?.trim() && !contact?.lastName?.trim())
      return null;

    let existing: any = null;
    if (contact?.sourceLead) {
      existing = await this.leadModel.findById(contact.sourceLead).exec();
    }
    if (!existing && email) {
      existing = await this.leadModel
        .findOne({ email: this.emailRegexForMatch(email) })
        .exec();
    }
    if (!existing) return null;

    // Contact.organization stores an Organization ObjectId (see updateContact/
    // ensureOrganization); Lead.organization stores the plain company name.
    let orgName: string | undefined;
    if (contact.organization) {
      if (Types.ObjectId.isValid(String(contact.organization))) {
        const org = await this.organizationModel
          .findById(contact.organization)
          .select('name')
          .lean()
          .exec();
        orgName = org?.name;
      } else {
        orgName = String(contact.organization);
      }
    }

    const patch: Record<string, unknown> = {
      firstName: contact.firstName || undefined,
      lastName: contact.lastName || undefined,
      ...(email ? { email } : {}),
      salutation: contact.salutation || undefined,
      gender: contact.gender || undefined,
      phone: contact.phone || undefined,
      mobileNo: contact.mobileNo || undefined,
      organization: orgName,
      jobTitle: contact.jobTitle || undefined,
      industry: contact.industry || undefined,
      annualRevenue: contact.annualRevenue ?? undefined,
      noOfEmployees: contact.noOfEmployees || undefined,
      leadOwner: contact.leadOwner || undefined,
      website: contact.website || undefined,
      territory: contact.territory || undefined,
      image: contact.image || undefined,
    };
    if (Array.isArray(contact.additionalEmails) && contact.additionalEmails.length) {
      patch.additionalEmails = contact.additionalEmails;
    }

    Object.keys(patch).forEach(
      (k) => patch[k] === undefined && delete patch[k],
    );

    const cf = this.mergeCustomFieldsMaps(
      existing?.customFields,
      contact?.customFields,
    );
    if (Object.keys(cf).length) patch.customFields = cf;

    if (!Object.keys(patch).length) return null;

    await this.leadModel.findByIdAndUpdate(existing._id, patch).exec();
    return this.leadModel.findById(existing._id).exec();
  }

  private async syncLeadFromContactSafe(contact: any): Promise<any> {
    try {
      return await this.syncLeadFromContact(contact);
    } catch (err: any) {
      console.error(
        '[CRMService] syncLeadFromContact failed:',
        err?.message || err,
      );
      return null;
    }
  }

  /**
   * Keeps Contacts in sync with Clients by email. Called after client create/update.
   * Deleting a client does not delete the contact.
   */
  async syncContactFromClient(client: any): Promise<void> {
    const email = (client?.email || '').trim();
    if (!email || !email.includes('@')) return;

    let orgName: string | undefined;
    const org = client.organization;
    if (org) {
      if (
        typeof org === 'object' &&
        org !== null &&
        'name' in org &&
        org.name
      ) {
        orgName = String(org.name);
      } else if (Types.ObjectId.isValid(String(org))) {
        const o = await this.organizationModel.findById(org).lean().exec();
        orgName = o?.name;
      }
    }

    const parts = (client.name || '').trim().split(/\s+/);
    const emailRegex = this.emailRegexForMatch(email);
    const patch: Record<string, unknown> = {
      firstName: parts[0] || 'Unknown',
      lastName: parts.slice(1).join(' ') || '',
      email,
      phone: client.phone || undefined,
      source: 'client',
    };
    if (Array.isArray(client.additionalEmails) && client.additionalEmails.length) {
      patch.additionalEmails = client.additionalEmails;
    }
    if (orgName) patch.organization = orgName;
    Object.keys(patch).forEach(
      (k) => patch[k] === undefined && delete patch[k],
    );

    const existing = await this.contactModel
      .findOne({ email: emailRegex })
      .exec();
    const cf = this.mergeCustomFieldsMaps(
      existing?.customFields,
      client?.customFields,
    );
    if (Object.keys(cf).length) patch.customFields = cf;

    if (existing) {
      await this.contactModel.findByIdAndUpdate(existing._id, patch).exec();
    } else {
      await this.contactModel.create({
        ...patch,
        recordId: await this.nextRecordId(this.contactModel),
      });
    }
  }

  async syncContactFromClientSafe(client: any): Promise<void> {
    try {
      await this.syncContactFromClient(client);
    } catch (err: any) {
      console.error(
        '[CRMService] syncContactFromClient failed:',
        err?.message || err,
      );
    }
  }

  async getDashboardStats(
    days: number | string = 30,
    owner?: string,
    filtersStr?: string,
    user?: any,
    compare?: string,
  ) {
    let customFilters: any[] = [];
    if (filtersStr) {
      try {
        customFilters = JSON.parse(filtersStr);
      } catch (e) {
        console.warn(`Failed to parse dashboard filters: ${filtersStr}`);
      }
    }
    const data = await this.reportingService.getDashboardData(
      days,
      owner,
      customFilters,
      compare,
    );
    if (canViewCrmRevenue(user)) return data;
    const redacted = redactCrmRevenueForUser(user, data) as any;
    if (Array.isArray(redacted?.stats)) {
      redacted.stats = redacted.stats.filter(
        (s: { name?: string }) => s?.name !== 'total_revenue',
      );
    }
    return redacted;
  }

  async getBoardReports(days: number | string = 30, owner?: string) {
    return this.reportingService.getBoardReports(days, owner);
  }

  async getLeadsDashboardAnalytics(
    days: number | string = 30,
    owner?: string,
    compare?: string,
  ) {
    return this.reportingService.getLeadsDashboardAnalytics(days, owner, compare);
  }

  async getAgentPerformanceSummary(agentId: string) {
    return this.reportingService.getAgentPerformanceSummary(agentId);
  }

  async getAgentPerformanceLeaderboard(window: string) {
    return this.reportingService.getAgentPerformanceLeaderboard(window);
  }

  async getAgentTargets() {
    return this.reportingService.getAgentTargets();
  }

  async upsertAgentTarget(agentId: string, patch: Record<string, number>) {
    return this.reportingService.upsertAgentTarget(agentId, patch);
  }

  async getSalesDepartmentHealth(window: string = 'this_week', owner?: string) {
    return this.reportingService.getSalesDepartmentHealth(window, owner);
  }

  async getReportSummaryCharts(window: string = 'today', owner?: string) {
    return this.reportingService.getReportSummaryCharts(window, owner);
  }

  async getSalesAttention(owner?: string) {
    return this.reportingService.getSalesAttention(owner);
  }

  async getSalesWorkspace(
    ownerQuery: string | undefined,
    reqUser: any,
    windowQuery?: string,
    sectionsQuery?: string,
  ) {
    const admin = this.isCrmWorkspaceAdmin(reqUser);
    let effectiveOwner: string;
    let scopedAuthorId: Types.ObjectId | null = null;
    const ownerMatchExtras: string[] = [];

    const pushEmailIfDistinct = (email: string | null | undefined) => {
      const em = String(email || '').trim();
      if (!em) return;
      if (em.toLowerCase() === String(effectiveOwner || '').toLowerCase())
        return;
      if (!ownerMatchExtras.some((x) => x.toLowerCase() === em.toLowerCase())) {
        ownerMatchExtras.push(em);
      }
    };

    if (admin) {
      const q = ownerQuery?.trim();
      if (!q || q.toLowerCase() === 'all') {
        effectiveOwner = 'All';
        scopedAuthorId = null;
      } else if (Types.ObjectId.isValid(q) && String(q).length === 24) {
        const oid = new Types.ObjectId(q);
        scopedAuthorId = oid;
        const label =
          await this.reportingService.getHrmsDisplayOwnerLabel(oid);
        effectiveOwner = label || q;
        // Always match legacy rows that stored the user id hex in leadOwner.
        ownerMatchExtras.push(String(oid));
        pushEmailIfDistinct(
          await this.reportingService.getHrmsUserEmail(oid),
        );
      } else {
        effectiveOwner = q;
        scopedAuthorId =
          await this.reportingService.resolveHrmsAuthorId(effectiveOwner);
        if (scopedAuthorId) {
          ownerMatchExtras.push(String(scopedAuthorId));
          pushEmailIfDistinct(
            await this.reportingService.getHrmsUserEmail(scopedAuthorId),
          );
        }
      }
    } else {
      const q = ownerQuery?.trim();
      const authorizedIds = (reqUser?.salesWorkspaceAccessibleEmployees || []).map(
        (id: any) => String(id),
      );

      // If non-admin requests a specific authorized owner
      if (
        q &&
        q.toLowerCase() !== 'all' &&
        Types.ObjectId.isValid(q) &&
        authorizedIds.includes(q)
      ) {
        const oid = new Types.ObjectId(q);
        scopedAuthorId = oid;
        const label = await this.reportingService.getHrmsDisplayOwnerLabel(oid);
        effectiveOwner = label || q;
        ownerMatchExtras.push(String(oid));
        pushEmailIfDistinct(await this.reportingService.getHrmsUserEmail(oid));
      } else if (q && q.toLowerCase() === 'all' && authorizedIds.length > 0) {
        // Allow authorized "All" view for non-admins with specific permissions
        effectiveOwner = 'All authorized';
        const allOids = authorizedIds.map((id: string) => new Types.ObjectId(id));

        // Ensure current user is included in the aggregate view
        const selfOidRaw = reqUser?.userId || reqUser?._id;
        if (selfOidRaw && Types.ObjectId.isValid(String(selfOidRaw))) {
          const selfOid = new Types.ObjectId(String(selfOidRaw));
          if (!authorizedIds.includes(String(selfOid))) {
            allOids.push(selfOid);
            pushEmailIfDistinct(reqUser?.email);
            const selfLabel = this.repOwnerLabelFromUser(reqUser);
            if (selfLabel) ownerMatchExtras.push(selfLabel);
            ownerMatchExtras.push(String(selfOid));
          }
        }

        scopedAuthorId = allOids;

        // Resolve all teammates' names/emails for DB string-matching (Leads)
        for (const aid of allOids) {
          const label = await this.reportingService.getHrmsDisplayOwnerLabel(aid);
          if (label) ownerMatchExtras.push(label);
          ownerMatchExtras.push(String(aid));
          const email = await this.reportingService.getHrmsUserEmail(aid);
          if (email) pushEmailIfDistinct(email);
        }
      } else {
        // Default to self
        effectiveOwner = this.repOwnerLabelFromUser(reqUser);
        const raw = reqUser?.userId || reqUser?._id;
        if (raw && Types.ObjectId.isValid(String(raw))) {
          scopedAuthorId = new Types.ObjectId(String(raw));
          ownerMatchExtras.push(String(raw));
        }
        if (!scopedAuthorId) {
          scopedAuthorId = await this.reportingService.resolveHrmsAuthorId(
            effectiveOwner,
          );
          if (scopedAuthorId) ownerMatchExtras.push(String(scopedAuthorId));
        }
        pushEmailIfDistinct(reqUser?.email);
      }
    }

    return redactCrmRevenueForUser(
      reqUser,
      await this.reportingService.getSalesWorkspace(
        effectiveOwner,
        scopedAuthorId,
        ownerMatchExtras.length ? ownerMatchExtras : undefined,
        windowQuery,
        sectionsQuery,
      ),
    );
  }

  /**
   * Roles that may open any rep’s workspace (team summary / owner picker).
   * Uses the same full-data scope as CRM RBAC (HRMS management role, CRM DB role, :read:all perms).
   */
  private isCrmWorkspaceAdmin(user?: any): boolean {
    return hasCrmFullDataAccess(user);
  }

  private repOwnerLabelFromUser(user?: any): string {
    if (!user) return 'Unknown';
    const fn = String(user.firstName || '').trim();
    const ln = String(user.lastName || '').trim();
    const n = [fn, ln].filter(Boolean).join(' ');
    if (n) return n;
    const email = String(user.email || '').trim();
    return email || 'Unknown';
  }

  private crmPermissionSet(user?: any): Set<string> {
    const hrms = Array.isArray(user?.permissions) ? user.permissions : [];
    const crm = Array.isArray(user?.crmPermissions) ? user.crmPermissions : [];
    return new Set([...hrms, ...crm].map((p: any) => String(p || '').trim()));
  }

  private isCrmDataScopeBypass(user?: any): boolean {
    return hasCrmFullDataAccess(user);
  }

  private canReadAllModuleData(moduleKey: 'leads' | 'contacts', user?: any): boolean {
    if (hasCrmFullDataAccess(user)) return true;
    const perms = this.crmPermissionSet(user);
    return perms.has(`${moduleKey}:read:all`);
  }

  /** Middle tier between "own" and "all" — Team Lead/Manager scoped to their own team only. */
  private canReadTeamModuleData(moduleKey: 'leads' | 'contacts', user?: any): boolean {
    if (hasCrmFullDataAccess(user)) return true;
    const perms = this.crmPermissionSet(user);
    return perms.has(`${moduleKey}:read:team`);
  }

  /** Direct reports (reportsTo === me) — the "team" a Team Lead/Manager is scoped to. */
  private async teamMemberIdsAndNames(
    user?: any,
  ): Promise<{ ids: Types.ObjectId[]; names: string[] }> {
    const selfId = this.userObjectId(user);
    if (!selfId) return { ids: [], names: [] };
    const reports = await this.hrmsUserModel
      .find({ reportsTo: selfId })
      .select('_id firstName lastName email')
      .lean();
    const ids = reports.map((r: any) => r._id as Types.ObjectId);
    const names = reports
      .map((r: any) => [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email)
      .filter(Boolean);
    return { ids, names };
  }

  /** Self + direct reports, matched the same way as *OwnershipFilter (owner label, createdBy, sharedWith). */
  private async teamOwnershipFilter(
    ownerField: 'leadOwner',
    user?: any,
  ): Promise<Record<string, unknown>> {
    const selfId = this.userObjectId(user);
    const { ids: teamIds, names: teamNames } = await this.teamMemberIdsAndNames(user);
    const allIds = selfId ? [selfId, ...teamIds] : teamIds;
    const allNames = [this.ownerLabel(user), ...teamNames].filter(Boolean);
    const or: Record<string, unknown>[] = [];
    if (allNames.length) or.push({ [ownerField]: { $in: allNames } });
    if (allIds.length) {
      or.push({ createdBy: { $in: allIds } });
      or.push({ sharedWith: { $in: allIds } });
      or.push({ [ownerField]: { $in: allIds.map((id) => String(id)) } });
    }
    return or.length ? { $or: or } : { _id: null };
  }

  private canReadModule(
    moduleKey: 'leads' | 'contacts' | 'clients' | 'organizations',
    user?: any,
  ): boolean {
    if (hasCrmFullDataAccess(user)) return true;
    const perms = this.crmPermissionSet(user);
    return perms.has(`${moduleKey}:read`) || perms.has(`${moduleKey}:read:all`);
  }

  private userObjectId(user?: any): Types.ObjectId | null {
    const raw = user?._id || user?.userId || null;
    if (!raw) return null;
    return Types.ObjectId.isValid(String(raw)) ? new Types.ObjectId(String(raw)) : null;
  }

  private ownerLabel(user?: any): string {
    return this.repOwnerLabelFromUser(user).trim();
  }

  private leadOwnershipFilter(user?: any): Record<string, unknown> {
    const ownerName = this.ownerLabel(user);
    const userId = this.userObjectId(user);
    const mineOr: Record<string, unknown>[] = [{ leadOwner: ownerName }];
    if (userId) {
      mineOr.push({ createdBy: userId } as any);
      mineOr.push({ sharedWith: userId } as any);
      // Legacy rows may store the user ObjectId hex in leadOwner.
      mineOr.push({ leadOwner: String(userId) });
    }
    return { $or: mineOr };
  }

  private contactOwnershipFilter(user?: any): Record<string, unknown> {
    const ownerName = this.ownerLabel(user);
    const userId = this.userObjectId(user);
    const mineOr: Record<string, unknown>[] = [
      { leadOwner: ownerName },
      { contactOwner: ownerName } as any,
    ];
    if (userId) {
      mineOr.push({ createdBy: userId } as any);
      mineOr.push({ sharedWith: userId } as any);
    }
    return { $or: mineOr };
  }

  // --- Leads ---
  async createLead(dto: any, user?: any): Promise<Lead> {
    if (!canViewCrmRevenue(user)) {
      delete dto.annualRevenue;
    }

    // Workspace boundary: keep an explicit valid module, else inherit the creator's
    // own workspace-scoped role, else fall back to the 2Bigha default.
    if (!CRM_WORKSPACE_MODULES.includes(dto.module)) {
      const roleModule = resolveRoleModule(user?.crmDbUser);
      dto.module =
        roleModule === CRM_ROLE_MODULE_ALL ? DEFAULT_LEAD_WORKSPACE_MODULE : roleModule;
    }

    if (dto.organization) await this.ensureOrganization(dto.organization, dto);

    // Enforce assigned pipeline for restricted employees
    if (user && user.assignedLeadsPipeline) {
      dto.pipeline = user.assignedLeadsPipeline;
    }

    // Lead owner is always the user who creates the record (ignore client payload).
    // Same label as sales workspace / getSalesAttention owner filter.
    if (user) {
      dto.leadOwner = this.repOwnerLabelFromUser(user);
      const rawId = user.userId ?? user._id;
      if (rawId && Types.ObjectId.isValid(String(rawId))) {
        dto.createdBy = new Types.ObjectId(String(rawId));
      }
      // Denormalized so "search by Created By / agent name" doesn't need a $lookup.
      if (user.firstName || user.lastName) {
        dto.createdByName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
    }

    // Final sanitization for ObjectId fields
    dto.pipeline = this.toObjectIdSafe(dto.pipeline);
    if (dto.relatedService !== undefined) {
      const v = dto.relatedService;
      if (v === null || v === '') delete dto.relatedService;
      else {
        const oid = this.toObjectIdSafe(v);
        if (oid) dto.relatedService = oid;
        else delete dto.relatedService;
      }
    }
    // Add Lead client-selection step: link the picked/created Client, if any.
    if (dto.clientId !== undefined) {
      const v = dto.clientId;
      if (v === null || v === '') delete dto.clientId;
      else {
        const oid = this.toObjectIdSafe(v);
        if (oid) dto.clientId = oid;
        else delete dto.clientId;
      }
    }
    if (typeof dto.leadCategory === 'string') {
      dto.leadCategory = dto.leadCategory.trim() || undefined;
    }
    if (typeof dto.group === 'string') {
      dto.group = dto.group.trim() || undefined;
    }
    // Property Listing / Property Management vertical — reject unknown values rather than
    // letting a stray client payload silently drop it (schema default only applies when unset).
    if (dto.leadVertical !== undefined) {
      dto.leadVertical =
        dto.leadVertical === 'property_management' ||
        dto.leadVertical === 'property_listing'
          ? dto.leadVertical
          : undefined;
    }
    if (typeof dto.notes === 'string') {
      dto.notes = dto.notes.trim() || undefined;
    }
    if (dto.nextFollowUpAt !== undefined) {
      const parsed = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;
      dto.nextFollowUpAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
    }
    if (dto.leadIntents !== undefined) {
      dto.leadIntents = Array.isArray(dto.leadIntents)
        ? Array.from(new Set(dto.leadIntents.map((v: unknown) => String(v || '').trim()).filter(Boolean)))
        : [];
    }
    if (dto.leadIntentFollowUpAt !== undefined) {
      const parsed = dto.leadIntentFollowUpAt ? new Date(dto.leadIntentFollowUpAt) : null;
      dto.leadIntentFollowUpAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
    }
    if (dto.phone) dto.phone = this.sanitizePhone(dto.phone);
    if (dto.mobileNo) dto.mobileNo = this.sanitizePhone(dto.mobileNo);
    if (dto.twitterHandle !== undefined) {
      const h = normalizeTwitterHandle(dto.twitterHandle);
      dto.twitterHandle = h || undefined;
    }
    if (dto.sharedWith !== undefined) {
      dto.sharedWith = this.normalizeObjectIdArray(dto.sharedWith);
    }

    const requestedLeadRecordId = dto.recordId;
    delete dto.recordId;

    await this.assertPersonContactIdentifiersValid({
      entity: 'lead',
      merged: { ...dto },
    });

    dto.recordId = await this.nextRecordId(
      this.leadModel,
      requestedLeadRecordId,
    );

    const lead = await new this.leadModel(dto).save();

    // Log the Lead Intent history event for analytics (Lead.leadIntents itself was already saved above).
    if (dto.leadIntents?.length) {
      await this.leadIntentService.recordIntent(
        String(lead._id),
        dto.leadIntents,
        dto.leadIntentFollowUpAt,
        'add_lead_form',
        user,
      );
    }

    // 0. Link the Client picked/created in the Add Lead client-selection step (optional).
    if (dto.clientId) {
      await this.clientModel
        .updateOne({ _id: dto.clientId }, { $addToSet: { associatedLeads: lead._id } })
        .exec();
    }

    // 1. Link Organization
    if (dto.organization && dto.organization.trim()) {
      const orgName = dto.organization.trim();
      let org = await this.organizationModel
        .findOne({
          name: {
            $regex: new RegExp(`^${this.escapeRegex(orgName)}$`, 'i'),
          },
        })
        .exec();

      if (!org) {
        org = await this.organizationModel.create({
          name: orgName,
          recordId: await this.nextRecordId(this.organizationModel),
          ...(lead.createdBy ? { createdBy: lead.createdBy } : {}),
        });
      }

      if (org) {
        await this.leadModel.findByIdAndUpdate(lead._id, { $addToSet: { associatedOrganizations: org._id } }).exec();
        await this.organizationModel
          .updateOne(
            { _id: org._id },
            { $addToSet: { associatedLeads: lead._id } },
          )
          .exec();
        await this.bustCrmCache('organizations', String(org._id));
        // Update local object for downstream sync transparency
        if (!(lead as any).associatedOrganizations) (lead as any).associatedOrganizations = [];
        (lead as any).associatedOrganizations.push(org._id);
      }
    }

    // 2. Sync Contact (ensuring it picks up the Org ID from the updated lead object)
    const syncedContact = await this.syncContactFromLeadSafe(lead.toObject ? lead.toObject() : lead);

    // 3. LOG UNIFIED ACTIVITY (Professional Tone)
    // By logging on the Lead, our enhanced createActivity will automatically tag the Org and Contact.
    const authorId = user?.userId || user?._id || lead.createdBy;
    const authorName = user ? `${user.firstName} ${user.lastName}` : 'System';
    const leadFullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'a new lead';

    await this.createActivity({
      type: 'System',
      title: 'Lead Created',
      content: `${authorName} created a new Lead: ${leadFullName}${dto.organization ? ` with company ${dto.organization}` : ''}.`,
      relatedTo: lead._id,
      relatedType: 'Lead',
      author: authorId,
    });

    this.workflowsService.dispatch({
      trigger: 'lead_created',
      entityType: 'Lead',
      entityId: lead._id,
      record: this.entityPlain(lead),
      user,
    });
    void this.leadEngagementAutomation.onLeadCreated(String(lead._id), user);
    this.notifySalesAgent({
      trigger: 'lead_created',
      recordType: 'Lead',
      recordId: String(lead._id),
      user,
    });
    void this.leadEngagementAutomation.onLeadUpdated(String(lead._id));
    const fresh = await this.leadModel
      .findById(lead._id)
      .populate('relatedService', 'name')
      .exec();
    await this.bustCrmCache('leads', String(lead._id));
    return fresh || lead;
  }
  /** Narrow text search for CRM list endpoints (regex on string fields). */
  private appendCrmTextSearchFilter(
    filter: Record<string, unknown>,
    search: string | undefined,
    fields: string[],
  ): Record<string, unknown> {
    const q = search?.trim();
    if (!q) return filter;
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const searchPart = {
      $or: fields.map((f) => ({ [f]: rx })),
    };
    if (filter && typeof filter === 'object' && Array.isArray((filter as any).$and)) {
      return { $and: [...(filter as any).$and, searchPart] };
    }
    return { $and: [filter, searchPart] };
  }

  /**
   * Fetch non-converted leads (always paged — crore-scale safe).
   * Admins see everything; Users with 'leads:read' see everything unless restricted by pipeline.
   * Optional `pipelineId` (query param `pipeline`) scopes to that pipeline plus leads with no pipeline set
   * (same as the leads board: this pipeline OR no pipeline).
   * Users restricted to `assignedLeadsPipeline` keep the legacy strict match on that pipeline only.
   */
  async findAllLeads(
    user?: any,
    pipelineId?: string,
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      mine?: boolean;
      leadType?: 'standard' | 'platform';
      leadVertical?: 'property_listing' | 'property_management';
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
      includeConverted?: boolean;
    },
  ): Promise<ScalableListResult<Lead>> {
    const normalized = {
      ...listOpts,
      page: listOpts?.page && listOpts.page > 0 ? listOpts.page : CRM_DEFAULT_PAGE,
      pageSize: clampPageSize(
        listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
        CRM_MAX_BOARD_PAGE_SIZE,
      ),
    };
    const cache = this.appCache.resolveCrmListCache('leads', user, {
      pipelineId,
      listOpts: normalized,
    });
    if (cache) {
      return this.appCache.getOrSet(cache.key, cache.ttl, () =>
        this.findAllLeadsDb(user, pipelineId, normalized),
      );
    }
    return this.findAllLeadsDb(user, pipelineId, normalized);
  }

  private async findAllLeadsDb(
    user?: any,
    pipelineId?: string,
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      mine?: boolean;
      leadType?: 'standard' | 'platform';
      leadVertical?: 'property_listing' | 'property_management';
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
      includeConverted?: boolean;
    },
  ): Promise<ScalableListResult<Lead>> {
    // Equivalent to "not converted yet" while remaining index-friendly.
    const nonConverted = { converted: { $ne: true } };

    const isAdmin = this.isCrmWorkspaceAdmin(user);

    let filter: any;

    if (!isAdmin && user && user.assignedLeadsPipeline) {
      filter = {
        ...(listOpts?.includeConverted ? {} : nonConverted),
        pipeline: user.assignedLeadsPipeline,
      };
    } else if (
      pipelineId &&
      typeof pipelineId === 'string' &&
      isMongoObjectIdString(pipelineId.trim())
    ) {
      const pid = new Types.ObjectId(pipelineId.trim());
      filter = {
        $and: [
          ...(listOpts?.includeConverted ? [] : [nonConverted]),
          {
            $or: [
              { pipeline: pid },
              { pipeline: null },
              { pipeline: { $exists: false } },
            ],
          },
        ],
      };
    } else {
      filter = listOpts?.includeConverted ? {} : { ...nonConverted };
    }

    const canReadAll = this.canReadAllModuleData('leads', user);
    if (!canReadAll) {
      if (this.canReadTeamModuleData('leads', user)) {
        filter = { $and: [filter, await this.teamOwnershipFilter('leadOwner', user)] };
      } else {
        filter = { $and: [filter, this.leadOwnershipFilter(user)] };
      }
    } else if (listOpts?.mine && user) {
      filter = { $and: [filter, this.leadOwnershipFilter(user)] };
    }

    const moduleFilter = leadModuleFilter(user?.crmDbUser);
    if (Object.keys(moduleFilter).length) {
      filter = { $and: [filter, moduleFilter] };
    }

    if (listOpts?.leadType === 'platform') {
      filter = { $and: [filter, { leadType: 'platform' }] };
    } else if (listOpts?.leadType === 'standard') {
      filter = {
        $and: [
          filter,
          {
            $or: [
              { leadType: { $exists: false } },
              { leadType: null },
              { leadType: 'standard' },
            ],
          },
        ],
      };
    }

    if (listOpts?.leadVertical === 'property_management') {
      filter = { $and: [filter, { leadVertical: 'property_management' }] };
    } else if (listOpts?.leadVertical === 'property_listing') {
      // Leads created before this field existed default to 'property_listing' at the
      // schema level but older documents in the DB may still have it unset — include those too.
      filter = {
        $and: [
          filter,
          {
            $or: [
              { leadVertical: { $exists: false } },
              { leadVertical: null },
              { leadVertical: 'property_listing' },
            ],
          },
        ],
      };
    }

    if (listOpts?.search?.trim()) {
      const searchFields =
        listOpts.leadType === 'platform'
          ? [
              'firstName',
              'lastName',
              'opportunitySourcePlatform',
              'platformClientLabel',
              'jobTitle',
            ]
          : ['firstName', 'lastName', 'email', 'source', 'leadCategory', 'createdByName'];
      filter = this.appendCrmTextSearchFilter(
        filter,
        listOpts.search,
        searchFields,
      );
    }

    if (listOpts?.filters?.length) {
      filter = appendCrmListFilters(filter, listOpts.filters, 'leads');
    }

    filter = await this.applyListEmailEngagement(
      filter,
      'leads',
      listOpts?.emailEngagement,
    );

    const page = Math.max(1, listOpts?.page ?? CRM_DEFAULT_PAGE);
    const pageSize = clampPageSize(
      listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
      CRM_MAX_BOARD_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;
    const outreachSelect =
      '_id firstName lastName email organization status stage callStatus pipeline createdAt leadType leadVertical opportunitySourcePlatform opportunityListingUrl platformClientLabel platformEngagementStatus platformLastEngagedAt jobTitle leadOwner createdBy createdByName customFields mobileNo phone recordId relatedService twitterHandle clientId leadCategory group notes source nextFollowUpAt leadIntents leadIntentFollowUpAt';
    const [data, count] = await Promise.all([
      this.leadModel
        .find(filter)
        .select(outreachSelect)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      countDocumentsCapped(this.leadModel, filter),
    ]);
    return redactCrmRevenueForUser(
      user,
      buildScalableListResult(data as Lead[], {
        page,
        pageSize,
        total: count.total,
        totalIsApproximate: count.approximate,
      }),
    ) as ScalableListResult<Lead>;
  }
  async findOneLead(id: string, user?: any): Promise<Lead | null> {
    const key = this.appCache.crmDetailKey('leads', id, user);
    return this.appCache.getOrSet(key, this.appCache.crmDetailTtl(), () =>
      this.findOneLeadDb(id, user),
    );
  }

  private async findOneLeadDb(id: string, user?: any): Promise<Lead | null> {
    const assocPopulate = [
      { path: 'associatedOrganizations', select: 'name industry' },
      { path: 'associatedLeads', select: 'firstName lastName email status stage' },
      { path: 'associatedContacts', select: 'firstName lastName email stage' },
    ];
    let lead: Lead | null = null;
    if (isMongoObjectIdString(id)) {
      lead = await this.leadModel
        .findById(id)
        .populate('relatedService', 'name')
        .populate(assocPopulate)
        .exec();
    }
    if (!lead) {
      lead = await this.leadModel
        .findOne({ recordId: id })
        .populate('relatedService', 'name')
        .populate(assocPopulate)
        .exec();
    }

    // Final guard: check if user is restricted and lead belongs to their pipeline
    if (lead && user && user.assignedLeadsPipeline) {
      if (
        this.strId((lead as any).pipeline) !==
        this.strId(user.assignedLeadsPipeline)
      ) {
        return null;
      }
    }
    if (lead && user && !roleAllowsModule(user.crmDbUser, (lead as any).module)) {
      return null;
    }
    if (lead && user && !this.canReadAllModuleData('leads', user)) {
      const ownerName = this.ownerLabel(user);
      const userId = this.userObjectId(user);
      const byOwner = String((lead as any).leadOwner || '').trim() === ownerName;
      const byCreator =
        !!userId && String((lead as any).createdBy || '') === String(userId);
      const byShared =
        !!userId &&
        Array.isArray((lead as any).sharedWith) &&
        (lead as any).sharedWith.some((u: any) => String(u) === String(userId));
      let byTeam = false;
      if (!byOwner && !byCreator && !byShared && this.canReadTeamModuleData('leads', user)) {
        const { ids: teamIds, names: teamNames } = await this.teamMemberIdsAndNames(user);
        byTeam =
          teamNames.includes(String((lead as any).leadOwner || '').trim()) ||
          teamIds.some((id) => String(id) === String((lead as any).createdBy || ''));
      }
      if (!byOwner && !byCreator && !byShared && !byTeam) return null;
    }
    if (!lead) return null;
    const plain =
      typeof (lead as any).toObject === 'function'
        ? (lead as any).toObject()
        : lead;
    return redactCrmRevenueForUser(user, plain) as any;
  }
  async updateLead(id: string, dto: any, user?: any): Promise<Lead | null> {
    const leadPatchKeys = new Set(
      Object.keys(dto || {}).filter((k) => (dto as any)[k] !== undefined),
    );
    delete dto.recordId;
    if (!canViewCrmRevenue(user)) {
      delete dto.annualRevenue;
    }
    const resolvedId = await this.resolveDocumentId(this.leadModel, id);
    if (!resolvedId) return null;
    id = resolvedId;

    // Final sanitization for ObjectId fields
    if (dto.pipeline !== undefined)
      dto.pipeline = this.toObjectIdSafe(dto.pipeline);
    if (dto.sharedWith !== undefined) {
      dto.sharedWith = this.normalizeObjectIdArray(dto.sharedWith);
    }
    if (dto.relatedService !== undefined) {
      const v = dto.relatedService;
      if (v === null || v === '') dto.relatedService = null;
      else {
        const oid = this.toObjectIdSafe(v);
        dto.relatedService = oid ?? null;
      }
    }
    if (dto.phone !== undefined) dto.phone = this.sanitizePhone(dto.phone);
    if (dto.mobileNo !== undefined)
      dto.mobileNo = this.sanitizePhone(dto.mobileNo);
    if (dto.twitterHandle !== undefined) {
      const h = normalizeTwitterHandle(dto.twitterHandle);
      dto.twitterHandle = h || undefined;
    }
    if (dto.nextFollowUpAt !== undefined) {
      const parsed = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;
      dto.nextFollowUpAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
      // A changed/cleared follow-up date needs a fresh reminder cycle.
      dto.followUpReminderSentAt = null;
    }
    if (dto.leadVertical !== undefined) {
      if (dto.leadVertical !== 'property_management' && dto.leadVertical !== 'property_listing') {
        delete dto.leadVertical;
      }
    }
    let pendingIntentUpdate: { intents: string[]; followUpAt?: Date } | null = null;
    if (dto.leadIntents !== undefined) {
      const rawIntents: unknown[] = Array.isArray(dto.leadIntents) ? dto.leadIntents : [];
      const cleanIntents: string[] = Array.from(
        new Set(rawIntents.map((v) => String(v || '').trim()).filter(Boolean)),
      );
      dto.leadIntents = cleanIntents;
      if (dto.leadIntentFollowUpAt !== undefined) {
        const parsed = dto.leadIntentFollowUpAt ? new Date(dto.leadIntentFollowUpAt) : null;
        dto.leadIntentFollowUpAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
      }
      // Logged after the update succeeds so the analytics event only fires on a real change.
      pendingIntentUpdate = { intents: cleanIntents, followUpAt: dto.leadIntentFollowUpAt || undefined };
    }

    const leadAssocKeys = [
      'associatedOrganizations',
      'associatedLeads',
      'associatedContacts',
    ] as const;
    for (const key of leadAssocKeys) {
      if (dto[key] !== undefined) {
        let ids = this.normalizeObjectIdArray(dto[key]);
        if (key === 'associatedLeads') {
          ids = ids.filter((oid) => String(oid) !== id);
        }
        dto[key] = ids;
      }
    }

    let ensuredOrganizationId: Types.ObjectId | null = null;
    if (dto.organization) {
      ensuredOrganizationId = isMongoObjectIdString(String(dto.organization))
        ? this.toObjectIdSafe(dto.organization)
        : await this.ensureOrganization(dto.organization, dto);
    }

    const oldLead = await this.leadModel.findById(id).exec();
    if (dto.additionalEmails !== undefined) {
      const primary = String(dto.email ?? (oldLead as any)?.email ?? '')
        .trim()
        .toLowerCase();
      const raw = Array.isArray(dto.additionalEmails) ? dto.additionalEmails : [];
      const seen = new Set<string>();
      dto.additionalEmails = raw
        .map((e: unknown) => String(e ?? '').trim())
        .filter((e: string) => {
          if (!e || !e.includes('@')) return false;
          const low = e.toLowerCase();
          if (primary && low === primary) return false;
          if (seen.has(low)) return false;
          seen.add(low);
          return true;
        });
    }
    if (oldLead && user && !roleAllowsModule(user.crmDbUser, (oldLead as any).module)) {
      throw new ForbiddenException('This lead belongs to a different workspace.');
    }
    if (oldLead && user && !this.canReadAllModuleData('leads', user)) {
      const ownerName = this.ownerLabel(user);
      const userId = this.userObjectId(user);
      const isMineByOwner = String((oldLead as any).leadOwner || '').trim() === ownerName;
      const isMineByCreator =
        !!userId && String((oldLead as any).createdBy || '') === String(userId);
      const isSharedWithMe =
        !!userId &&
        Array.isArray((oldLead as any).sharedWith) &&
        (oldLead as any).sharedWith.some((u: any) => String(u) === String(userId));
      let isMineByTeam = false;
      if (
        !isMineByOwner &&
        !isMineByCreator &&
        !isSharedWithMe &&
        this.canReadTeamModuleData('leads', user)
      ) {
        const { ids: teamIds, names: teamNames } = await this.teamMemberIdsAndNames(user);
        isMineByTeam =
          teamNames.includes(String((oldLead as any).leadOwner || '').trim()) ||
          teamIds.some((id) => String(id) === String((oldLead as any).createdBy || ''));
      }
      if (!isMineByOwner && !isMineByCreator && !isSharedWithMe && !isMineByTeam) {
        throw new ForbiddenException('You can only edit your assigned leads.');
      }
    }
    if (user) {
      assertCrmPipelineScopedUpdate(user, {
        writePerm: 'leads:write',
        movePerm: 'leads:move_pipeline',
        allowedKeys: new Set(['pipeline', 'stage', 'status']),
        patchKeys: leadPatchKeys,
      });
    }
    if (oldLead) {
      const prev = oldLead.toObject ? oldLead.toObject() : oldLead;
      const merged = { ...prev, ...dto };
      await this.assertPersonContactIdentifiersValid({
        entity: 'lead',
        merged,
        excludeLeadId: id,
        existingLead: prev,
      });
    }
    if (oldLead) {
      const prev = oldLead.toObject() as unknown as Record<string, unknown>;
      const nextOrganizations =
        dto.associatedOrganizations !== undefined
          ? (dto.associatedOrganizations as Types.ObjectId[])
          : this.objectIdListFromDocField(prev.associatedOrganizations);
      if (
        ensuredOrganizationId &&
        !nextOrganizations.some(
          (orgId) => String(orgId) === String(ensuredOrganizationId),
        )
      ) {
        nextOrganizations.push(ensuredOrganizationId);
      }
      dto.associatedOrganizations = nextOrganizations;
      await this.syncLeadAssociationMirrors(id, prev, nextOrganizations);
    }

    // Dual-write remaining lead association arrays (mirrors are org-only today).
    // Best-effort only — never fail the lead update.
    if (oldLead) {
      const prevAny = oldLead as any;
      if (dto.associatedContacts !== undefined) {
        const prevC = this.objectIdListFromDocField(prevAny.associatedContacts);
        const nextC = this.normalizeObjectIdArray(dto.associatedContacts);
        const { removed, added } = this.setDiffIds(prevC, nextC);
        this.queueAssociationMirror({
          fromType: 'leads',
          fromId: id,
          toType: 'contacts',
          associationType: 'lead_contact',
          added,
          removed,
        });
      }
      if (dto.associatedLeads !== undefined) {
        const prevL = this.objectIdListFromDocField(prevAny.associatedLeads);
        const nextL = this.normalizeObjectIdArray(dto.associatedLeads).filter(
          (oid) => String(oid) !== id,
        );
        const { removed, added } = this.setDiffIds(prevL, nextL);
        this.queueAssociationMirror({
          fromType: 'leads',
          fromId: id,
          toType: 'leads',
          associationType: 'lead_lead',
          added,
          removed,
        });
      }
    }
    const updated = await this.leadModel
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();

    if (updated && pendingIntentUpdate && pendingIntentUpdate.intents.length) {
      // Lead.leadIntents was already persisted above; this just appends the
      // analytics history event(s) for the Lead Intent Analytics dashboard.
      await this.leadIntentService.recordIntent(
        id,
        pendingIntentUpdate.intents,
        pendingIntentUpdate.followUpAt,
        'add_lead_form',
        user,
      );
    }

    if (user && updated && oldLead) {
      const changes: string[] = [];
      const fieldLabels: Record<string, string> = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        mobileNo: 'Mobile Number',
        phone: 'Phone',
        organization: 'Company',
        jobTitle: 'Job Title',
        industry: 'Industry',
        annualRevenue: 'Annual Revenue',
        noOfEmployees: 'No. of Employees',
        website: 'Website',
        territory: 'Territory',
        status: 'Status',
        stage: 'Stage',
        callStatus: 'Call Status',
        leadOwner: 'Owner',
        pipeline: 'Pipeline',
      };

      for (const [field, label] of Object.entries(fieldLabels)) {
        if (dto[field] !== undefined) {
          const oldVal = (oldLead as any)[field];
          const newVal = dto[field];

          const normalizedOld = this.strId(oldVal);
          const normalizedNew = this.strId(newVal);

          if (normalizedOld !== normalizedNew) {
            // Deduplicate Status and Stage changes (common redundancy in CRM)
            if (field === 'stage' && dto.status !== undefined) {
              if (this.strId((oldLead as any).status) !== this.strId(dto.status)) {
                continue;
              }
            }

            if (['stage', 'status', 'callStatus', 'leadOwner', 'pipeline'].includes(field)) {
              changes.push(`${label} from '${oldVal || 'None'}' to '${newVal || 'None'}'`);
            } else {
              changes.push(label);
            }
          }
        }
      }

      if (changes.length > 0) {
        const leadName = `${updated.firstName} ${updated.lastName}`.trim();
        const userName = `${user.firstName} ${user.lastName}`.trim() || 'A user';
        
        let content = `${userName} updated `;
        if (changes.length === 1) {
          content += `${changes[0]} for lead ${leadName}`;
        } else {
          const last = changes.pop();
          content += `${changes.join(', ')} and ${last} for lead ${leadName}`;
        }

        await this.createActivity({
          type: 'System',
          title: 'Lead Updated',
          content,
          relatedTo: updated._id,
          relatedType: 'Lead',
          author: user.userId || user._id,
        });
      }
    }
    if (
      updated &&
      oldLead &&
      dto.leadOwner !== undefined &&
      String((oldLead as any).leadOwner || '') !== String(dto.leadOwner || '')
    ) {
      await this.roleAuditLog.log({
        actor: user,
        action: 'ownership_changed',
        targetType: 'Lead',
        targetId: updated._id,
        targetLabel: `${updated.firstName || ''} ${updated.lastName || ''}`.trim(),
        before: { leadOwner: (oldLead as any).leadOwner },
        after: { leadOwner: dto.leadOwner },
      });
    }
    if (updated)
      await this.syncContactFromLeadSafe(
        updated.toObject ? updated.toObject() : updated,
      );
    if (updated) {
      const rec = this.entityPlain(updated);
      const prev = oldLead ? this.entityPlain(oldLead) : null;
      this.workflowsService.dispatch({
        trigger: 'lead_updated',
        entityType: 'Lead',
        entityId: updated._id,
        record: rec,
        previous: prev,
        user,
      });
      const oldStage = (oldLead as any)?.stage;
      const newStage = (updated as any)?.stage;
      if (oldLead && dto.stage !== undefined && oldStage !== newStage) {
        this.workflowsService.dispatch({
          trigger: 'lead_stage_changed',
          entityType: 'Lead',
          entityId: updated._id,
          record: rec,
          previous: prev,
          user,
        });
        this.notifySalesAgent({
          trigger: 'lead_stage_changed',
          recordType: 'Lead',
          recordId: String(updated._id),
          user,
        });
      }
      if (oldLead) {
        if (
          this.strId((oldLead as any).pipeline) !==
          this.strId((updated as any).pipeline)
        ) {
          this.workflowsService.dispatch({
            trigger: 'lead_pipeline_changed',
            entityType: 'Lead',
            entityId: updated._id,
            record: rec,
            previous: prev,
            user,
          });
        }
        if ((oldLead as any).status !== (updated as any).status) {
          this.workflowsService.dispatch({
            trigger: 'lead_status_changed',
            entityType: 'Lead',
            entityId: updated._id,
            record: rec,
            previous: prev,
            user,
          });
        }
        if ((oldLead as any).leadOwner !== (updated as any).leadOwner) {
          this.workflowsService.dispatch({
            trigger: 'lead_owner_changed',
            entityType: 'Lead',
            entityId: updated._id,
            record: rec,
            previous: prev,
            user,
          });
        }
      }
    }
    if (updated) {
      void this.leadEngagementAutomation.onLeadUpdated(String(updated._id));
      await this.bustCrmCache('leads', String(updated._id));
      return this.leadModel
        .findById(updated._id)
        .populate('relatedService', 'name')
        .exec();
    }
    return updated;
  }

  // --- Organizations ---
  async createOrganization(dto: any, user?: any): Promise<Organization> {
    const requestedOrgRecordId = dto.recordId;
    delete dto.recordId;
    dto.recordId = await this.nextRecordId(
      this.organizationModel,
      requestedOrgRecordId,
    );
    const org = await new this.organizationModel(dto).save();

    // Sync associations mirroring for new organization
    const prev = {
      associatedContacts: [],
      associatedLeads: [],
    };
    await this.syncOrganizationAssociationMirrors(org._id.toString(), prev, {
      associatedContacts: this.objectIdListFromDocField(org.associatedContacts),
      associatedLeads: this.objectIdListFromDocField(org.associatedLeads),
    });

    if (user) {
      await this.createActivity({
        type: 'System',
        title: 'Organization Created',
        content: `Organization '${dto.name}' created by ${user.firstName} ${user.lastName}`,
        relatedTo: org._id,
        relatedType: 'Organization',
        author: user.userId || user._id,
      });
    }
    this.workflowsService.dispatch({
      trigger: 'organization_created',
      entityType: 'Organization',
      entityId: org._id,
      record: this.entityPlain(org),
      user,
    });
    await this.bustCrmCache('organizations', String(org._id));
    return org;
  }
  async findAllOrganizations(
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
    },
  ): Promise<ScalableListResult<Organization>> {
    const normalized = {
      ...listOpts,
      page: listOpts?.page && listOpts.page > 0 ? listOpts.page : CRM_DEFAULT_PAGE,
      pageSize: clampPageSize(
        listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
        CRM_MAX_PAGE_SIZE,
      ),
    };
    const cacheKey = this.appCache.crmListKey('organizations', undefined, {
      listOpts: normalized,
    });
    if (cacheKey) {
      return this.appCache.getOrSet(cacheKey, this.appCache.crmListTtl(), () =>
        this.findAllOrganizationsDb(normalized),
      );
    }
    return this.findAllOrganizationsDb(normalized);
  }

  private async findAllOrganizationsDb(
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
    },
  ): Promise<ScalableListResult<Organization>> {
    let filter: Record<string, unknown> = {};
    if (listOpts?.search?.trim()) {
      filter = this.appendCrmTextSearchFilter(filter, listOpts.search, [
        'name',
        'email',
        'industry',
        'website',
        'territory',
      ]);
    }

    if (listOpts?.filters?.length) {
      filter = appendCrmListFilters(
        filter,
        listOpts.filters,
        'organizations',
      );
    }

    filter = await this.applyListEmailEngagement(
      filter,
      'organizations',
      listOpts?.emailEngagement,
    );

    const page = Math.max(1, listOpts?.page ?? CRM_DEFAULT_PAGE);
    const pageSize = clampPageSize(
      listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
      CRM_MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;
    const [data, count] = await Promise.all([
      this.organizationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      countDocumentsCapped(this.organizationModel, filter),
    ]);
    return buildScalableListResult(data as Organization[], {
      page,
      pageSize,
      total: count.total,
      totalIsApproximate: count.approximate,
    });
  }
  async findAllOrganizationsList(): Promise<{ _id: string; name: string }[]> {
    return this.appCache.getOrSet(
      'crm:orgs:picker:v1',
      this.appCache.crmPickerTtl(),
      () => this.findAllOrganizationsListDb(),
    );
  }

  private async findAllOrganizationsListDb(): Promise<
    { _id: string; name: string }[]
  > {
    return this.organizationModel
      .find({}, { name: 1 })
      .sort({ name: 1 })
      .limit(CRM_MAX_PICKER_LIMIT)
      .maxTimeMS(CRM_LIST_MAX_TIME_MS)
      .lean()
      .exec() as any;
  }

  async findOneOrganization(id: string): Promise<Organization | null> {
    const key = this.appCache.crmDetailKey('organizations', id);
    return this.appCache.getOrSet(key, this.appCache.crmDetailTtl(), () =>
      this.findOneOrganizationDb(id),
    );
  }

  private async findOneOrganizationDb(
    id: string,
  ): Promise<Organization | null> {
    const resolvedId = await this.resolveDocumentId(this.organizationModel, id);
    if (!resolvedId) return null;
    const org = await this.organizationModel
      .findById(resolvedId)
      .populate('associatedContacts', 'firstName lastName email jobTitle')
      .populate('associatedLeads', 'firstName lastName email organization stage')
      .lean()
      .exec();
    if (!org) return null;

    // Include reverse-linked records as well, so legacy/name-only associations
    // immediately appear without requiring a data migration.
    const nameRegex = new RegExp(
      `^${this.escapeRegex(String(org.name || ''))}$`,
      'i',
    );
    const [reverseContacts, reverseLeads] = await Promise.all([
      this.contactModel
        .find({
          $or: [
            { associatedOrganizations: resolvedId },
            { organization: String(resolvedId) },
            { organization: nameRegex },
          ],
        })
        .select('firstName lastName email jobTitle')
        .limit(500)
        .lean()
        .exec(),
      this.leadModel
        .find({
          $or: [
            { associatedOrganizations: resolvedId },
            { organization: nameRegex },
          ],
        })
        .select('firstName lastName email organization stage')
        .limit(500)
        .lean()
        .exec(),
    ]);
    const mergeById = <T extends { _id?: unknown }>(
      stored: T[] | undefined,
      reverse: T[],
    ) =>
      Array.from(
        new Map(
          [...(stored || []), ...reverse].map((row) => [
            String(row._id),
            row,
          ]),
        ).values(),
      );

    return {
      ...org,
      associatedContacts: mergeById(
        org.associatedContacts as any[],
        reverseContacts as any[],
      ),
      associatedLeads: mergeById(
        org.associatedLeads as any[],
        reverseLeads as any[],
      ),
    } as unknown as Organization;
  }
  async updateOrganization(
    id: string,
    dto: any,
    user?: any,
  ): Promise<Organization | null> {
    delete dto.recordId;
    const resolvedId = await this.resolveDocumentId(this.organizationModel, id);
    if (!resolvedId) return null;
    id = resolvedId;

    const orgAssocKeys = [
      'associatedContacts',
      'associatedLeads',
    ] as const;
    for (const key of orgAssocKeys) {
      if (dto[key] !== undefined) {
        dto[key] = this.normalizeObjectIdArray(dto[key]);
      }
    }

    const oldOrg = await this.organizationModel.findById(id).exec();
    if (oldOrg) {
      const prev = oldOrg.toObject() as unknown as Record<string, unknown>;
      if (orgAssocKeys.some((k) => dto[k] !== undefined)) {
        const nextC =
          dto.associatedContacts !== undefined
            ? (dto.associatedContacts as Types.ObjectId[])
            : this.objectIdListFromDocField(prev.associatedContacts);
        const nextL =
          dto.associatedLeads !== undefined
            ? (dto.associatedLeads as Types.ObjectId[])
            : this.objectIdListFromDocField(prev.associatedLeads);
        await this.syncOrganizationAssociationMirrors(id, prev, {
          associatedContacts: nextC,
          associatedLeads: nextL,
        });
      }
    }

    const updated = await this.organizationModel
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();
    if (user && updated && oldOrg) {
      const changes: string[] = [];
      const fieldLabels: Record<string, string> = {
        name: 'Company Name',
        website: 'Website',
        territory: 'Territory',
        industry: 'Industry',
        noOfEmployees: 'No. of Employees',
        annualRevenue: 'Annual Revenue',
        phone: 'Phone',
        email: 'Email',
        address: 'Address',
      };

      for (const [field, label] of Object.entries(fieldLabels)) {
        if (dto[field] !== undefined) {
          const oldVal = (oldOrg as any)[field];
          const newVal = dto[field];

          const normalizedOld = this.strId(oldVal);
          const normalizedNew = this.strId(newVal);

          if (normalizedOld !== normalizedNew) {
            if (['industry', 'territory'].includes(field)) {
              changes.push(`${label} from '${oldVal || 'None'}' to '${newVal || 'None'}'`);
            } else {
              changes.push(label);
            }
          }
        }
      }

      if (changes.length > 0) {
        const userName = `${user.firstName} ${user.lastName}`.trim() || 'A user';
        const orgName = updated.name || 'this company';

        let content = `${userName} updated `;
        if (changes.length === 1) {
          content += `${changes[0]} for company ${orgName}`;
        } else {
          const last = changes.pop();
          content += `${changes.join(', ')} and ${last} for company ${orgName}`;
        }

        await this.createActivity({
          type: 'System',
          title: 'Organization Updated',
          content,
          relatedTo: updated._id,
          relatedType: 'Organization',
          author: user.userId || user._id,
        });
      }
    }
    if (updated) {
      const rec = this.entityPlain(updated);
      const prev = oldOrg ? this.entityPlain(oldOrg) : null;
      this.workflowsService.dispatch({
        trigger: 'organization_updated',
        entityType: 'Organization',
        entityId: updated._id,
        record: rec,
        previous: prev,
        user,
      });
      if (oldOrg && (oldOrg as any).name !== (updated as any).name) {
        this.workflowsService.dispatch({
          trigger: 'organization_name_changed',
          entityType: 'Organization',
          entityId: updated._id,
          record: rec,
          previous: prev,
          user,
        });
      }
    }
    if (updated) await this.bustCrmCache('organizations', String(updated._id));
    return updated;
  }

  // --- Contacts ---
  async createContact(dto: any, user?: any): Promise<Contact> {
    const orgRaw = dto.organization;
    if (orgRaw != null && String(orgRaw).trim() !== '') {
      const s = String(orgRaw).trim();
      if (!isMongoObjectIdString(s)) {
        const orgId = await this.ensureOrganization(s, dto);
        dto.organization = orgId ?? undefined;
      }
    }

    const requestedContactRecordId = dto.recordId;
    delete dto.recordId;

    // Final sanitization for ObjectId fields
    dto.pipeline = this.toObjectIdSafe(dto.pipeline);
    dto.organization = this.toObjectIdSafe(dto.organization);
    dto.sourceLead = this.toObjectIdSafe(dto.sourceLead);
    if (dto.organization) {
      const associatedOrganizations = this.normalizeObjectIdArray(
        dto.associatedOrganizations,
      );
      if (
        !associatedOrganizations.some(
          (id) => String(id) === String(dto.organization),
        )
      ) {
        associatedOrganizations.push(dto.organization);
      }
      dto.associatedOrganizations = associatedOrganizations;
    }
    if (dto.sharedWith !== undefined) {
      dto.sharedWith = this.normalizeObjectIdArray(dto.sharedWith);
    }
    if (dto.phone) dto.phone = this.sanitizePhone(dto.phone);
    if (dto.mobileNo) dto.mobileNo = this.sanitizePhone(dto.mobileNo);
    if (dto.twitterHandle !== undefined) {
      const h = normalizeTwitterHandle(dto.twitterHandle);
      dto.twitterHandle = h || undefined;
    }

    await this.assertPersonContactIdentifiersValid({
      entity: 'contact',
      merged: { ...dto },
    });
    dto.recordId = await this.nextRecordId(
      this.contactModel,
      requestedContactRecordId,
    );
    const contact = await new this.contactModel(dto).save();

    // Sync associations mirroring for new contact
    const prev = {
      associatedOrganizations: [],
      associatedContacts: [],
    };
    await this.syncContactAssociationMirrors(contact._id.toString(), prev, {
      associatedOrganizations: this.objectIdListFromDocField(
        contact.associatedOrganizations,
      ),
      associatedContacts: this.objectIdListFromDocField(contact.associatedContacts),
    });

    if (user) {
      await this.createActivity({
        type: 'System',
        title: 'Contact Created',
        content: `Contact ${dto.firstName} ${dto.lastName} created by ${user.firstName} ${user.lastName}`,
        relatedTo: contact._id,
        relatedType: 'Contact',
        author: user.userId || user._id,
      });
    }
    this.workflowsService.dispatch({
      trigger: 'contact_created',
      entityType: 'Contact',
      entityId: contact._id,
      record: this.entityPlain(contact),
      user,
    });
    await this.bustCrmCache('contacts', String(contact._id));
    return this.contactModel.findById(contact._id).exec() as Promise<Contact>;
  }
  /**
   * Contacts list — always paged (crore-scale safe).
   */
  async findAllContacts(
    user?: any,
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      mine?: boolean;
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<ScalableListResult<Contact>> {
    const normalized = {
      ...listOpts,
      page: listOpts?.page && listOpts.page > 0 ? listOpts.page : CRM_DEFAULT_PAGE,
      pageSize: clampPageSize(
        listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
        CRM_MAX_BOARD_PAGE_SIZE,
      ),
    };
    const cacheKey = this.appCache.crmListKey('contacts', user, {
      listOpts: normalized,
    });
    if (cacheKey) {
      return this.appCache.getOrSet(cacheKey, this.appCache.crmListTtl(), () =>
        this.findAllContactsDb(user, normalized),
      );
    }
    return this.findAllContactsDb(user, normalized);
  }

  private normalizeContactListSort(listOpts?: {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): { sortBy: 'createdAt' | 'lastEmailActivityAt'; sortOrder: 'asc' | 'desc' } {
    const raw = String(listOpts?.sortBy || '')
      .trim()
      .toLowerCase();
    const sortBy =
      raw === 'lastemailactivityat' ||
      raw === 'last_engaged' ||
      raw === 'lastengaged' ||
      raw === 'last_email_activity'
        ? 'lastEmailActivityAt'
        : 'createdAt';
    const sortOrder = listOpts?.sortOrder === 'asc' ? 'asc' : 'desc';
    return { sortBy, sortOrder };
  }

  private async findAllContactsDb(
    user?: any,
    listOpts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      mine?: boolean;
      filters?: CrmFilterCriterion[];
      emailEngagement?: CrmEmailEngagementListFilter | null;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<ScalableListResult<Contact>> {
    let filter: Record<string, unknown> = {};
    const restrictedByDataScope =
      !!user && !this.canReadAllModuleData('contacts', user);
    if (restrictedByDataScope) {
      filter = this.contactOwnershipFilter(user);
    } else if (listOpts?.mine && user) {
      filter = this.contactOwnershipFilter(user);
    }
    if (user && !this.canReadModule('clients', user)) {
      filter = { $and: [filter, { source: { $ne: 'client' } }] };
    }

    filter = this.appendCrmTextSearchFilter(filter, listOpts?.search, [
      'firstName',
      'lastName',
      'email',
      'phone',
      'jobTitle',
    ]);
    if (listOpts?.filters?.length) {
      filter = appendCrmListFilters(filter, listOpts.filters, 'contacts');
    }
    filter = await this.applyListEmailEngagement(
      filter,
      'contacts',
      listOpts?.emailEngagement,
    );

    const page = Math.max(1, listOpts?.page ?? CRM_DEFAULT_PAGE);
    const pageSize = clampPageSize(
      listOpts?.pageSize ?? CRM_DEFAULT_PAGE_SIZE,
      CRM_MAX_BOARD_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;
    const { sortBy, sortOrder } = this.normalizeContactListSort(listOpts);
    const mongoSort = {
      createdAt: (sortOrder === 'asc' ? 1 : -1) as 1 | -1,
    };
    const listSelect =
      '_id firstName middleName lastName email phone mobileNo jobTitle organization status stage pipeline customFields createdBy leadOwner recordId createdAt sourceLead';

    if (sortBy === 'lastEmailActivityAt') {
      // Cap id scan — never load every contact id into memory at crore scale.
      const idRows = await this.contactModel
        .find(filter)
        .select('_id')
        .sort(mongoSort)
        .limit(CRM_MAX_EXPORT_ROWS)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec();
      const sortedIds =
        await this.emailEngagementFilter.sortEntityIdsByLastEmailActivity(
          idRows.map((r) => r._id as Types.ObjectId),
          'contacts',
          sortOrder,
        );
      const total = sortedIds.length;
      const approximate = idRows.length >= CRM_MAX_EXPORT_ROWS;
      const pageIds = sortedIds.slice(skip, skip + pageSize);
      if (!pageIds.length) {
        return buildScalableListResult([], {
          page,
          pageSize,
          total,
          totalIsApproximate: approximate,
        });
      }
      const docs = await this.contactModel
        .find({ _id: { $in: pageIds } })
        .select(listSelect)
        .lean()
        .exec();
      const byId = new Map(
        (docs as Array<Contact & { _id: Types.ObjectId }>).map((d) => [
          String(d._id),
          d,
        ]),
      );
      const data = pageIds
        .map((id) => byId.get(String(id)))
        .filter((d): d is Contact & { _id: Types.ObjectId } => !!d);
      return buildScalableListResult(data, {
        page,
        pageSize,
        total,
        totalIsApproximate: approximate,
      });
    }

    const [data, count] = await Promise.all([
      this.contactModel
        .find(filter)
        .select(listSelect)
        .sort(mongoSort)
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(CRM_LIST_MAX_TIME_MS)
        .lean()
        .exec(),
      countDocumentsCapped(this.contactModel, filter),
    ]);
    return buildScalableListResult(data as Contact[], {
      page,
      pageSize,
      total: count.total,
      totalIsApproximate: count.approximate,
    });
  }
  async findAllContactsList(user?: any): Promise<
    { _id: string; firstName: string; lastName: string }[]
  > {
    const scope = this.appCache.crmUserScope(user);
    return this.appCache.getOrSet(
      `crm:contacts:picker:v1:${scope}`,
      this.appCache.crmPickerTtl(),
      () => this.findAllContactsListDb(user),
    );
  }

  private async findAllContactsListDb(user?: any): Promise<
    { _id: string; firstName: string; lastName: string }[]
  > {
    const baseFilter =
      user && !this.canReadAllModuleData('contacts', user)
        ? this.contactOwnershipFilter(user)
        : {};
    const filter =
      user && !this.canReadModule('clients', user)
        ? { $and: [baseFilter, { source: { $ne: 'client' } }] }
        : baseFilter;
    return this.contactModel
      .find(filter, { firstName: 1, lastName: 1 })
      .sort({ firstName: 1, lastName: 1 })
      .limit(CRM_MAX_PICKER_LIMIT)
      .maxTimeMS(CRM_LIST_MAX_TIME_MS)
      .lean()
      .exec() as any;
  }
  async findOneContact(id: string, user?: any): Promise<Contact | null> {
    const key = this.appCache.crmDetailKey('contacts', id, user);
    return this.appCache.getOrSet(key, this.appCache.crmDetailTtl(), () =>
      this.findOneContactDb(id, user),
    );
  }

  private async findOneContactDb(
    id: string,
    user?: any,
  ): Promise<Contact | null> {
    const resolvedId = await this.resolveDocumentId(this.contactModel, id);
    if (!resolvedId) return null;
    const doc = await this.contactModel
      .findById(resolvedId)
      .populate('organization')
      .populate('pipeline', 'name type stages')
      .populate('sourceLead', 'firstName lastName email status stage')
      .populate('associatedLeads', 'firstName lastName email status stage')
      .populate('associatedOrganizations', 'name website industry')
      .populate('associatedContacts', 'firstName lastName email')
      .exec();
    if (!doc) return null;
    if (user && !this.canReadModule('clients', user) && String((doc as any).source || '') === 'client') {
      return null;
    }
    if (user && !this.canReadAllModuleData('contacts', user)) {
      const ownerName = this.ownerLabel(user);
      const userId = this.userObjectId(user);
      const byOwner =
        String((doc as any).leadOwner || '').trim() === ownerName ||
        String((doc as any).contactOwner || '').trim() === ownerName;
      const byCreator =
        !!userId && String((doc as any).createdBy || '') === String(userId);
      const byShared =
        !!userId &&
        Array.isArray((doc as any).sharedWith) &&
        (doc as any).sharedWith.some((u: any) => String(u) === String(userId));
      if (!byOwner && !byCreator && !byShared) return null;
    }
    return doc;
  }
  async updateContact(
    id: string,
    dto: any,
    user?: any,
  ): Promise<Contact | null> {
    delete dto.recordId;
    const resolvedId = await this.resolveDocumentId(this.contactModel, id);
    if (!resolvedId) return null;
    id = resolvedId;
    delete dto.sourceLead;

    // Final sanitization for ObjectId fields
    if (dto.pipeline !== undefined)
      dto.pipeline = this.toObjectIdSafe(dto.pipeline);
    if (dto.organization !== undefined) {
      const raw = dto.organization;
      if (raw === '' || raw === null) {
        dto.organization = undefined;
      } else {
        const s = String(raw).trim();
        if (!s) dto.organization = undefined;
        else if (isMongoObjectIdString(s)) {
          dto.organization = this.toObjectIdSafe(s);
        } else {
          const orgId = await this.ensureOrganization(s, dto);
          dto.organization = orgId ?? undefined;
        }
      }
    }
    if (dto.phone !== undefined) dto.phone = this.sanitizePhone(dto.phone);
    if (dto.mobileNo !== undefined)
      dto.mobileNo = this.sanitizePhone(dto.mobileNo);
    if (dto.twitterHandle !== undefined) {
      const h = normalizeTwitterHandle(dto.twitterHandle);
      dto.twitterHandle = h || undefined;
    }
    if (dto.sharedWith !== undefined) {
      dto.sharedWith = this.normalizeObjectIdArray(dto.sharedWith);
    }

    const assocKeys = [
      'associatedLeads',
      'associatedOrganizations',
      'associatedContacts',
    ] as const;
    const oldContact = await this.contactModel.findById(id).exec();
    if (dto.additionalEmails !== undefined) {
      const primary = String(
        dto.email ?? (oldContact as any)?.email ?? '',
      )
        .trim()
        .toLowerCase();
      const raw = Array.isArray(dto.additionalEmails) ? dto.additionalEmails : [];
      const seen = new Set<string>();
      dto.additionalEmails = raw
        .map((e: unknown) => String(e ?? '').trim())
        .filter((e: string) => {
          if (!e || !e.includes('@')) return false;
          const low = e.toLowerCase();
          if (primary && low === primary) return false;
          if (seen.has(low)) return false;
          seen.add(low);
          return true;
        });
    }
    if (oldContact && user && !this.canReadAllModuleData('contacts', user)) {
      const ownerName = this.ownerLabel(user);
      const userId = this.userObjectId(user);
      const isMineByOwner =
        String((oldContact as any).leadOwner || '').trim() === ownerName ||
        String((oldContact as any).contactOwner || '').trim() === ownerName;
      const isMineByCreator =
        !!userId && String((oldContact as any).createdBy || '') === String(userId);
      const isSharedWithMe =
        !!userId &&
        Array.isArray((oldContact as any).sharedWith) &&
        (oldContact as any).sharedWith.some((u: any) => String(u) === String(userId));
      if (!isMineByOwner && !isMineByCreator && !isSharedWithMe) {
        throw new ForbiddenException('You can only edit your assigned contacts.');
      }
    }
    if (oldContact) {
      const prev = oldContact.toObject ? oldContact.toObject() : oldContact;
      const merged = { ...prev, ...dto };
      await this.assertPersonContactIdentifiersValid({
        entity: 'contact',
        merged,
        excludeContactId: id,
        existingContact: prev,
      });
    }
    for (const key of assocKeys) {
      if (dto[key] !== undefined) {
        let ids = this.normalizeObjectIdArray(dto[key]);
        if (key === 'associatedContacts') {
          ids = ids.filter((oid) => String(oid) !== id);
        }
        if (key === 'associatedLeads' && oldContact?.sourceLead) {
          const sid = String(oldContact.sourceLead);
          const has = ids.map(String).includes(sid);
          if (!has) {
            ids = [oldContact.sourceLead, ...ids];
          } else {
            ids = [
              oldContact.sourceLead,
              ...ids.filter((oid) => String(oid) !== sid),
            ];
          }
        }
        dto[key] = ids;
      }
    }
    if (oldContact) {
      const prev = oldContact.toObject() as unknown as Record<string, unknown>;

      // Proactive Healing: Ensure single-reference Organization is in the associated array
      const currentAssocOrgs = this.objectIdListFromDocField(prev.associatedOrganizations);
      if (prev.organization && !currentAssocOrgs.some(id => String(id) === String(prev.organization))) {
        currentAssocOrgs.push(this.toObjectIdSafe(prev.organization) as Types.ObjectId);
      }

      const nextOrgs =
        dto.associatedOrganizations !== undefined
          ? (dto.associatedOrganizations as Types.ObjectId[])
          : currentAssocOrgs;
      const nextPrimaryOrg = this.toObjectIdSafe(dto.organization);
      if (
        nextPrimaryOrg &&
        !nextOrgs.some((orgId) => String(orgId) === String(nextPrimaryOrg))
      ) {
        nextOrgs.push(nextPrimaryOrg);
      }
      
      // Persistence Fix: Ensure the healed list is actually saved to the contact
      dto.associatedOrganizations = nextOrgs;

      const nextPeople =
        dto.associatedContacts !== undefined
          ? (dto.associatedContacts as Types.ObjectId[])
          : this.objectIdListFromDocField(prev.associatedContacts);
      await this.syncContactAssociationMirrors(id, prev, {
        associatedOrganizations: nextOrgs,
        associatedContacts: nextPeople,
      });
    }
    const updated = await this.contactModel
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();
    if (user && updated && oldContact) {
      const changes: string[] = [];
      const fieldLabels: Record<string, string> = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        phone: 'Phone',
        mobileNo: 'Mobile Number',
        jobTitle: 'Job Title',
        linkedinUrl: 'LinkedIn URL',
        source: 'Source',
        industry: 'Industry',
        territory: 'Territory',
        status: 'Status',
        stage: 'Stage',
      };

      for (const [field, label] of Object.entries(fieldLabels)) {
        if (dto[field] !== undefined) {
          const oldVal = (oldContact as any)[field];
          const newVal = dto[field];

          const normalizedOld = this.strId(oldVal);
          const normalizedNew = this.strId(newVal);

          if (normalizedOld !== normalizedNew) {
            if (['status', 'stage'].includes(field)) {
              changes.push(`${label} from '${oldVal || 'None'}' to '${newVal || 'None'}'`);
            } else {
              changes.push(label);
            }
          }
        }
      }

      // Special Organization handling
      if (dto.organization !== undefined && String(dto.organization || '') !== String(oldContact.organization || '')) {
        let orgName = 'None';
        if (dto.organization) {
          const org = await this.organizationModel.findById(dto.organization).select('name').lean().exec();
          orgName = org?.name || 'Selected Organization';
        }
        changes.push(`Company to '${orgName}'`);
      }

      if (changes.length > 0) {
        const userName = `${user.firstName} ${user.lastName}`.trim() || 'A user';
        const contactName = `${updated.firstName} ${updated.lastName}`.trim() || 'this contact';

        let content = `${userName} updated `;
        if (changes.length === 1) {
          content += `${changes[0]} for contact ${contactName}`;
        } else {
          const last = changes.pop();
          content += `${changes.join(', ')} and ${last} for contact ${contactName}`;
        }

        await this.createActivity({
          type: 'System',
          title: 'Contact Updated',
          content,
          relatedTo: updated._id,
          relatedType: 'Contact',
          author: user.userId || user._id,
        });
      }
    }
    if (updated) {
      const rec = this.entityPlain(updated);
      const prev = oldContact ? this.entityPlain(oldContact) : null;
      this.workflowsService.dispatch({
        trigger: 'contact_updated',
        entityType: 'Contact',
        entityId: updated._id,
        record: rec,
        previous: prev,
        user,
      });
      if (oldContact && (oldContact as any).email !== (updated as any).email) {
        this.workflowsService.dispatch({
          trigger: 'contact_email_changed',
          entityType: 'Contact',
          entityId: updated._id,
          record: rec,
          previous: prev,
          user,
        });
      }
    }
    if (updated) {
      await this.syncLeadFromContactSafe(updated);
      await this.bustCrmCache('contacts', String(updated._id));
      return this.contactModel.findById(updated._id).exec();
    }
    return updated;
  }

  // --- Activities ---
  /**
   * Coerce activity `relatedTo` to Mongo ObjectId: accepts 24-char hex _id or HubSpot-style
   * `recordId` when `relatedType` identifies the module (Lead, Contact, Organization).
   */
  private async resolveActivityRelatedTo(
    raw: unknown,
    relatedType?: string,
  ): Promise<Types.ObjectId | undefined> {
    if (raw == null || raw === '') return undefined;
    let s: string;
    if (Array.isArray(raw)) {
      s = raw.length ? String(raw[0]) : '';
    } else if (
      typeof raw === 'object' &&
      raw !== null &&
      '_id' in (raw as Record<string, unknown>)
    ) {
      s = String((raw as { _id: unknown })._id);
    } else {
      s = String(raw);
    }
    s = s.trim();
    if (s.includes(',')) s = s.split(',')[0].trim();
    if (!s) return undefined;

    if (isMongoObjectIdString(s)) return new Types.ObjectId(s);

    const t = (relatedType || '').trim();
    if (!t) return undefined;

    let mongoId: string | null = null;
    if (t === 'Lead') mongoId = await this.resolveDocumentId(this.leadModel, s);
    else if (t === 'Contact')
      mongoId = await this.resolveDocumentId(this.contactModel, s);
    else if (t === 'Organization')
      mongoId = await this.resolveDocumentId(this.organizationModel, s);
    else if (t === 'Client')
      mongoId = await this.resolveDocumentId(this.clientModel, s);

    return mongoId ? new Types.ObjectId(mongoId) : undefined;
  }

  /**
   * Keep scheduled CRM activities compatible with the calendar contract.
   * Meetings created from any record page use separate local date/time fields,
   * while the calendar consumes one ISO `dueDate`.
   */
  private normalizeScheduledActivityMetadata(dto: any): any {
    const metadata =
      dto?.metadata && typeof dto.metadata === 'object'
        ? { ...dto.metadata }
        : {};
    const isMeeting =
      String(dto?.type || '').trim().toLowerCase() === 'meeting';
    const hasMeetingSchedule = Boolean(metadata.date && metadata.time);

    if (!isMeeting && !hasMeetingSchedule) return dto;

    let dueDate: string | undefined;
    if (metadata.dueDate) {
      const parsed = new Date(metadata.dueDate);
      if (!Number.isNaN(parsed.getTime())) dueDate = parsed.toISOString();
    }
    if (!dueDate && hasMeetingSchedule) {
      const parsed = new Date(`${metadata.date}T${metadata.time}`);
      if (!Number.isNaN(parsed.getTime())) dueDate = parsed.toISOString();
    }

    return {
      ...dto,
      metadata: {
        ...metadata,
        isCalendarEvent: true,
        eventCategory: metadata.eventCategory || 'meeting',
        ...(dueDate ? { dueDate } : {}),
      },
    };
  }

  async createActivity(dto: any, user?: any): Promise<Activity> {
    dto = this.normalizeScheduledActivityMetadata(dto);
    if (dto.relatedTo != null && dto.relatedTo !== '') {
      const rid = await this.resolveActivityRelatedTo(
        dto.relatedTo,
        dto.relatedType,
      );
      if (!rid) {
        throw new BadRequestException('Invalid relatedTo');
      }
      dto.relatedTo = rid;
    }

    // ENTERPRISE-GRADE TAGGING (Involved Entities)
    // Automatically determine all entities that should be tagged in this activity
    const involved: { id: Types.ObjectId; type: string }[] = [];
    if (dto.relatedTo && dto.relatedType) {
      const primaryOid = new Types.ObjectId(String(dto.relatedTo));
      involved.push({ id: primaryOid, type: dto.relatedType });

      try {
        if (dto.relatedType === 'Lead') {
          const [lead, clients] = await Promise.all([
            this.leadModel.findById(primaryOid).select('associatedOrganizations email firstName lastName').lean().exec(),
            this.clientModel.find({ sourceLead: primaryOid }).select('_id').lean().exec(),
          ]);
          if (lead) {
            if (lead.associatedOrganizations?.length) {
              lead.associatedOrganizations.forEach(orgId => involved.push({ id: orgId as Types.ObjectId, type: 'Organization' }));
            }
            if (lead.email) {
              const leadEmailRegex = this.emailRegexForMatch(String(lead.email).trim());
              const contact = await this.contactModel
                .findOne({ email: leadEmailRegex })
                .select('_id')
                .lean()
                .exec();
              if (contact) involved.push({ id: contact._id as Types.ObjectId, type: 'Contact' });
            }
          }
          clients.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Client' }));
        } else if (dto.relatedType === 'Contact') {
          const contact = await this.contactModel.findById(primaryOid).select('associatedOrganizations sourceLead associatedLeads email').lean().exec();
          if (contact) {
            if (contact.sourceLead) involved.push({ id: contact.sourceLead, type: 'Lead' });
            if (contact.associatedLeads?.length) {
              contact.associatedLeads.forEach(leadId => involved.push({ id: leadId as Types.ObjectId, type: 'Lead' }));
            }
            if (contact.associatedOrganizations?.length) {
              contact.associatedOrganizations.forEach(orgId => involved.push({ id: orgId as Types.ObjectId, type: 'Organization' }));
            }
            if (contact.email) {
              const contactEmailRegex = this.emailRegexForMatch(String(contact.email).trim());
              const [leadsByEmail, clientsByEmail] = await Promise.all([
                this.leadModel
                  .find({ email: contactEmailRegex })
                  .select('_id')
                  .lean()
                  .exec(),
                this.clientModel
                  .find({ email: contactEmailRegex })
                  .select('_id')
                  .lean()
                  .exec(),
              ]);
              leadsByEmail.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
              clientsByEmail.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Client' }));
            }
          }
        } else if (dto.relatedType === 'Organization') {
          const org = await this.organizationModel.findById(primaryOid).select('name associatedContacts').lean().exec();
          if (org) {
            // Find related Leads by ID link AND by Company Name case-insensitive fallback
            const [leadsByOid, leadsByName, contactsByOid, contactsByName, clientsByOrg] = await Promise.all([
              this.leadModel.find({ associatedOrganizations: primaryOid }).select('_id').lean().exec(),
              this.leadModel.find({ organization: { $regex: new RegExp(`^${org.name}$`, 'i') } }).select('_id').lean().exec(),
              this.contactModel.find({ associatedOrganizations: primaryOid }).select('_id').lean().exec(),
              this.contactModel.find({ organization: { $regex: new RegExp(`^${org.name}$`, 'i') } }).select('_id').lean().exec(),
              this.clientModel.find({ organization: primaryOid }).select('_id').lean().exec(),
            ]);

            leadsByOid.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
            leadsByName.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
            contactsByOid.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Contact' }));
            contactsByName.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Contact' }));
            clientsByOrg.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Client' }));
          }
        } else if (dto.relatedType === 'Client') {
          const client = await this.clientModel.findById(primaryOid).select('email sourceLead organization').lean().exec();
          if (client) {
            if (client.sourceLead) involved.push({ id: client.sourceLead, type: 'Lead' });
            if (client.organization) involved.push({ id: client.organization as Types.ObjectId, type: 'Organization' });
            if (client.email) {
              const clientEmailRegex = this.emailRegexForMatch(String(client.email).trim());
              const [leadsByEmail, contactsByEmail] = await Promise.all([
                this.leadModel
                  .find({ email: clientEmailRegex })
                  .select('_id')
                  .lean()
                  .exec(),
                this.contactModel
                  .find({ email: clientEmailRegex })
                  .select('_id')
                  .lean()
                  .exec(),
              ]);
              leadsByEmail.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
              contactsByEmail.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Contact' }));
            }
          }
        }
      } catch (e) {
        console.error('[CRMService] Error tagging involved entities:', e);
      }
    }
    // Deduplicate involved entities
    const uniqueInvolved = Array.from(new Map(involved.map(i => [`${i.id}_${i.type}`, i])).values());
    dto.involvedEntities = uniqueInvolved;

    if (dto.author === '' || dto.author === undefined) {
      delete dto.author;
    } else if (
      typeof dto.author === 'string' &&
      isMongoObjectIdString(dto.author)
    ) {
      dto.author = new Types.ObjectId(dto.author);
    }
    if (user && !dto.author) {
      dto.author = user.userId || user._id;
    }
    if (dto.assignee === '' || dto.assignee === undefined) {
      delete dto.assignee;
    } else if (
      typeof dto.assignee === 'string' &&
      isMongoObjectIdString(dto.assignee)
    ) {
      dto.assignee = new Types.ObjectId(dto.assignee);
    }
    const activity = await new this.activityModel(dto).save();

    // Asynchronous notification (tasks: prefer assignee; else author)
    void (async () => {
      try {
        const populated = await this.activityModel
          .findById(activity._id)
          .populate({ path: 'author', model: this.hrmsUserModel, select: 'fullName email' })
          .populate({ path: 'assignee', model: this.hrmsUserModel, select: 'fullName email' })
          .exec();
        if (!populated) return;
        const assignee = populated.assignee as any;
        const author = populated.author as any;
        const notify =
          populated.type === 'Task' && assignee?.email ? assignee : author;
        if (notify?.email) {
          const frontendUrl =
            process.env.FRONTEND_URL || 'http://localhost:3000';
          const link = `${frontendUrl}/crm/tasks`;
          const metadata = {
            status: (populated as any).status || 'Planned',
            projectName: 'CRM',
            reporterName: author?.fullName,
          };
          const isTaskAssignee =
            populated.type === 'Task' && assignee?.email === notify.email;
          const title = isTaskAssignee
            ? `CRM task assigned: ${populated.title || 'Task'}`
            : `CRM ${populated.type}: ${populated.title || 'New Assignment'}`;
          const body =
            isTaskAssignee && author?.fullName
              ? `${author.fullName} assigned you a task in CRM.`
              : populated.content ||
              `You have a new ${populated.type} in CRM.`;
          const dm = await this.teamsBotService.sendProactiveDM(
            notify.email,
            title,
            body,
            link,
            metadata,
          );
          if (!dm.success) {
            console.error('[CRMService] Teams DM failed:', dm.error);
          }
        }
      } catch (err) {
        console.error('[CRMService] Teams DM failed:', err);
      }
    })();

    const full = await this.activityModel
      .findById(activity._id)
      .populate({ path: 'author', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
      .populate({ path: 'assignee', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
      .exec();
    return full ?? activity;
  }

  /**
   * Identifies all entities related to the given primary entity for activity rollup.
   * Ensures consistency across Leads, Contacts, Organizations, and Clients.
   * Optimized with lean queries and parallel processing.
   */
  private async getRelatedEntitiesForRollup(
    primaryId: Types.ObjectId,
    primaryType: string,
  ): Promise<{ relatedTo: Types.ObjectId; relatedType: string }[]> {
    // ALWAYS include the primary entity itself
    const results: { relatedTo: Types.ObjectId; relatedType: string }[] = [
      { relatedTo: primaryId, relatedType: primaryType },
    ];

    try {
      if (primaryType === 'Lead') {
        const lead = await this.leadModel
          .findById(primaryId)
          .select('associatedOrganizations email firstName lastName')
          .lean()
          .exec();
        if (lead) {
          // Associated Organizations
          if (lead.associatedOrganizations?.length) {
            lead.associatedOrganizations.forEach((id) =>
              results.push({
                relatedTo: id as Types.ObjectId,
                relatedType: 'Organization',
              }),
            );
          }
          // Parallel lookups for Contacts and Clients
          const [contacts, clients] = await Promise.all([
            this.contactModel
              .find({
                $or: [{ associatedLeads: primaryId }, { email: lead.email }],
              })
              .select('_id')
              .lean()
              .exec(),
            this.clientModel
              .find({
                $or: [{ sourceLead: primaryId }, { email: lead.email }]
              })
              .select('_id')
              .lean()
              .exec(),
          ]);

          contacts.forEach((c) =>
            results.push({
              relatedTo: c._id as Types.ObjectId,
              relatedType: 'Contact',
            }),
          );
          clients.forEach((cl) =>
            results.push({
              relatedTo: cl._id as Types.ObjectId,
              relatedType: 'Client',
            }),
          );
        }
      } else if (primaryType === 'Contact') {
        const contact = await this.contactModel
          .findById(primaryId)
          .select('email organization associatedOrganizations sourceLead associatedLeads')
          .lean()
          .exec();
        if (contact) {
          if (contact.sourceLead)
            results.push({ relatedTo: contact.sourceLead, relatedType: 'Lead' });
          if (contact.associatedLeads?.length)
            contact.associatedLeads.forEach((id) =>
              results.push({ relatedTo: id as Types.ObjectId, relatedType: 'Lead' }),
            );
          
          if (contact.associatedOrganizations?.length) {
            contact.associatedOrganizations.forEach((id) =>
              results.push({
                relatedTo: id as Types.ObjectId,
                relatedType: 'Organization',
              }),
            );
          }

          // Name-based Discovery: If no ID links exist or as a fallback, find Org by name string
          if (contact.organization && contact.organization.trim()) {
            const org = await this.organizationModel.findOne({ name: { $regex: new RegExp(`^${contact.organization.trim()}$`, 'i') } }).select('_id').lean().exec();
            if (org) {
              results.push({ relatedTo: org._id as Types.ObjectId, relatedType: 'Organization' });
            }
          }

          // Find related client + leads by email
          if (contact.email) {
            const emailRegex = this.emailRegexForMatch(String(contact.email).trim());
            const [client, leads] = await Promise.all([
              this.clientModel
                .findOne({ email: emailRegex })
                .select('_id')
                .lean()
                .exec(),
              this.leadModel
                .find({ email: emailRegex })
                .select('_id')
                .lean()
                .exec(),
            ]);
            if (client) results.push({ relatedTo: client._id as Types.ObjectId, relatedType: 'Client' });
            leads.forEach(l => results.push({ relatedTo: l._id as Types.ObjectId, relatedType: 'Lead' }));
          }
        }
      } else if (primaryType === 'Organization') {
        const org = await this.organizationModel
          .findById(primaryId)
          .select('name associatedContacts associatedLeads')
          .lean()
          .exec();
        if (org) {
          if (org.associatedContacts?.length)
            org.associatedContacts.forEach((id) =>
              results.push({
                relatedTo: id as Types.ObjectId,
                relatedType: 'Contact',
              }),
            );
          if (org.associatedLeads?.length)
            org.associatedLeads.forEach((id) =>
              results.push({
                relatedTo: id as Types.ObjectId,
                relatedType: 'Lead',
              }),
            );

          // Find Leads, Contacts, and Clients linked by ID or Name
          const orgNameRegex = new RegExp(
            `^${this.escapeRegex(String(org.name || ''))}$`,
            'i',
          );
          const [leadsByOid, leadsByName, contactsByOrg, contactsByName, clientsByOrg] = await Promise.all([
            this.leadModel.find({ associatedOrganizations: primaryId }).select('_id').lean().exec(),
            this.leadModel.find({ organization: { $regex: orgNameRegex } }).select('_id').lean().exec(),
            this.contactModel.find({ associatedOrganizations: primaryId }).select('_id').lean().exec(),
            this.contactModel.find({ organization: { $regex: orgNameRegex } }).select('_id').lean().exec(),
            this.clientModel.find({ organization: primaryId }).select('_id').lean().exec(),
          ]);

          leadsByOid.forEach((l) => results.push({ relatedTo: l._id as Types.ObjectId, relatedType: 'Lead' }));
          leadsByName.forEach((l) => results.push({ relatedTo: l._id as Types.ObjectId, relatedType: 'Lead' }));
          contactsByOrg.forEach((c) => results.push({ relatedTo: c._id as Types.ObjectId, relatedType: 'Contact' }));
          contactsByName.forEach((c) => results.push({ relatedTo: c._id as Types.ObjectId, relatedType: 'Contact' }));
          clientsByOrg.forEach((cl) => results.push({ relatedTo: cl._id as Types.ObjectId, relatedType: 'Client' }));
        }
      } else if (primaryType === 'Client') {
        const client = await this.clientModel
          .findById(primaryId)
          .select('sourceLead organization email')
          .lean()
          .exec();
        if (client) {
          if (client.sourceLead)
            results.push({ relatedTo: client.sourceLead, relatedType: 'Lead' });
          if (client.organization)
            results.push({
              relatedTo: client.organization as Types.ObjectId,
              relatedType: 'Organization',
            });
          // Related Contact + Leads by email
          if (client.email) {
            const clientEmailRegex = this.emailRegexForMatch(String(client.email).trim());
            const [contact, leads] = await Promise.all([
              this.contactModel
                .findOne({ email: clientEmailRegex })
                .select('_id')
                .lean()
                .exec(),
              this.leadModel
                .find({ email: clientEmailRegex })
                .select('_id')
                .lean()
                .exec(),
            ]);
            if (contact) results.push({ relatedTo: contact._id as Types.ObjectId, relatedType: 'Contact' });
            leads.forEach(l => results.push({ relatedTo: l._id as Types.ObjectId, relatedType: 'Lead' }));
          }
        }
      }
    } catch (err) {
      console.error('[CRMService] Error fetching related entities for rollup:', err);
    }

    // Deduplicate by ID and Type string
    const unique = new Map<string, { relatedTo: Types.ObjectId; relatedType: string }>();
    for (const r of results) {
      unique.set(`${r.relatedTo}_${r.relatedType}`, r);
    }
    return Array.from(unique.values());
  }


  async findActivities(
    relatedTo?: string,
    type?: string,
    pipelineId?: string,
    relatedType?: string,
  ): Promise<Activity[]> {
    const filter: any = {};
    if (relatedTo) {
      const rid = await this.resolveActivityRelatedTo(relatedTo, relatedType);
      if (!rid) {
        return [];
      }

      const targetId = new Types.ObjectId(String(rid));
      const rt = (relatedType || '').trim();
      const matches = await this.getRelatedEntitiesForRollup(rid, rt);

      if (matches.length > 0) {
        const legacyOrClauses = matches.flatMap((m) => {
          const oid = new Types.ObjectId(String(m.relatedTo));
          const str = String(m.relatedTo);
          return [
            { relatedTo: oid, relatedType: m.relatedType },
            { relatedTo: str, relatedType: m.relatedType },
          ];
        });
        filter.$or = [
          { 'involvedEntities.id': targetId },
          ...legacyOrClauses
        ];
      } else {
        filter['involvedEntities.id'] = targetId;
      }
    }
    if (type) filter.type = type;
    if (pipelineId) filter.pipelineId = pipelineId;
    try {
      const activities = await this.activityModel
        .find(filter)
        .populate({ path: 'author', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
        .populate({ path: 'assignee', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
        .sort({ createdAt: -1 })
        .exec();

      // One physical inbound email can be logged on a lead plus its related contact.
      // Rollup intentionally returns all related records, so collapse only inbound-email
      // copies here. This also fixes historical duplicate timeline rows without deleting data.
      const seenInboundMessages = new Set<string>();
      return activities.filter((activity) => {
        const metadata = (activity as any)?.metadata;
        if (
          activity.type !== 'Email' ||
          String(metadata?.direction || '').toLowerCase() !== 'inbound'
        ) {
          return true;
        }
        const dedupeKey =
          metadata?.inboundRfcMessageKey ||
          (metadata?.inboxEmailId
            ? `inbox:${String(metadata.inboxEmailId)}`
            : '') ||
          metadata?.inboundMessageKey ||
          [
            String(metadata?.fromEmail || '')
              .trim()
              .toLowerCase(),
            String(metadata?.subject || '').trim().toLowerCase(),
            (activity as any).createdAt
              ? new Date((activity as any).createdAt).toISOString()
              : '',
          ]
            .filter(Boolean)
            .join('\0');
        if (!dedupeKey) return true;
        const key = String(dedupeKey);
        if (seenInboundMessages.has(key)) return false;
        seenInboundMessages.add(key);
        return true;
      });
    } catch (err: any) {
      console.error('[CRMService] findActivities error:', err?.message || err);
      return [];
    }
  }
  async updateActivity(id: string, dto: any): Promise<Activity | null> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return null;
    const patch: any = this.normalizeScheduledActivityMetadata({ ...dto });
    if (patch.author === '') delete patch.author;
    else if (
      typeof patch.author === 'string' &&
      isMongoObjectIdString(patch.author)
    ) {
      patch.author = new Types.ObjectId(patch.author);
    }
    if (patch.assignee === '') patch.assignee = null;
    else if (
      typeof patch.assignee === 'string' &&
      isMongoObjectIdString(patch.assignee)
    ) {
      patch.assignee = new Types.ObjectId(patch.assignee);
    }
    return this.activityModel
      .findByIdAndUpdate(id, patch, { new: true })
      .populate({ path: 'author', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
      .populate({ path: 'assignee', model: this.hrmsUserModel, select: 'firstName lastName email fullName' })
      .exec();
  }

  async convertLead(
    leadId: string,
    dto: {
      type: 'contact' | 'organization' | 'client';
      pipelineId?: string;
      stage?: string;
    },
    user?: any,
  ) {
    const resolvedLeadId = await this.resolveDocumentId(
      this.leadModel,
      leadId,
    );
    if (!resolvedLeadId) throw new NotFoundException('Lead not found');
    const lead = await this.leadModel.findById(resolvedLeadId).exec();
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.converted) {
      throw new BadRequestException('Lead has already been converted');
    }
    if (user) {
      if (user.assignedLeadsPipeline) {
        if (
          this.strId((lead as any).pipeline) !==
          this.strId(user.assignedLeadsPipeline)
        ) {
          throw new ForbiddenException(
            'Lead is not in your assigned pipeline.',
          );
        }
      }
      if (!this.canReadAllModuleData('leads', user)) {
        const ownerName = this.ownerLabel(user);
        const userId = this.userObjectId(user);
        const isMineByOwner =
          String((lead as any).leadOwner || '').trim() === ownerName;
        const isMineByCreator =
          !!userId && String((lead as any).createdBy || '') === String(userId);
        const isSharedWithMe =
          !!userId &&
          Array.isArray((lead as any).sharedWith) &&
          (lead as any).sharedWith.some(
            (u: any) => String(u) === String(userId),
          );
        if (!isMineByOwner && !isMineByCreator && !isSharedWithMe) {
          throw new ForbiddenException(
            'You can only convert your assigned leads.',
          );
        }
      }
    }

    let result: any;
    if (dto.type === 'contact') {
      const email = (lead.email || '').trim();
      let contact: any;
      if (email && email.includes('@')) {
        const emailRegex = this.emailRegexForMatch(email);
        const existing = await this.contactModel
          .findOne({ email: emailRegex })
          .exec();
        if (existing) {
          const cf = this.mergeCustomFieldsMaps(
            existing.customFields,
            lead.customFields,
          );
          const patch: Record<string, unknown> = {
            firstName: lead.firstName,
            lastName: lead.lastName || '',
            email,
            phone: lead.phone,
            mobileNo: lead.mobileNo,
            jobTitle: lead.jobTitle,
            organization: lead.organization,
          };
          if (Object.keys(cf).length) patch.customFields = cf;
          contact = await this.contactModel
            .findByIdAndUpdate(existing._id, patch, { returnDocument: 'after' })
            .exec();
        }
      }
      if (!contact) {
        const cfNew = this.mergeCustomFieldsMaps(undefined, lead.customFields);
        contact = await this.contactModel.create({
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          mobileNo: lead.mobileNo,
          jobTitle: lead.jobTitle,
          organization: lead.organization,
          ...(Object.keys(cfNew).length ? { customFields: cfNew } : {}),
          recordId: await this.nextRecordId(this.contactModel),
        });
      }
      const leadOid = new Types.ObjectId(resolvedLeadId);
      const linkUpdate: Record<string, unknown> = {
        $addToSet: { associatedLeads: leadOid },
      };
      const cur = await this.contactModel
        .findById(contact._id)
        .select('sourceLead')
        .lean()
        .exec();
      if (cur && !(cur as { sourceLead?: Types.ObjectId }).sourceLead) {
        linkUpdate.$set = { sourceLead: leadOid };
      }
      contact = await this.contactModel
        .findByIdAndUpdate(contact._id, linkUpdate, { returnDocument: 'after' })
        .exec();
      await this.leadModel
        .findByIdAndUpdate(resolvedLeadId, {
          converted: true,
          stage: 'Converted',
        })
        .exec();
      result = { type: 'contact', entity: contact };
    } else if (dto.type === 'organization') {
      const org = await this.organizationModel.create({
        name: lead.organization || `${lead.firstName} ${lead.lastName}`,
        website: lead.website,
        territory: lead.territory,
        industry: lead.industry,
        noOfEmployees: lead.noOfEmployees,
        annualRevenue: lead.annualRevenue,
        recordId: await this.nextRecordId(this.organizationModel),
      });
      await this.leadModel
        .findByIdAndUpdate(resolvedLeadId, {
          converted: true,
          stage: 'Converted',
        })
        .exec();
      result = { type: 'organization', entity: org };
    } else if (dto.type === 'client') {
      const email = (lead.email || '').trim();
      let client: any = null;
      const leadOidClient = new Types.ObjectId(resolvedLeadId);
      if (email && email.includes('@')) {
        const emRegex = this.emailRegexForMatch(email);
        client = await this.clientModel.findOne({ email: emRegex }).exec();
        if (client) {
          const cf = this.mergeCustomFieldsMaps(
            client.customFields,
            lead.customFields,
          );
          const patch: Record<string, unknown> = {
            name: `${lead.firstName} ${lead.lastName}`,
            email,
            phone: lead.phone,
          };
          if (Object.keys(cf).length) patch.customFields = cf;
          if (!(client as { sourceLead?: Types.ObjectId }).sourceLead) {
            patch.sourceLead = leadOidClient;
          }
          client = await this.clientModel
            .findByIdAndUpdate(client._id, patch, { returnDocument: 'after' })
            .exec();
        }
      }
      if (!client) {
        const cfNew = this.mergeCustomFieldsMaps(undefined, lead.customFields);
        client = await this.clientModel.create({
          name: `${lead.firstName} ${lead.lastName}`,
          email: lead.email || undefined,
          phone: lead.phone,
          status: 'active',
          customFields: cfNew,
          sourceLead: leadOidClient,
        });
      }
      await this.leadModel
        .findByIdAndUpdate(resolvedLeadId, {
          converted: true,
          stage: 'Converted',
        })
        .exec();
      result = { type: 'client', entity: client };
    }

    if (user && result) {
      const leadFullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'lead';
      // Professional Transition Log (Lead -> Contact/Organization/Client)
      await this.createActivity({
        type: 'System',
        title: 'Lead Life-cycle Transition',
        content: `${user.firstName} ${user.lastName} successfully converted lead ${leadFullName} to a ${dto.type}.`,
        relatedTo: lead._id,
        relatedType: 'Lead',
        author: user.userId || user._id,
      });

      // Mirror on the resulting record
      await this.createActivity({
        type: 'System',
        title: `${dto.type} Established`,
        content: `This ${dto.type} profile was established by converting Lead: ${leadFullName}.`,
        relatedTo: result.entity._id,
        relatedType: dto.type.charAt(0).toUpperCase() + dto.type.slice(1),
        author: user.userId || user._id,
      });
    }

    if (!result) throw new Error('Invalid convert type');
    return result;
  }

  /**
   * Contacts are the CRM person superset; leads are segments. Deleting a lead must not remove contacts —
   * only clear `sourceLead` when it pointed at a deleted lead and remove those lead ids from `associatedLeads`.
   */
  private async detachContactsFromDeletedLeads(leadOids: Types.ObjectId[]): Promise<void> {
    if (!leadOids.length) return;
    await this.contactModel
      .updateMany(
        { sourceLead: { $in: leadOids } },
        { $unset: { sourceLead: 1 }, $pullAll: { associatedLeads: leadOids } },
      )
      .exec();
    await this.contactModel
      .updateMany({ associatedLeads: { $in: leadOids } }, { $pullAll: { associatedLeads: leadOids } })
      .exec();
  }

  // --- Soft delete (move to Trash; permanent purge is admin Trash API) ---
  async removeLead(id: string, deletedBy?: string) {
    const oidStr = await this.resolveDocumentId(this.leadModel, id);
    if (!oidStr) return null;
    await this.bustCrmCache('leads', oidStr);
    return this.leadModel
      .findByIdAndUpdate(oidStr, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }
  async bulkRemoveLeads(ids: string[], deletedBy?: string) {
    const oids = ids.map(i => this.toObjectIdSafe(i)).filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) return { modifiedCount: 0, deletedCount: 0 };
    await this.bustCrmCache('leads');
    const result = await this.leadModel
      .updateMany({ _id: { $in: oids } }, softDeleteUpdate(deletedBy))
      .exec();
    return {
      modifiedCount: result.modifiedCount,
      deletedCount: result.modifiedCount,
    };
  }

  /**
   * Reassign leadOwner for selected leads (same ownership model as segments assign).
   */
  async bulkAssignLeads(
    body: { ownerName?: string; ids?: string[] },
    user?: any,
  ) {
    const ownerName = String(body?.ownerName || '').trim();
    if (!ownerName) throw new BadRequestException('Owner is required');
    if (ownerName.length > 200) {
      throw new BadRequestException('Owner name is too long');
    }

    const maxAssign = 2000;
    const oids = (body?.ids || [])
      .map((raw) => this.toObjectIdSafe(String(raw || '').trim()))
      .filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) {
      throw new BadRequestException('Select at least one lead');
    }
    if (oids.length > maxAssign) {
      throw new BadRequestException(
        `You can assign at most ${maxAssign} leads at once`,
      );
    }

    const clauses: Record<string, unknown>[] = [{ _id: { $in: oids } }];
    if (user && !this.canReadAllModuleData('leads', user)) {
      clauses.push(this.leadOwnershipFilter(user));
    }
    const filter: Record<string, unknown> =
      clauses.length === 1 ? clauses[0] : { $and: clauses };

    const previousOwners = await this.leadModel
      .find(filter as Record<string, any>)
      .select('_id leadOwner')
      .lean()
      .exec();

    const result = await this.leadModel
      .updateMany(filter as Record<string, any>, {
        $set: { leadOwner: ownerName },
      })
      .exec();

    await this.bustCrmCache('leads');

    await this.roleAuditLog.log({
      actor: user,
      action: 'ownership_changed',
      targetType: 'Lead',
      targetLabel: `Bulk reassign ${previousOwners.length} lead(s) to ${ownerName}`,
      before: { owners: previousOwners.map((l: any) => ({ id: l._id, leadOwner: l.leadOwner })) },
      after: { leadOwner: ownerName, ids: oids },
    });

    return {
      ownerName,
      requested: oids.length,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    };
  }

  async removeOrganization(id: string, deletedBy?: string) {
    const oid = await this.resolveDocumentId(this.organizationModel, id);
    if (!oid) return null;
    await this.bustCrmCache('organizations', oid);
    return this.organizationModel
      .findByIdAndUpdate(oid, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }
  async removeContact(id: string, deletedBy?: string) {
    const oid = await this.resolveDocumentId(this.contactModel, id);
    if (!oid) return null;
    await this.bustCrmCache('contacts', oid);
    return this.contactModel
      .findByIdAndUpdate(oid, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }
  async bulkRemoveContacts(ids: string[], deletedBy?: string) {
    await this.bustCrmCache('contacts');
    const oids = ids
      .map((i) => this.toObjectIdSafe(i))
      .filter((o): o is Types.ObjectId => !!o);
    const result = await this.contactModel
      .updateMany({ _id: { $in: oids } }, softDeleteUpdate(deletedBy))
      .exec();
    return {
      modifiedCount: result.modifiedCount,
      deletedCount: result.modifiedCount,
    };
  }
  async removeActivity(id: string, deletedBy?: string) {
    return this.activityModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy), { new: true })
      .exec();
  }

  /** Permanent lead purge (admin Trash) — detaches contacts then hard-deletes. */
  async permanentlyRemoveLead(id: string) {
    // Soft-deleted leads are hidden by the plugin; resolve with includeDeleted.
    let oidStr: string | null = null;
    if (isMongoObjectIdString(id)) {
      const byId = await this.leadModel
        .findById(id)
        .select('_id')
        .setOptions({ includeDeleted: true })
        .lean()
        .exec();
      if (byId) oidStr = String((byId as { _id: Types.ObjectId })._id);
    }
    if (!oidStr) {
      const byRid = await this.leadModel
        .findOne({ recordId: id })
        .select('_id')
        .setOptions({ includeDeleted: true })
        .lean()
        .exec();
      if (byRid) oidStr = String((byRid as { _id: Types.ObjectId })._id);
    }
    if (!oidStr) return null;
    const oid = this.toObjectIdSafe(oidStr);
    if (!oid) return null;
    await this.detachContactsFromDeletedLeads([oid]);
    await this.bustCrmCache('leads', oidStr);
    return this.leadModel
      .findOneAndDelete({ _id: oidStr, isDeleted: true })
      .setOptions({ includeDeleted: true })
      .exec();
  }

  async exportToCsv(
    type: string,
    options?: {
      ids?: string[];
      pipelineId?: string;
    },
    user?: any,
  ): Promise<string> {
    await this.exportQuotaService.checkQuota(user?.userId);
    let data: any[] = [];
    let headers: string[] = [];
    const selectedObjectIds = Array.isArray(options?.ids)
      ? options!.ids
          .filter((id) => isMongoObjectIdString(id))
          .map((id) => new Types.ObjectId(String(id).trim()))
      : [];
    const pipelineIdCandidate = String(options?.pipelineId || '').trim();
    const pipelineId = isMongoObjectIdString(pipelineIdCandidate)
      ? pipelineIdCandidate
      : '';

    switch (type) {
      case 'leads':
        data = await this.leadModel
          .find(
            selectedObjectIds.length
              ? { _id: { $in: selectedObjectIds } }
              : pipelineId
              ? { pipeline: pipelineId }
              : {},
          )
          .sort({ createdAt: -1 })
          .limit(CRM_MAX_EXPORT_ROWS)
          .maxTimeMS(CRM_LIST_MAX_TIME_MS)
          .lean();
        headers = [
          '_id',
          'firstName',
          'lastName',
          'organization',
          'status',
          'email',
          'mobileNo',
          'createdAt',
        ];
        break;
      case 'contacts':
        data = await this.contactModel
          .find(
            selectedObjectIds.length
              ? { _id: { $in: selectedObjectIds } }
              : {},
          )
          .sort({ createdAt: -1 })
          .limit(CRM_MAX_EXPORT_ROWS)
          .maxTimeMS(CRM_LIST_MAX_TIME_MS)
          .lean();
        headers = [
          '_id',
          'firstName',
          'lastName',
          'email',
          'mobileNo',
          'jobTitle',
          'organization',
          'createdAt',
        ];
        break;
      default:
        throw new Error('Invalid export type');
    }

    const csvRows = [
      headers.join(','), // Header row
      ...data.map((row) =>
        headers
          .map((fieldName) => {
            const value = row[fieldName] || '';
            const escaped = ('' + value).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(','),
      ),
    ];

    await this.exportQuotaService.logExport(user, type, data.length, {
      ids: options?.ids,
      pipelineId: options?.pipelineId,
    });

    return csvRows.join('\r\n');
  }

  private normalizeImportDuplicateStrategy(raw?: string): ImportDuplicateStrategy {
    const v = String(raw || 'merge').toLowerCase();
    if (v === 'create' || v === 'skip' || v === 'merge' || v === 'replace') {
      return v;
    }
    return 'merge';
  }

  private bumpImportJobOutcome(
    job: NonNullable<ReturnType<typeof this.importJobs.get>>,
    outcome: ImportRowOutcome,
  ): void {
    if (outcome === 'skipped') job.skippedCount += 1;
    else if (outcome === 'merged') {
      job.mergedCount += 1;
      job.successCount += 1;
    } else if (outcome === 'replaced') {
      job.replacedCount += 1;
      job.successCount += 1;
    } else {
      job.createdCount += 1;
      job.successCount += 1;
    }
  }

  private async findExistingContactForImport(
    mappedData: Record<string, unknown>,
    customFields: Record<string, string>,
  ): Promise<ContactDocument | null> {
    const email = normalizeEmail(String(mappedData.email || ''));
    if (email) {
      const byEmail = await this.contactModel
        .findOne({
          $or: [
            { email: this.emailRegexForMatch(email) },
            { additionalEmails: this.emailRegexForMatch(email) },
          ],
        })
        .exec();
      if (byEmail) return byEmail;
    }
    const hs =
      customFields.hubspot_contact_id ||
      mappedData.hubspotContactId ||
      mappedData.hsContactId;
    if (hs != null && String(hs).trim() !== '') {
      const byHs = await this.contactModel
        .findOne({
          'customFields.hubspot_contact_id': String(hs).trim(),
        })
        .exec();
      if (byHs) return byHs;
    }
    const li = linkedInProfileKey(String(mappedData.linkedinUrl || ''));
    if (li) {
      const byLi = await this.contactModel
        .findOne({
          linkedinUrl: {
            $regex: new RegExp(
              `/in/${this.escapeRegex(li)}(/|\\?|#|$)`,
              'i',
            ),
          },
        })
        .exec();
      if (byLi) return byLi;
    }
    for (const field of ['mobileNo', 'phone'] as const) {
      const digits = normalizePhoneDigits(String(mappedData[field] || ''));
      if (digits.length < 7) continue;
      const re = new RegExp(digits.split('').join('\\D*'));
      const byPhone = await this.contactModel
        .findOne({
          $or: [{ mobileNo: { $regex: re } }, { phone: { $regex: re } }],
        })
        .exec();
      if (byPhone) return byPhone;
    }
    return null;
  }

  private async findExistingLeadForImport(
    mappedData: Record<string, unknown>,
    customFields: Record<string, string>,
  ): Promise<LeadDocument | null> {
    const email = normalizeEmail(String(mappedData.email || ''));
    if (email) {
      const byEmail = await this.leadModel
        .findOne({
          $or: [
            { email: this.emailRegexForMatch(email) },
            { additionalEmails: this.emailRegexForMatch(email) },
          ],
        })
        .exec();
      if (byEmail) return byEmail;
    }
    const hs =
      customFields.hubspot_contact_id ||
      mappedData.hubspotContactId ||
      mappedData.hsContactId;
    if (hs != null && String(hs).trim() !== '') {
      const byHs = await this.leadModel
        .findOne({
          'customFields.hubspot_contact_id': String(hs).trim(),
        })
        .exec();
      if (byHs) return byHs;
    }
    const li = linkedInProfileKey(String(mappedData.linkedinUrl || ''));
    if (li) {
      const byLi = await this.leadModel
        .findOne({
          linkedinUrl: {
            $regex: new RegExp(
              `/in/${this.escapeRegex(li)}(/|\\?|#|$)`,
              'i',
            ),
          },
        })
        .exec();
      if (byLi) return byLi;
    }
    for (const field of ['mobileNo', 'phone'] as const) {
      const digits = normalizePhoneDigits(String(mappedData[field] || ''));
      if (digits.length < 7) continue;
      const re = new RegExp(digits.split('').join('\\D*'));
      const byPhone = await this.leadModel
        .findOne({
          $or: [{ mobileNo: { $regex: re } }, { phone: { $regex: re } }],
        })
        .exec();
      if (byPhone) return byPhone;
    }
    return null;
  }

  private buildImportPersonMergePatch(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
    scalarKeys: readonly string[],
  ): Record<string, unknown> {
    return mergePersonScalarFields(
      existing,
      incoming,
      scalarKeys as unknown as string[],
    ) as Record<string, unknown>;
  }

  private buildImportPersonReplacePatch(
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const patch = { ...incoming };
    delete patch._id;
    delete patch.recordId;
    delete patch.createdAt;
    delete patch.updatedAt;
    delete patch.__v;
    return patch;
  }

  getFileHeaders(buffer: Buffer): string[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    return (jsonData[0] as string[]) || [];
  }

  private parseExcelToRows(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
  }

  private pruneOldImportJobs(): void {
    const cutoff = Date.now() - CRMService.IMPORT_JOB_TTL_MS;
    for (const [id, job] of this.importJobs) {
      if (job.createdAt < cutoff) this.importJobs.delete(id);
    }
  }

  startImportFromExcel(
    type: string,
    buffer: Buffer,
    mapping?: Record<string, string>,
    user?: any,
    duplicateStrategy?: string,
  ): { jobId: string; total: number } {
    this.pruneOldImportJobs();
    const jsonData = this.parseExcelToRows(buffer);
    const jobId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const strategy = this.normalizeImportDuplicateStrategy(duplicateStrategy);
    this.importJobs.set(jobId, {
      id: jobId,
      type,
      status: 'processing',
      total: jsonData.length,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      mergedCount: 0,
      replacedCount: 0,
      createdCount: 0,
      existingClientCount: 0,
      invalidRoleCount: 0,
      duplicateStrategy: strategy,
      createdAt: Date.now(),
    });
    void this.importFromExcel(
      type,
      buffer,
      mapping,
      user,
      jobId,
      strategy,
    ).catch(
      (err: Error) => {
        const job = this.importJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = err?.message || 'Import failed';
        }
      },
    );
    return { jobId, total: jsonData.length };
  }

  getImportJobStatus(jobId: string) {
    this.pruneOldImportJobs();
    const job = this.importJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found or expired');
    }
    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      total: job.total,
      processed: job.processed,
      successCount: job.successCount,
      failedCount: job.failedCount,
      count: job.successCount,
      skippedCount: job.skippedCount,
      mergedCount: job.mergedCount,
      replacedCount: job.replacedCount,
      createdCount: job.createdCount,
      existingClientCount: job.existingClientCount,
      invalidRoleCount: job.invalidRoleCount,
      duplicateStrategy: job.duplicateStrategy,
      error: job.error,
      progress:
        job.total > 0 ? Math.round((job.processed / job.total) * 100) : 100,
    };
  }

  async importFromExcel(
    type: string,
    buffer: Buffer,
    mapping?: Record<string, string>,
    user?: any,
    jobId?: string,
    duplicateStrategy: ImportDuplicateStrategy = 'merge',
  ): Promise<{ count: number }> {
    const jsonData = this.parseExcelToRows(buffer);
    const job = jobId ? this.importJobs.get(jobId) : undefined;
    if (job) job.total = jsonData.length;

    let count = 0;
    let rowIndex = 0;
    for (const row of jsonData) {
      rowIndex++;
      let rowOutcome: ImportRowOutcome | 'failed' = 'failed';
      try {
        const mappedData: any = {};
        const customFields: Record<string, string> = {};

        // Use mapping if provided, otherwise fallback to heuristics
        if (mapping) {
          Object.entries(mapping).forEach(([crmField, fileCol]) => {
            if (fileCol && row[fileCol] !== undefined) {
              if (crmField.startsWith('cf_')) {
                customFields[crmField.replace('cf_', '')] = String(
                  row[fileCol],
                );
              } else {
                mappedData[crmField] = row[fileCol];
              }
            }
          });
        }

        if (
          mappedData.additionalEmails !== undefined &&
          mappedData.additionalEmails !== null &&
          mappedData.additionalEmails !== ''
        ) {
          // Imported as one CSV cell (comma/semicolon-separated) — split into the string[] the schema expects.
          const primary = String(mappedData.email ?? '')
            .trim()
            .toLowerCase();
          const seen = new Set<string>();
          const parsed: string[] = [];
          for (const raw of String(mappedData.additionalEmails).split(/[,;]/)) {
            const trimmed = raw.trim();
            if (!trimmed || !trimmed.includes('@')) continue;
            const lower = trimmed.toLowerCase();
            if (primary && lower === primary) continue;
            if (seen.has(lower)) continue;
            seen.add(lower);
            parsed.push(trimmed);
          }
          mappedData.additionalEmails = parsed;
        }

        if (type === 'leads') {
          if (!mapping) {
            const fullName = String(
              row.Name || row.name || row.FullName || row.fullName || '',
            );
            mappedData.firstName =
              row.FirstName ||
              row.firstName ||
              row['First Name'] ||
              fullName.split(' ')[0] ||
              'Unknown';
            mappedData.lastName =
              row.LastName ||
              row.lastName ||
              row['Last Name'] ||
              fullName.split(' ').slice(1).join(' ') ||
              'Lead';
            mappedData.organization =
              row.Organization ||
              row.organization ||
              row.Company ||
              row.company;
            mappedData.status = row.Status || row.status || 'New';
            mappedData.email = row.Email || row.email;
            mappedData.mobileNo =
              row.MobileNo ||
              row.mobileNo ||
              row['Mobile No'] ||
              row.Phone ||
              row.phone;
          }

          // Ensure pipeline and stage for board visibility
          if (!mappedData.pipeline || !mappedData.stage) {
            const pipelines = await this.pipelinesService.findAll('leads');
            const defaultPipeline =
              pipelines.find((p) => (p as any).isDefault) || pipelines[0];
            if (defaultPipeline) {
              mappedData.pipeline = (defaultPipeline as any)._id;
              const firstStage = (defaultPipeline as any).stages?.sort(
                (a: any, b: any) => a.order - b.order,
              )[0];
              if (firstStage) {
                mappedData.stage = firstStage.name;
                mappedData.status = firstStage.name;
              }
            }
          }

          const hsLeadContact =
            mappedData.hubspotContactId ?? mappedData.hsContactId;
          if (hsLeadContact != null && String(hsLeadContact).trim() !== '') {
            customFields.hubspot_contact_id = String(hsLeadContact).trim();
          }
          const leadOrgId = await this.resolveImportOrganizationId(mappedData);
          const leadClient = await this.resolveImportClientId(mappedData);
          if (leadClient) {
            mappedData.clientId = leadClient.clientId;
            if (job) {
              if (leadClient.wasExisting) job.existingClientCount++;
              if (leadClient.invalidRole) job.invalidRoleCount++;
            }
          }
          this.stripImportRoutingFields(mappedData);
          this.stripLeadImportClientRoutingFields(mappedData);
          const leadRequestedRid =
            mappedData.recordId != null &&
              String(mappedData.recordId).trim() !== ''
              ? String(mappedData.recordId).trim()
              : null;
          delete mappedData.recordId;
          const existingLead = await this.findExistingLeadForImport(
            mappedData,
            customFields,
          );
          if (existingLead && duplicateStrategy === 'skip') {
            rowOutcome = 'skipped';
          } else if (
            existingLead &&
            (duplicateStrategy === 'merge' || duplicateStrategy === 'replace')
          ) {
            await this.assertPersonContactIdentifiersValid({
              entity: 'lead',
              merged: { ...mappedData },
              excludeLeadId: String(existingLead._id),
              existingLead,
            });
            const existingLean = existingLead.toObject
              ? existingLead.toObject()
              : (existingLead as unknown as Record<string, unknown>);
            const scalarPatch =
              duplicateStrategy === 'merge'
                ? this.buildImportPersonMergePatch(
                    existingLean,
                    mappedData,
                    LEAD_MERGE_SCALAR,
                  )
                : this.buildImportPersonReplacePatch(mappedData);
            const mergedCf =
              duplicateStrategy === 'replace'
                ? { ...customFields }
                : this.mergeCustomFieldsMaps(
                    existingLead.customFields,
                    customFields,
                  );
            const orgIds = unionObjectIdStrings(
              (existingLead.associatedOrganizations as unknown[]) || [],
              leadOrgId ? [leadOrgId] : [],
            );
            await this.leadModel.updateOne(
              { _id: existingLead._id },
              {
                $set: {
                  ...scalarPatch,
                  customFields: mergedCf,
                  associatedOrganizations: orgIds
                    .filter((id) => Types.ObjectId.isValid(id))
                    .map((id) => new Types.ObjectId(id)),
                },
              },
            );
            const refreshed = await this.leadModel.findById(existingLead._id).lean().exec();
            if (refreshed) await this.syncContactFromLeadSafe(refreshed);
            rowOutcome =
              duplicateStrategy === 'merge' ? 'merged' : 'replaced';
          } else {
            await this.assertPersonContactIdentifiersValid({
              entity: 'lead',
              merged: { ...mappedData },
            });
            const importedLead = await this.leadModel.create({
              ...mappedData,
              customFields,
              ...(leadOrgId ? { associatedOrganizations: [leadOrgId] } : {}),
              recordId: await this.nextRecordId(
                this.leadModel,
                leadRequestedRid,
              ),
            });
            const leadObj = importedLead.toObject
              ? importedLead.toObject()
              : importedLead;
            await this.syncContactFromLeadSafe(leadObj);
            if (leadOrgId && (leadObj.email || '').includes('@')) {
              const c = await this.contactModel
                .findOne({
                  email: this.emailRegexForMatch(String(leadObj.email).trim()),
                })
                .exec();
              if (c)
                await this.addContactToOrganizationAssoc(
                  leadOrgId,
                  c._id as Types.ObjectId,
                );
            }
            rowOutcome = 'created';
          }
        } else if (type === 'contacts') {
          if (!mapping) {
            const fullName = String(
              row.Name || row.name || row.FullName || row.fullName || '',
            );
            mappedData.firstName =
              row.FirstName ||
              row.firstName ||
              row['First Name'] ||
              fullName.split(' ')[0] ||
              'Unknown';
            mappedData.lastName =
              row.LastName ||
              row.lastName ||
              row['Last Name'] ||
              fullName.split(' ').slice(1).join(' ') ||
              'User';
            mappedData.email = row.Email || row.email;
            mappedData.mobileNo =
              row.MobileNo ||
              row.mobileNo ||
              row['Mobile No'] ||
              row.Phone ||
              row.phone;
            mappedData.jobTitle = row.JobTitle || row['Job Title'] || 'Contact';
            mappedData.organization =
              row.Organization ||
              row.organization ||
              row.Company ||
              row.company;
          }
          if (
            mappedData.annualRevenue !== undefined &&
            mappedData.annualRevenue !== '' &&
            mappedData.annualRevenue !== null
          ) {
            mappedData.annualRevenue = Number(mappedData.annualRevenue);
          }
          const hsCont =
            mappedData.hubspotContactId ?? mappedData.hsContactId;
          if (hsCont != null && String(hsCont).trim() !== '') {
            customFields.hubspot_contact_id = String(hsCont).trim();
          }
          const contactOrgId = await this.resolveImportOrganizationId(mappedData);
          this.stripImportRoutingFields(mappedData);
          const contactRequestedRid =
            mappedData.recordId != null &&
              String(mappedData.recordId).trim() !== ''
              ? String(mappedData.recordId).trim()
              : null;
          delete mappedData.recordId;
          const existingContact = await this.findExistingContactForImport(
            mappedData,
            customFields,
          );
          if (existingContact && duplicateStrategy === 'skip') {
            rowOutcome = 'skipped';
          } else if (
            existingContact &&
            (duplicateStrategy === 'merge' || duplicateStrategy === 'replace')
          ) {
            await this.assertPersonContactIdentifiersValid({
              entity: 'contact',
              merged: { ...mappedData },
              excludeContactId: String(existingContact._id),
              existingContact,
            });
            const existingLean = existingContact.toObject
              ? existingContact.toObject()
              : (existingContact as unknown as Record<string, unknown>);
            const scalarPatch =
              duplicateStrategy === 'merge'
                ? this.buildImportPersonMergePatch(
                    existingLean,
                    mappedData,
                    CONTACT_MERGE_SCALAR,
                  )
                : this.buildImportPersonReplacePatch(mappedData);
            const mergedCf =
              duplicateStrategy === 'replace'
                ? { ...customFields }
                : this.mergeCustomFieldsMaps(
                    existingContact.customFields,
                    customFields,
                  );
            const orgIds = unionObjectIdStrings(
              (existingContact.associatedOrganizations as unknown[]) || [],
              contactOrgId ? [contactOrgId] : [],
            );
            await this.contactModel.updateOne(
              { _id: existingContact._id },
              {
                $set: {
                  ...scalarPatch,
                  customFields: mergedCf,
                  associatedOrganizations: orgIds
                    .filter((id) => Types.ObjectId.isValid(id))
                    .map((id) => new Types.ObjectId(id)),
                },
              },
            );
            if (contactOrgId) {
              await this.addContactToOrganizationAssoc(
                contactOrgId,
                existingContact._id as Types.ObjectId,
              );
            }
            rowOutcome =
              duplicateStrategy === 'merge' ? 'merged' : 'replaced';
          } else {
            await this.assertPersonContactIdentifiersValid({
              entity: 'contact',
              merged: { ...mappedData },
            });
            const createdContact = await this.contactModel.create({
              ...mappedData,
              customFields,
              ...(contactOrgId
                ? { associatedOrganizations: [contactOrgId] }
                : {}),
              recordId: await this.nextRecordId(
                this.contactModel,
                contactRequestedRid,
              ),
            });
            if (contactOrgId)
              await this.addContactToOrganizationAssoc(
                contactOrgId,
                createdContact._id as Types.ObjectId,
              );
            rowOutcome = 'created';
          }
        } else if (type === 'organizations') {
          if (!mapping) {
            mappedData.name =
              row.Name ||
              row.name ||
              row['Company name'] ||
              row['Company Name'] ||
              row.Company ||
              row.company ||
              'Unknown';
            mappedData.website =
              row.Website || row.website || row.Domain || row.domain;
            mappedData.phone =
              row.Phone ||
              row.phone ||
              row['Phone Number'] ||
              row['Phone number'];
            mappedData.email =
              row['Company Email'] ||
              row['Company email'] ||
              row.email;
            mappedData.industry = row.Industry || row.industry;
            mappedData.territory = row.Territory || row.territory;
            mappedData.noOfEmployees =
              row['Number of Employees'] ||
              row.noOfEmployees ||
              row['No. of Employees'];
            mappedData.address =
              row.Address ||
              row.address ||
              row['Street Address'] ||
              row['Company address'];
            mappedData.annualRevenue =
              row['Annual Revenue'] ?? row.annualRevenue ?? row.Revenue;
            mappedData.hubspotCompanyId =
              row['Record ID'] ||
              row['Company ID'] ||
              row['Company Id'] ||
              row.hubspotCompanyId;
          }
          if (
            mappedData.annualRevenue !== undefined &&
            mappedData.annualRevenue !== '' &&
            mappedData.annualRevenue !== null
          ) {
            mappedData.annualRevenue = Number(mappedData.annualRevenue);
          }
          const hsRaw =
            mappedData.hubspotCompanyId ?? mappedData.hsCompanyId ?? null;
          const hsCompanyId =
            hsRaw != null && String(hsRaw).trim() !== ''
              ? String(hsRaw).trim()
              : '';
          this.stripImportRoutingFields(mappedData);
          const orgName = String(mappedData.name || 'Unknown').trim() || 'Unknown';
          const orgCustom = { ...customFields } as Record<string, unknown>;
          if (hsCompanyId) orgCustom.hubspot_company_id = hsCompanyId;
          const orgPayload: Record<string, unknown> = {
            name: orgName,
            website: mappedData.website || undefined,
            phone: mappedData.phone || undefined,
            email: mappedData.email || undefined,
            industry: mappedData.industry || undefined,
            territory: mappedData.territory || undefined,
            noOfEmployees: mappedData.noOfEmployees || undefined,
            annualRevenue:
              mappedData.annualRevenue != null &&
                !Number.isNaN(Number(mappedData.annualRevenue))
                ? Number(mappedData.annualRevenue)
                : undefined,
            address: mappedData.address || undefined,
            customFields: orgCustom,
          };
          let existing: OrganizationDocument | null = null;
          if (duplicateStrategy !== 'create') {
            if (hsCompanyId) {
              existing = await this.organizationModel
                .findOne({ 'customFields.hubspot_company_id': hsCompanyId })
                .exec();
            }
            if (!existing) {
              existing = await this.organizationModel
                .findOne({
                  name: {
                    $regex: new RegExp(`^${this.escapeRegex(orgName)}$`, 'i'),
                  },
                })
                .exec();
            }
          }
          if (existing && duplicateStrategy === 'skip') {
            rowOutcome = 'skipped';
          } else if (existing && duplicateStrategy === 'replace') {
            const mergedCf = this.mergeCustomFieldsMaps(
              undefined,
              orgPayload.customFields as Record<string, unknown>,
            );
            await this.organizationModel
              .findByIdAndUpdate(existing._id, {
                $set: { ...orgPayload, customFields: mergedCf },
              })
              .exec();
            rowOutcome = 'replaced';
          } else if (existing && duplicateStrategy === 'merge') {
            const mergedCf = this.mergeCustomFieldsMaps(
              existing.customFields,
              orgPayload.customFields as Record<string, unknown>,
            );
            const existingLean = existing.toObject
              ? existing.toObject()
              : (existing as unknown as Record<string, unknown>);
            const mergePatch = this.buildImportPersonMergePatch(
              existingLean,
              orgPayload as Record<string, unknown>,
              [
                'name',
                'website',
                'phone',
                'email',
                'industry',
                'territory',
                'noOfEmployees',
                'annualRevenue',
                'address',
              ],
            );
            await this.organizationModel
              .findByIdAndUpdate(existing._id, {
                $set: {
                  ...mergePatch,
                  customFields: mergedCf,
                },
              })
              .exec();
            rowOutcome = 'merged';
          } else {
            const requestedOrgRid =
              hsCompanyId ||
              (mappedData.recordId != null &&
                String(mappedData.recordId).trim() !== ''
                ? String(mappedData.recordId).trim()
                : null);
            await this.organizationModel.create({
              ...orgPayload,
              recordId: await this.nextRecordId(
                this.organizationModel,
                requestedOrgRid,
              ),
            });
            rowOutcome = 'created';
          }
        } else if (type === 'clients') {
          if (!mapping) {
            mappedData.name = row.Name || row.name || row['Client Name'] || 'Unknown';
            mappedData.email = row.Email || row.email;
            mappedData.phone = row.Phone || row.phone;
          }
          this.stripImportRoutingFields(mappedData);
          const clientName = String(mappedData.name || 'Unknown').trim() || 'Unknown';
          const clientEmail = String(mappedData.email ?? '').trim();
          const clientPhone = this.sanitizePhone(mappedData.mobileNo ?? mappedData.phone);
          const rawRole = String(mappedData.role ?? '').trim().toUpperCase();
          const clientRole = this.CLIENT_ROLE_OPTIONS.includes(rawRole)
            ? rawRole
            : undefined;

          const clientPayload: Record<string, unknown> = {
            name: clientName,
            email: clientEmail || undefined,
            additionalEmails: Array.isArray(mappedData.additionalEmails)
              ? mappedData.additionalEmails
              : undefined,
            phone: clientPhone || undefined,
            whatsappNumber: mappedData.whatsappNumber || undefined,
            address: mappedData.address || undefined,
            role: clientRole,
            status: mappedData.status || undefined,
            customFields,
          };

          let existingClient: ClientDocument | null = null;
          if (duplicateStrategy !== 'create') {
            const matchOr: Record<string, unknown>[] = [];
            if (clientEmail && clientEmail.includes('@')) {
              matchOr.push({ email: this.emailRegexForMatch(clientEmail) });
            }
            if (clientPhone) matchOr.push({ phone: clientPhone });
            if (matchOr.length) {
              existingClient = await this.clientModel
                .findOne({ $or: matchOr })
                .exec();
            }
          }

          if (existingClient && duplicateStrategy === 'skip') {
            rowOutcome = 'skipped';
          } else if (existingClient && duplicateStrategy === 'replace') {
            const mergedCf = this.mergeCustomFieldsMaps(undefined, customFields);
            await this.clientModel
              .findByIdAndUpdate(existingClient._id, {
                $set: { ...clientPayload, customFields: mergedCf },
              })
              .exec();
            rowOutcome = 'replaced';
          } else if (existingClient && duplicateStrategy === 'merge') {
            const mergedCf = this.mergeCustomFieldsMaps(
              existingClient.customFields,
              customFields,
            );
            const existingLean = existingClient.toObject
              ? existingClient.toObject()
              : (existingClient as unknown as Record<string, unknown>);
            const mergePatch = this.buildImportPersonMergePatch(
              existingLean,
              clientPayload,
              ['name', 'email', 'phone', 'whatsappNumber', 'address', 'role', 'status'],
            );
            await this.clientModel
              .findByIdAndUpdate(existingClient._id, {
                $set: { ...mergePatch, customFields: mergedCf },
              })
              .exec();
            rowOutcome = 'merged';
          } else {
            await this.clientModel.create(clientPayload);
            rowOutcome = 'created';
          }
        }

        if (rowOutcome !== 'failed') {
          if (rowOutcome === 'skipped') {
            if (job) this.bumpImportJobOutcome(job, 'skipped');
          } else {
            count++;
            if (job) this.bumpImportJobOutcome(job, rowOutcome);
          }
        }
      } catch (err) {
        console.error(`Failed to import row:`, (err as Error).message);
        rowOutcome = 'failed';
      }
      if (job) {
        job.processed = rowIndex;
        const handled = job.successCount + job.skippedCount;
        job.failedCount = Math.max(0, rowIndex - handled);
      }
    }

    if (job) {
      job.status = 'completed';
      job.processed = jsonData.length;
      const handled = job.successCount + job.skippedCount;
      job.failedCount = Math.max(0, jsonData.length - handled);
    }

    if (user && count > 0) {
      // Log a single activity for the import session
      // We don't have a single entity to relate this to, but we can log it as an audit event
      // The AuditLogInterceptor already handles the audit log.
      // For HubSpot-like feed, we might want to log it if it was for a specific organization,
      // but bulk imports are usually general.
    }
    return { count };
  }

  // --- Calendar ---
  async getCalendarEvents(start?: string, end?: string, owner?: string): Promise<any> {
    const scheduledConditions: any[] = [
      {
        type: { $in: ['Task', 'Meeting'] },
        'metadata.isCalendarEvent': true,
        'metadata.dueDate': { $exists: true, $ne: null },
      },
      {
        // Legacy record-page meetings predate the unified calendar metadata.
        type: 'Meeting',
        'metadata.date': { $exists: true, $ne: '' },
        'metadata.time': { $exists: true, $ne: '' },
      },
    ];
    const filter: any = {
      $and: [{ $or: scheduledConditions }],
      status: { $nin: ['Cancelled', 'Deleted'] },
    };
    if (owner && owner !== 'All' && Types.ObjectId.isValid(owner)) {
      filter.$and.push({
        $or: [
          { author: new Types.ObjectId(owner) },
          { assignee: new Types.ObjectId(owner) },
        ],
      });
    }
    const rows = await this.activityModel
      .find(filter)
      .sort({ 'metadata.dueDate': 1, createdAt: 1 })
      .lean()
      .exec();

    const normalized = rows
      .map((row: any) => this.normalizeScheduledActivityMetadata(row))
      .filter((row: any) => Boolean(row.metadata?.dueDate));
    const startMs = start ? new Date(start).getTime() : null;
    const endMs = end ? new Date(end).getTime() : null;

    return normalized
      .filter((row: any) => {
        const dueMs = new Date(row.metadata.dueDate).getTime();
        if (Number.isNaN(dueMs)) return false;
        if (startMs !== null && !Number.isNaN(startMs) && dueMs < startMs) return false;
        if (endMs !== null && !Number.isNaN(endMs) && dueMs > endMs) return false;
        return true;
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.metadata.dueDate).getTime() -
          new Date(b.metadata.dueDate).getTime(),
      );
  }

  async createCalendarEvent(dto: any, user: any): Promise<any> {
    const dueDate = dto.dueDate || new Date().toISOString();
    const incomingMeta = dto.metadata && typeof dto.metadata === 'object' ? dto.metadata : {};
    const payload = {
      ...dto,
      type: 'Task', // Standard base type, UI differentiates using isCalendarEvent
      author: user.userId || user._id,
      assignee: dto.assignee || user.userId || user._id,
      metadata: {
        ...incomingMeta,
        isCalendarEvent: true,
        dueDate,
        eventCategory: incomingMeta.eventCategory || dto.eventCategory || 'meeting',
        reminderAt: incomingMeta.reminderAt || undefined,
        reminderType: incomingMeta.reminderType || undefined,
        reminderMessage: incomingMeta.reminderMessage || undefined,
        reminderDisabled: Boolean(incomingMeta.reminderDisabled),
        reminderSentAt: undefined,
        remindersSent: incomingMeta.remindersSent ?? [], // Initialize cron reminders
      },
    };
    const created = await this.activityModel.create(payload);
    return created;
  }

  private sanitizePhone(val: any): string | undefined {
    if (!val || typeof val !== 'string') return undefined;
    // Keep only numbers and '+' (for international format)
    const sanitized = val.replace(/[^0-9+]/g, '');
    return sanitized || undefined;
  }

  /**
   * Proxies an image from a social CDN so the browser can display it
   * without hitting cross-origin / hotlinking restrictions.
   * Only allows known social media CDN domains for security.
   */
  async proxyImage(url: string, res: any): Promise<void> {
    const ALLOWED_HOSTS = [
      'scontent', 'fbcdn.net', 'facebook.com',
      'cdninstagram.com', 'instagram.com',
      'lookaside.fbsbx.com',
      'threads.net', 'threads.com',
      'media.licdn.com', 'linkedin.com',
      'pbs.twimg.com', 'twimg.com',
    ];
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      res.status(400).send('Invalid URL');
      return;
    }
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch { res.status(400).send('Invalid URL'); return; }
    if (!ALLOWED_HOSTS.some((h) => hostname.includes(h))) {
      res.status(403).send('Host not allowed');
      return;
    }
    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          Referer: 'https://www.facebook.com/',
        },
        timeout: 10000,
      });
      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      (response.data as any).pipe(res);
    } catch {
      res.status(502).send('Could not fetch image');
    }
  }

  /**
   * Fetches metadata (Open Graph tags) for a given URL.
   * Used for previewing LinkedIn posts or other shared links in the CRM.
   */
  async fetchLinkMetadata(rawInput: string): Promise<any> {
    if (!rawInput || typeof rawInput !== 'string') return { url: rawInput };

    // If the user pasted a full <iframe ...> embed code, extract the src URL
    const iframeSrcMatch = rawInput.match(/src=["']([^"']+)["']/);
    const url = iframeSrcMatch ? iframeSrcMatch[1] : rawInput.trim();

    if (!url.startsWith('http')) return { url };

    const isLinkedIn = url.includes('linkedin.com');
    const isThreads = url.includes('threads.com') || url.includes('threads.net');
    const isFacebook = url.includes('facebook.com') || url.includes('fb.watch');

    // LinkedIn embed URLs don't need scraping — the frontend renders them as an iframe widget
    if (isLinkedIn && url.includes('/embed/')) {
      return { url, type: 'linkedin' };
    }

    // Meta platforms (Threads, Facebook) return full OG tags for their own crawler UA.
    // LinkedIn works best with a standard browser UA.
    const userAgent =
      isThreads || isFacebook
        ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 10000,
        maxRedirects: 5,
      });

      const $ = cheerio.load(html);
      const metadata: any = {
        url,
        title:
          $('meta[property="og:title"]').attr('content') ||
          $('meta[name="title"]').attr('content') ||
          $('title').text(),
        description:
          $('meta[property="og:description"]').attr('content') ||
          $('meta[name="description"]').attr('content'),
        image: $('meta[property="og:image"]').attr('content'),
        siteName: $('meta[property="og:site_name"]').attr('content'),
        authorName: $('meta[name="author"]').attr('content'),
        type: 'generic',
      };

      // LinkedIn
      if (isLinkedIn) {
        metadata.type = 'linkedin';
        const ogTitle = metadata.title || '';
        if (ogTitle.includes(' on LinkedIn:')) {
          const parts = ogTitle.split(' on LinkedIn:');
          metadata.authorName = parts[0].trim();
          metadata.description = parts[1].trim() || metadata.description;
        }
      }

      // Threads — extract @username from URL path
      if (isThreads) {
        metadata.type = 'threads';
        const threadMatch = url.match(/threads\.(?:com|net)\/@([\w.]+)/);
        if (threadMatch) {
          metadata.authorHandle = `@${threadMatch[1]}`;
          if (!metadata.authorName) metadata.authorName = `@${threadMatch[1]}`;
        }
        // Threads og:title can be "username on Threads: caption" or just the caption
        const ogTitle = metadata.title || '';
        if (ogTitle.includes(' on Threads:')) {
          const parts = ogTitle.split(' on Threads:');
          if (!metadata.authorName) metadata.authorName = parts[0].trim();
          metadata.description = parts[1]?.trim() || metadata.description;
        } else if (!metadata.description && ogTitle) {
          metadata.description = ogTitle;
        }
        // og:description on Threads is often just the caption too — prefer it
        const ogDesc = $('meta[property="og:description"]').attr('content');
        if (ogDesc && ogDesc.length > (metadata.description?.length || 0)) {
          metadata.description = ogDesc;
        }
      }

      // Facebook
      if (isFacebook) {
        metadata.type = 'facebook';
        const ogTitle = metadata.title || '';
        // Facebook og:title format: "Name: post text" or just the page name
        if (ogTitle.includes(':')) {
          const parts = ogTitle.split(':');
          metadata.authorName = parts[0].trim();
          metadata.description =
            parts.slice(1).join(':').trim() || metadata.description;
        }
        if (!metadata.authorName) {
          metadata.authorName =
            $('meta[property="og:site_name"]').attr('content') || 'Facebook';
        }
      }

      return metadata;
    } catch (err: any) {
      console.error(
        `[CRMService] fetchLinkMetadata failed for ${url}:`,
        err.message,
      );
      // Return platform type even on error so frontend can show a fallback card
      const type = isLinkedIn
        ? 'linkedin'
        : isThreads
          ? 'threads'
          : isFacebook
            ? 'facebook'
            : 'generic';
      return { url, type, error: 'Could not fetch metadata' };
    }
  }

  /** CEO dashboard: pipeline breakdown + per-rep lead creation and outreach sends. */
  async getExecutiveCrmPulse(periodDays: number) {
    const days = Math.min(Math.max(Number(periodDays) || 30, 1), 365);
    const periodStart = new Date();
    periodStart.setUTCDate(periodStart.getUTCDate() - days);
    periodStart.setUTCHours(0, 0, 0, 0);

    const [leadStages, leadsByUser, emailsByUser, outreachByDay] =
      await Promise.all([
      this.leadModel
        .aggregate([
          { $match: { converted: { $ne: true } } },
          { $group: { _id: '$stage', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .exec(),
      this.leadModel
        .aggregate([
          { $match: { createdAt: { $gte: periodStart } } },
          { $group: { _id: '$createdBy', leadsAdded: { $sum: 1 } } },
          { $sort: { leadsAdded: -1 } },
          { $limit: 30 },
        ])
        .exec(),
      this.trackingModel
        .aggregate([
          { $match: { createdAt: { $gte: periodStart }, userId: { $ne: null } } },
          { $group: { _id: '$userId', emailsSent: { $sum: 1 } } },
          { $sort: { emailsSent: -1 } },
          { $limit: 30 },
        ])
        .exec(),
      this.trackingModel
        .aggregate([
          { $match: { createdAt: { $gte: periodStart }, userId: { $ne: null } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
    ]);

    const userIds = new Set<string>();
    for (const row of leadsByUser) {
      if (row._id) userIds.add(String(row._id));
    }
    for (const row of emailsByUser) {
      if (row._id) userIds.add(String(row._id));
    }

    const users = userIds.size
      ? await this.hrmsUserModel
          .find({ _id: { $in: [...userIds] } })
          .select('firstName lastName email')
          .lean()
          .exec()
      : [];
    const userNameById = new Map<string, string>();
    for (const u of users) {
      const id = String((u as any)._id);
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
      userNameById.set(id, name || u.email || 'Unknown');
    }

    const leadsMap = new Map(
      leadsByUser.map((r) => [String(r._id || ''), Number(r.leadsAdded || 0)]),
    );
    const emailsMap = new Map(
      emailsByUser.map((r) => [String(r._id || ''), Number(r.emailsSent || 0)]),
    );
    const repIds = new Set([...leadsMap.keys(), ...emailsMap.keys()].filter(Boolean));

    const salesRepActivity = [...repIds]
      .map((userId) => ({
        userId,
        name: userNameById.get(userId) || 'Unknown',
        leadsAdded: leadsMap.get(userId) || 0,
        emailsSent: emailsMap.get(userId) || 0,
      }))
      .sort(
        (a, b) =>
          b.leadsAdded + b.emailsSent - (a.leadsAdded + a.emailsSent) ||
          a.name.localeCompare(b.name),
      );

    return {
      leadStatus: leadStages.map((r) => ({
        stage: String(r._id || 'Unknown'),
        count: Number(r.count || 0),
      })),
      outreachByDay: outreachByDay.map((r) => ({
        date: String(r._id || ''),
        count: Number(r.count || 0),
      })),
      salesRepActivity,
    };
  }
}

