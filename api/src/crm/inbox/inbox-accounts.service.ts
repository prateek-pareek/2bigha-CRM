import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InboxOAuthService, resolveMicrosoftSignInName } from './inbox-oauth.service';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PassThrough, Readable } from 'stream';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../../storage/storage.service';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import { InboxEmail, InboxEmailDocument } from '../schemas/inbox-email.schema';
import { InboxRule, InboxRuleDocument } from '../schemas/inbox-rules.schema';
import { Email, EmailDocument } from '../schemas/email.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import { Upload, UploadDocument } from '../../storage/schemas/upload.schema';

import { EmailTrackingService } from '../email/email-tracking.service';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import {
  appendCrmEmailComplianceFooter,
  appendCrmEmailComplianceTextPlain,
  buildListUnsubscribeHeaders,
  htmlToPlainTextBasic,
  resolveCrmListUnsubscribeMailbox,
} from '../shared/crm-email-compliance.util';
import {
  computeWarmupDailyCap,
  normalizeDeliverabilityConfig,
} from '../shared/crm-deliverability.util';
import { validateHumanOutreachForSend } from '../shared/crm-human-outreach.util';
import { isPermanentRecipientFailure } from '../shared/crm-undeliverable.util';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  CrmGlobalSettings,
  CrmGlobalSettingsDocument,
} from '../schemas/crm-global-settings.schema';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmailService } from '../../notifications/email.service';
import * as nodemailer from 'nodemailer';
import {
  buildSmtpTransportOptions,
  formatSmtpAuthError,
  smtpVerificationAttempts,
  type SmtpAuthConfig,
} from '../shared/smtp-transport.util';
import { SalesAgentTriggerService } from '../sales-agent/sales-agent-cron.service';
import { MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES } from '../shared/microsoft-graph-mail.constants';
import { TeamsIntegrationService } from '../integrations/teams-integration.service';
import { CrmAiService } from '../ai/crm-ai.service';
import { InboxClassificationService } from './inbox-classification.service';
import { WorkflowsService } from '../automation/workflows.service';
import { hasCrmAdminFromDbUser } from '../shared/crm-admin-access.util';

export type SyncInboxResult = {
  synced: number;
  lockSkipped: boolean;
};
import { OptionalRedisService } from '../../redis/optional-redis.service';
import { InboxPushService } from './inbox-push.service';

const PROVIDER_CONFIGS: Record<
  string,
  { imap: { host: string; port: number }; smtp: { host: string; port: number } }
> = {
  gmail: {
    imap: { host: 'imap.gmail.com', port: 993 },
    smtp: { host: 'smtp.gmail.com', port: 587 },
  },
  /** Microsoft 365, work/school, and regional tenants (incl. India) — same worldwide endpoints */
  outlook: {
    imap: { host: 'outlook.office365.com', port: 993 },
    smtp: { host: 'smtp.office365.com', port: 587 },
  },
  /** @outlook.com, @hotmail.com, @live.com — consumer IMAP/SMTP (manual; use OAuth on “Microsoft 365” if that works for you) */
  outlook_personal: {
    imap: { host: 'imap-mail.outlook.com', port: 993 },
    smtp: { host: 'smtp-mail.outlook.com', port: 587 },
  },
  yahoo: {
    imap: { host: 'imap.mail.yahoo.com', port: 993 },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587 },
  },
  /** Zoho Mail — global (.com); EU tenants often use imap.zoho.eu / smtp.zoho.eu (pick Custom). */
  zoho: {
    imap: { host: 'imap.zoho.com', port: 993 },
    smtp: { host: 'smtp.zoho.com', port: 587 },
  },
  zoho_eu: {
    imap: { host: 'imap.zoho.eu', port: 993 },
    smtp: { host: 'smtp.zoho.eu', port: 587 },
  },
  /** Zoho Mail — India data center (.in) */
  zoho_in: {
    imap: { host: 'imap.zoho.in', port: 993 },
    smtp: { host: 'smtp.zoho.in', port: 465 },
  },
  /** GoDaddy Workspace / legacy cPanel email on secureserver.net */
  godaddy: {
    imap: { host: 'imap.secureserver.net', port: 993 },
    smtp: { host: 'smtpout.secureserver.net', port: 465 },
  },
  /** Hostinger Email (hPanel manual config: IMAP 993, SMTP 465 SSL) */
  hostinger: {
    imap: { host: 'imap.hostinger.com', port: 993 },
    smtp: { host: 'smtp.hostinger.com', port: 465 },
  },
  /** IONOS / 1&1 mail */
  ionos: {
    imap: { host: 'imap.ionos.com', port: 993 },
    smtp: { host: 'smtp.ionos.com', port: 465 },
  },
  other: { imap: { host: '', port: 993 }, smtp: { host: '', port: 587 } },
};

/** IMAP folder names per type (provider-specific); includes Graph well-known folder ids for Outlook OAuth. */
const FOLDER_NAMES: Record<string, string[]> = {
  inbox: ['INBOX', 'Inbox', 'inbox'],
  sent: [
    'Sent',
    'Sent Mail',
    'Sent Items',
    'Sent Messages',
    '[Gmail]/Sent Mail',
    '[Google Mail]/Sent Mail',
    'sentitems',
  ],
  drafts: [
    'Drafts',
    'Draft',
    '[Gmail]/Drafts',
    '[Google Mail]/Drafts',
    'drafts',
  ],
  trash: [
    'Trash',
    'Deleted Items',
    'Deleted',
    '[Gmail]/Trash',
    '[Google Mail]/Trash',
    'deleteditems',
  ],
  spam: [
    'Spam',
    'Junk',
    'Junk E-mail',
    'Junk Email',
    'Bulk Mail',
    '[Gmail]/Spam',
    '[Google Mail]/Spam',
    'junkemail',
  ],
};

@Injectable()
export class InboxAccountsService {
  private readonly logger = new Logger(InboxAccountsService.name);

  /** Short-lived in-memory cache so thumb + Open share one provider download. */
  private readonly attachmentByteCache = new Map<
    string,
    { buf: Buffer; filename: string; contentType: string; expiresAt: number }
  >();
  private readonly attachmentByteInflight = new Map<string, Promise<Buffer>>();
  private readonly attachmentCacheTtlMs = 5 * 60_000;
  private readonly attachmentCacheMaxEntries = 40;

  constructor(
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private accountModel: Model<UserEmailAccountDocument>,
    @InjectModel(InboxEmail.name, 'crmConnection')
    private inboxEmailModel: Model<InboxEmailDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(CrmGlobalSettings.name, 'crmConnection')
    private globalSettingsModel: Model<CrmGlobalSettingsDocument>,
    @InjectModel(Email.name, 'crmConnection')
    private emailModel: Model<EmailDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private userModel: Model<CRMUserDocument>,
    @InjectModel(InboxRule.name, 'crmConnection')
    private inboxRuleModel: Model<InboxRuleDocument>,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private teamsIntegrationService: TeamsIntegrationService,
    @Inject(forwardRef(() => CrmAiService))
    private crmAiService: CrmAiService,

    @Inject(forwardRef(() => EmailTrackingService))
    private emailTrackingService: EmailTrackingService,
    private config: ConfigService,
    private classificationService: InboxClassificationService,
    @Inject(forwardRef(() => InboxOAuthService))
    private oauthService: InboxOAuthService,
    @Inject(forwardRef(() => WorkflowsService))
    private workflowsService: WorkflowsService,
    @Inject(forwardRef(() => SalesAgentTriggerService))
    private salesAgentTrigger: SalesAgentTriggerService,
    @InjectModel(Upload.name)
    private uploadModel: Model<UploadDocument>,
    private readonly redis: OptionalRedisService,
    @Inject(forwardRef(() => InboxPushService))
    private readonly inboxPushService: InboxPushService,
  ) {}

  /** In-process sync lock backup when Redis is unavailable. */
  private readonly localSyncLocks = new Map<string, number>();
  private readonly oauthRefreshInflight = new Map<string, Promise<string>>();

  private async assertSendWithinDeliverabilityLimits(
    accountId: string,
  ): Promise<void> {
    const account = await this.accountModel
      .findById(new Types.ObjectId(accountId))
      .select('sendLimitOverride createdAt')
      .lean()
      .exec();
    const settingsDoc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('emailDeliverability')
      .lean()
      .exec();
    const cfg = normalizeDeliverabilityConfig(
      settingsDoc?.emailDeliverability as any,
    );
    if (!cfg.enforceSendLimits) return;

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const accountObjectId = new Types.ObjectId(accountId);
    const [hourCount, dayCount] = await Promise.all([
      this.emailTrackingService.countByAccountSince(accountObjectId, hourAgo),
      this.emailTrackingService.countByAccountSince(accountObjectId, dayAgo),
    ]);

    const maxPerHourGlobal = Math.max(1, cfg.maxEmailsPerHourPerAccount);
    const maxPerDayConfigured = Math.max(
      maxPerHourGlobal,
      cfg.maxEmailsPerDayPerAccount,
    );
    const warmup = computeWarmupDailyCap(
      (account as { createdAt?: Date })?.createdAt,
      maxPerDayConfigured,
      cfg.enableWarmupRamp,
    );
    const maxPerDayGlobal = warmup.effectiveMaxPerDay;
    const overrideEnabled = account?.sendLimitOverride?.enabled === true;
    const maxPerHour = overrideEnabled
      ? Math.max(
        1,
        Number(
          account?.sendLimitOverride?.maxEmailsPerHour ?? maxPerHourGlobal,
        ),
      )
      : maxPerHourGlobal;
    const maxPerDay = overrideEnabled
      ? Math.max(
        maxPerHour,
        Math.min(
          Number(account?.sendLimitOverride?.maxEmailsPerDay ?? maxPerDayGlobal),
          maxPerDayGlobal,
        ),
      )
      : maxPerDayGlobal;
    if (hourCount >= maxPerHour) {
      throw new BadRequestException(
        `Hourly send limit reached for this inbox account (${maxPerHour}/hour). Try again later.`,
      );
    }
    if (dayCount >= maxPerDay) {
      const warmupHint = warmup.warmupActive
        ? ` Warmup day ${warmup.warmupDay + 1}: cap is ${maxPerDay}/day until ramp completes.`
        : '';
      throw new BadRequestException(
        `Daily send limit reached for this inbox account (${maxPerDay}/day). Try again tomorrow.${warmupHint}`,
      );
    }
  }

  /** Public wrapper for unsubscribe / inbound opt-out (checklist: bounce-handling, list-cleaning). */
  async suppressRecipientEmail(email: string, reason: string): Promise<number> {
    return this.markEmailInvalidAcrossRecords(email, reason);
  }

  async checkRecipientSuppression(
    emails: string[],
  ): Promise<{ suppressed: string[] }> {
    const out: string[] = [];
    for (const raw of emails) {
      const e = String(raw || '').trim();
      if (!e.includes('@')) continue;
      if (await this.isSuppressedRecipientEmail(e)) out.push(e);
    }
    return { suppressed: [...new Set(out.map((x) => x.toLowerCase()))] };
  }

  private getMicrosoftClientId(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_MICROSOFT_CLIENT_ID') ||
      this.config.get<string>('MICROSOFT_CLIENT_ID')
    );
  }

  private getMicrosoftClientSecret(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_MICROSOFT_CLIENT_SECRET') ||
      this.config.get<string>('MICROSOFT_CLIENT_SECRET')
    );
  }

  private getGoogleClientId(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_GOOGLE_CLIENT_ID') ||
      this.config.get<string>('GOOGLE_CLIENT_ID')
    );
  }

  private getGoogleClientSecret(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_GOOGLE_CLIENT_SECRET') ||
      this.config.get<string>('GOOGLE_CLIENT_SECRET')
    );
  }

  /** Primary IMAP/Graph folder path used when manually syncing a folder type. */
  resolveSyncFolderPath(
    folderType: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam',
  ): string {
    const names = FOLDER_NAMES[folderType];
    if (!names?.length) return 'INBOX';
    if (folderType === 'inbox') return 'INBOX';
    return names[0];
  }

  private syncErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err ?? 'Unknown sync error');
  }

  private async recordSyncFailure(
    accountId: Types.ObjectId | string,
    err: unknown,
  ): Promise<string> {
    const msg = this.syncErrorMessage(err).slice(0, 2000);
    const now = new Date();
    await this.accountModel.updateOne(
      { _id: new Types.ObjectId(String(accountId)) },
      {
        $set: {
          'syncState.lastSyncAttemptAt': now,
          'syncState.lastError': msg,
          'syncState.lastErrorAt': now,
        },
        $inc: { 'syncState.consecutiveFailures': 1 },
      },
    );
    return msg;
  }

  private async verifySmtpCredentials(
    config: SmtpAuthConfig,
    provider?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const transporter = nodemailer.createTransport(
      buildSmtpTransportOptions(config),
    );
    try {
      await transporter.verify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatSmtpAuthError(e, provider) };
    } finally {
      transporter.close();
    }
  }

  /** Tries primary SMTP settings; for Hostinger, retries port 587 if 465 auth fails. */
  private async verifySmtpWithFallback(
    provider: string,
    config: SmtpAuthConfig,
  ): Promise<SmtpAuthConfig | { error: string }> {
    const attempts = smtpVerificationAttempts(provider, config);
    let lastError = 'SMTP verification failed';
    for (const attempt of attempts) {
      const result = await this.verifySmtpCredentials(attempt, provider);
      if (result.ok) return attempt;
      lastError = result.error;
    }
    return { error: lastError };
  }

  async testAccountSmtp(
    userId: string,
    accountId: string,
    userEmail?: string,
  ): Promise<{ success: boolean; message: string; smtpPort?: number; smtpSecure?: boolean }> {
    const account = await this.accountModel.findById(accountId).exec();
    if (!account) throw new NotFoundException('Email account not found');
    if (!(await this.canManageMailbox(userId, account, userEmail))) {
      throw new ForbiddenException('Not allowed to test this mailbox');
    }
    if (account.authType === 'oauth') {
      return {
        success: true,
        message: 'OAuth accounts send via provider API; SMTP password test is not required.',
      };
    }
    if (!account.smtpPassword?.trim()) {
      throw new BadRequestException(
        'No SMTP password stored. Edit the account and enter your mailbox password.',
      );
    }
    const verified = await this.verifySmtpWithFallback(account.provider, {
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      smtpUser: account.smtpUser || account.email,
      smtpPassword: account.smtpPassword,
    });
    if ('error' in verified) {
      return { success: false, message: verified.error };
    }
    if (
      verified.smtpPort !== account.smtpPort ||
      verified.smtpSecure !== account.smtpSecure
    ) {
      account.smtpPort = verified.smtpPort;
      account.smtpSecure = verified.smtpSecure === true;
      await account.save();
      return {
        success: true,
        message: `SMTP OK. Saved working settings: port ${verified.smtpPort}${verified.smtpSecure ? ' (SSL)' : ' (STARTTLS)'}.`,
        smtpPort: verified.smtpPort,
        smtpSecure: verified.smtpSecure,
      };
    }
    return { success: true, message: 'SMTP login successful.' };
  }

  private syncLockKey(accountId: string): string {
    return `crm:inbox:sync:lock:${accountId}`;
  }

  private async acquireAccountSyncLock(
    accountId: string,
    ttlSeconds = 180,
  ): Promise<boolean> {
    const now = Date.now();
    const localUntil = this.localSyncLocks.get(accountId) || 0;
    if (localUntil > now) return false;

    const redisOk = await this.redis.tryAcquireLock(
      this.syncLockKey(accountId),
      ttlSeconds,
    );
    if (!redisOk) return false;

    this.localSyncLocks.set(accountId, now + ttlSeconds * 1000);
    return true;
  }

  private async releaseAccountSyncLock(accountId: string): Promise<void> {
    this.localSyncLocks.delete(accountId);
    await this.redis.releaseLock(this.syncLockKey(accountId));
  }

  /** Shared mailbox ACL filter (owner, shared, accessible, HRMS/CRM ID fallback). */
  private async resolveMailboxAccessFilter(
    userId: string,
    userEmail?: string,
  ): Promise<{
    isAdmin: boolean;
    ownerOrSharedFilter: Record<string, unknown>[];
    resolvedUserId: Types.ObjectId;
  }> {
    const uId = new Types.ObjectId(userId);
    const isAdmin = await this.isAdminUser(userId, userEmail);
    if (isAdmin) {
      return { isAdmin: true, ownerOrSharedFilter: [{}], resolvedUserId: uId };
    }

    let user = await this.userModel.findById(uId).lean().exec();
    if (!user && userEmail) {
      user = await this.userModel.findOne({ email: userEmail }).lean().exec();
    }

    const allowedAccountIds = (user?.accessibleEmailAccounts || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const resolvedUserId = user?._id
      ? new Types.ObjectId(user._id.toString())
      : uId;

    const ownerOrSharedFilter: Record<string, unknown>[] = [
      { userId: uId },
      { sharedWithUserIds: uId },
    ];

    if (resolvedUserId.toString() !== uId.toString()) {
      ownerOrSharedFilter.push({ userId: resolvedUserId });
      ownerOrSharedFilter.push({ sharedWithUserIds: resolvedUserId });
    }

    if (allowedAccountIds.length > 0) {
      ownerOrSharedFilter.push({ _id: { $in: allowedAccountIds } });
    }

    return { isAdmin: false, ownerOrSharedFilter, resolvedUserId };
  }

  /** Preserve CRM linkage and attachments when re-syncing from provider. */
  private mergeSyncMeta(
    existing: Record<string, unknown> | undefined,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(existing || {}) };
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'attachments') {
        if (Array.isArray(val) && val.length > 0) out.attachments = val;
      } else if (val !== undefined) {
        out[key] = val;
      }
    }
    return out;
  }

  private classificationFieldsFromResult(
    classification: {
      category: string;
      score: number;
      confidence: number;
      version: number;
      reasons: string[];
    },
    existing?: { categoryOverride?: string | null } | null,
  ): Record<string, unknown> {
    if (existing?.categoryOverride) return {};
    return {
      category: classification.category,
      score: classification.score,
      confidence: classification.confidence,
      classificationVersion: classification.version,
      classificationReasons: classification.reasons,
    };
  }

  private async handleImapUidValidityChange(
    account: UserEmailAccountDocument,
    folder: string,
    uidValidity: number,
  ): Promise<void> {
    const prev = (account.syncState as any)?.imapUidValidity?.[folder] as
      | number
      | undefined;
    if (prev && prev !== uidValidity) {
      this.logger.warn(
        `IMAP UIDVALIDITY changed for ${account.email} folder ${folder} (${prev} → ${uidValidity}); clearing stale messages`,
      );
      await this.inboxEmailModel.deleteMany({
        accountId: account._id,
        folder,
        $or: [
          { 'meta.uidValidity': prev },
          { 'meta.uidValidity': { $exists: false } },
        ],
      });
    }
    account.syncState = {
      ...(account.syncState || {}),
      imapUidValidity: {
        ...(((account.syncState as any)?.imapUidValidity as Record<
          string,
          number
        >) || {}),
        [folder]: uidValidity,
      },
    } as typeof account.syncState;
  }

  private markAccountSyncSuccess(
    account: UserEmailAccountDocument,
    syncedCount: number,
  ) {
    const idleStreak =
      syncedCount > 0 ? 0 : Number(account.syncState?.consecutiveIdleSyncs || 0) + 1;
    const nextBaseMs =
      syncedCount > 0
        ? 20_000
        : Math.min(5 * 60_000, 60_000 + idleStreak * 30_000);
    account.syncState = {
      ...(account.syncState || {}),
      lastSyncAttemptAt: new Date(),
      lastSyncSuccessAt: new Date(),
      nextAllowedSyncAt: new Date(Date.now() + nextBaseMs),
      consecutiveFailures: 0,
      consecutiveIdleSyncs: idleStreak,
      lastSyncResultCount: syncedCount,
      lastError: '',
    };
  }

  async createAccount(
    userId: string,
    dto: {
      email: string;
      provider: string;
      displayName?: string;
      password: string;
      imapHost?: string;
      imapPort?: number;
      smtpHost?: string;
      smtpPort?: number;
      outreachType?: 'agency' | 'freelancer' | 'both' | null;
    },
  ): Promise<UserEmailAccount> {
    if (!dto.password?.trim()) {
      throw new BadRequestException(
        'Password is required for this connection method',
      );
    }
    const provider = dto.provider.toLowerCase();
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.other;

    const imapHost = dto.imapHost || config.imap.host;
    const imapPort = dto.imapPort ?? config.imap.port;
    const smtpHost = dto.smtpHost || config.smtp.host;
    let smtpPort = dto.smtpPort ?? config.smtp.port;
    const email = dto.email.trim().toLowerCase();

    const verified = await this.verifySmtpWithFallback(provider, {
      smtpHost,
      smtpPort,
      smtpUser: email,
      smtpPassword: dto.password,
    });
    if ('error' in verified) {
      throw new BadRequestException(verified.error);
    }
    smtpPort = verified.smtpPort;
    const smtpSecure = verified.smtpSecure === true;

    const existingAccount = await this.accountModel.findOne({
      userId: new Types.ObjectId(userId),
      email: this.emailExactMatchFilter(email),
    });

    if (existingAccount && existingAccount.isActive !== false) {
      throw new BadRequestException(
        `Email account ${email} is already configured for this user.`,
      );
    }

    if (existingAccount && existingAccount.isActive === false) {
      existingAccount.provider = provider;
      existingAccount.displayName = dto.displayName || existingAccount.displayName || email;
      existingAccount.imapHost = imapHost;
      existingAccount.imapPort = imapPort;
      existingAccount.imapSecure = true;
      existingAccount.imapUser = email;
      existingAccount.imapPassword = dto.password;
      existingAccount.smtpHost = verified.smtpHost || smtpHost;
      existingAccount.smtpPort = smtpPort;
      existingAccount.smtpSecure = smtpSecure;
      existingAccount.smtpUser = email;
      existingAccount.smtpPassword = dto.password;
      existingAccount.authType = 'password';
      existingAccount.oauthRefreshToken = '';
      existingAccount.oauthAccessToken = '';
      existingAccount.oauthAccessTokenExpiresAt = undefined;
      existingAccount.microsoftGraphMail = false;
      existingAccount.isActive = true;
      existingAccount.preferImapIdle = true;
      if (dto.outreachType === 'agency' || dto.outreachType === 'freelancer' || dto.outreachType === 'both') {
        existingAccount.outreachType = dto.outreachType;
      }
      const activeCount = await this.accountModel.countDocuments({
        userId: new Types.ObjectId(userId),
        isActive: true,
        _id: { $ne: existingAccount._id },
      });
      if (activeCount === 0) existingAccount.isDefault = true;
      this.logger.log(
        `Revived disconnected mailbox ${email} (${existingAccount._id}) — preserving synced conversation history`,
      );
      return existingAccount.save();
    }

    const account = new this.accountModel({
      userId: new Types.ObjectId(userId),
      email,
      provider,
      displayName: dto.displayName || email,
      imapHost,
      imapPort,
      imapSecure: true,
      imapUser: email,
      imapPassword: dto.password,
      smtpHost: verified.smtpHost || smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser: email,
      smtpPassword: dto.password,
      authType: 'password',
      isActive: true,
      isDefault: false,
      preferImapIdle: true,
    });
    if (dto.outreachType === 'agency' || dto.outreachType === 'freelancer' || dto.outreachType === 'both') {
      account.outreachType = dto.outreachType;
    }

    const existing = await this.accountModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });
    if (existing === 0) account.isDefault = true;

    return account.save();
  }

  async createOAuthAccount(
    userId: string,
    data: {
      email: string;
      provider: 'gmail' | 'outlook';
      displayName?: string;
      refreshToken: string;
      accessToken: string;
      accessTokenExpiresAt: Date;
      /** Outlook: Graph API mail (no SMTP / IMAP); required for tenants with SMTP AUTH disabled */
      microsoftGraphMail?: boolean;
    },
  ): Promise<UserEmailAccount> {
    const provider = data.provider;
    const cfg = PROVIDER_CONFIGS[provider];

    const email = String(data.email || '').trim().toLowerCase();
    const existingAccount = await this.accountModel.findOne({
      userId: new Types.ObjectId(userId),
      email: this.emailExactMatchFilter(email),
    });
    if (existingAccount && existingAccount.isActive !== false) {
      throw new BadRequestException(
        `Email account ${email} is already connected.`,
      );
    }

    if (existingAccount && existingAccount.isActive === false) {
      existingAccount.provider = provider;
      existingAccount.displayName =
        data.displayName || existingAccount.displayName || email;
      existingAccount.imapHost = cfg.imap.host;
      existingAccount.imapPort = cfg.imap.port;
      existingAccount.imapSecure = true;
      existingAccount.imapUser = email;
      existingAccount.imapPassword = '';
      existingAccount.smtpHost = cfg.smtp.host;
      existingAccount.smtpPort = cfg.smtp.port;
      existingAccount.smtpSecure = cfg.smtp.port === 465;
      existingAccount.smtpUser = email;
      existingAccount.smtpPassword = '';
      existingAccount.authType = 'oauth';
      existingAccount.oauthRefreshToken = data.refreshToken;
      existingAccount.oauthAccessToken = data.accessToken;
      existingAccount.oauthAccessTokenExpiresAt = data.accessTokenExpiresAt;
      existingAccount.microsoftGraphMail =
        data.provider === 'outlook' && data.microsoftGraphMail === true;
      existingAccount.isActive = true;
      existingAccount.preferImapIdle = true;
      const activeCount = await this.accountModel.countDocuments({
        userId: new Types.ObjectId(userId),
        isActive: true,
        _id: { $ne: existingAccount._id },
      });
      if (activeCount === 0) existingAccount.isDefault = true;
      this.logger.log(
        `Revived disconnected OAuth mailbox ${email} (${existingAccount._id}) — preserving synced conversation history`,
      );
      return existingAccount.save();
    }

    const account = new this.accountModel({
      userId: new Types.ObjectId(userId),
      email,
      provider,
      displayName: data.displayName || email,
      imapHost: cfg.imap.host,
      imapPort: cfg.imap.port,
      imapSecure: true,
      imapUser: email,
      imapPassword: '',
      smtpHost: cfg.smtp.host,
      smtpPort: cfg.smtp.port,
      smtpSecure: cfg.smtp.port === 465,
      smtpUser: email,
      smtpPassword: '',
      authType: 'oauth',
      oauthRefreshToken: data.refreshToken,
      oauthAccessToken: data.accessToken,
      oauthAccessTokenExpiresAt: data.accessTokenExpiresAt,
      microsoftGraphMail:
        data.provider === 'outlook' && data.microsoftGraphMail === true,
      isActive: true,
      isDefault: false,
      preferImapIdle: true,
    });

    const existing = await this.accountModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });
    if (existing === 0) account.isDefault = true;

    return account.save();
  }

  async syncAccountDisplayName(userId: string, accountId: string): Promise<{ displayName: string }> {
    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Email account not found');
    if (account.authType !== 'oauth') {
      throw new BadRequestException('Only OAuth accounts can be synced automatically');
    }

    const accessToken = await this.getValidOAuthAccessToken(account);
    let name: string | undefined;

    if (account.provider === 'gmail') {
      const profile = await this.oauthService.fetchGoogleProfile(accessToken);
      name = profile.name;
    } else if (account.provider === 'outlook') {
      // For Microsoft, we might have an id_token stored or we might need to fetch /me
      // If we don't have id_token, we can try to resolve from accessToken or fetch from Graph
      name = resolveMicrosoftSignInName(accessToken);
      if (!name) {
        try {
          const res = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const json = await res.json() as { displayName?: string };
          name = json.displayName;
        } catch (e) {
          this.logger.warn(`Failed to fetch Microsoft profile name: ${e.message}`);
        }
      }
    }

    if (!name) {
      throw new BadRequestException('Could not retrieve name from provider');
    }

    account.displayName = name;
    await account.save();
    return { displayName: name };
  }

  /** Map IMAP-style or Graph folder names to Graph well-known folder id */
  private normalizeGraphFolderId(folder: string): string {
    const f = folder.trim();
    const lower = f.toLowerCase();
    if (f.toUpperCase() === 'INBOX' || lower === 'inbox') return 'inbox';
    if (
      [
        'sentitems',
        'sent',
        'sent items',
        'sent mail',
        'sent messages',
      ].includes(lower)
    )
      return 'sentitems';
    if (['drafts', 'draft'].includes(lower)) return 'drafts';
    if (['deleteditems', 'trash', 'deleted items', 'deleted'].includes(lower))
      return 'deleteditems';
    if (
      ['junkemail', 'junk', 'junk e-mail', 'spam', 'bulk mail'].includes(lower)
    )
      return 'junkemail';
    return lower;
  }

  /** Whether an OAuth mailbox can obtain or refresh an API access token. */
  accountHasOAuthCredentials(account: UserEmailAccount): boolean {
    if (account.authType !== 'oauth') return false;
    if (String(account.oauthRefreshToken || '').trim()) return true;
    const bufferMs = 120_000;
    return !!(
      account.oauthAccessToken &&
      account.oauthAccessTokenExpiresAt &&
      account.oauthAccessTokenExpiresAt.getTime() > Date.now() + bufferMs
    );
  }

  /**
   * OAuth Gmail/Outlook accounts the user may sync calendar from (credentials loaded).
   * Uses at most one account per provider; prefers the user's own mailbox over shared/admin-visible accounts.
   */
  async findCalendarOAuthAccountsForUser(
    userId: string,
    userEmail?: string,
  ): Promise<UserEmailAccountDocument[]> {
    const listed = await this.findAccountsByUser(userId, userEmail);
    const candidates = listed.filter(
      (a) =>
        a.isActive !== false &&
        a.authType === 'oauth' &&
        ['gmail', 'outlook'].includes(String(a.provider || '').toLowerCase()),
    );

    const uId = String(userId);
    const emailLower = String(userEmail || '').trim().toLowerCase();
    const sorted = [...candidates].sort((a, b) => {
      const score = (acc: UserEmailAccount) => {
        let s = 0;
        if (String((acc as { userId?: { toString(): string } }).userId) === uId) {
          s -= 4;
        }
        if (emailLower && String(acc.email || '').toLowerCase() === emailLower) {
          s -= 2;
        }
        if (acc.isDefault) s -= 1;
        return s;
      };
      return score(a) - score(b);
    });

    const seenProviders = new Set<string>();
    const loaded: UserEmailAccountDocument[] = [];

    for (const acc of sorted) {
      const provider = String(acc.provider || '').toLowerCase();
      if (seenProviders.has(provider)) continue;

      const full = await this.getAccountWithCredentials(
        userId,
        String((acc as { _id?: { toString(): string } })._id),
        userEmail,
      );
      if (!full || !this.accountHasOAuthCredentials(full)) continue;

      seenProviders.add(provider);
      loaded.push(full);
    }

    return loaded;
  }

  async getValidOAuthAccessToken(
    account: UserEmailAccountDocument,
  ): Promise<string> {
    if (account.authType !== 'oauth') {
      throw new Error('Not an OAuth account');
    }
    const bufferMs = 120_000;
    if (
      account.oauthAccessToken &&
      account.oauthAccessTokenExpiresAt &&
      account.oauthAccessTokenExpiresAt.getTime() > Date.now() + bufferMs
    ) {
      return account.oauthAccessToken;
    }
    if (!account.oauthRefreshToken) {
      throw new Error('Missing refresh token; reconnect the email account');
    }

    const accountId = String(account._id);
    let inflight = this.oauthRefreshInflight.get(accountId);
    if (!inflight) {
      inflight = this.performOAuthTokenRefresh(accountId).finally(() => {
        this.oauthRefreshInflight.delete(accountId);
      });
      this.oauthRefreshInflight.set(accountId, inflight);
    }
    return inflight;
  }

  private async performOAuthTokenRefresh(accountId: string): Promise<string> {
    const account = await this.accountModel.findById(accountId).exec();
    if (!account) throw new Error('Account not found');
    if (account.authType !== 'oauth') {
      throw new Error('Not an OAuth account');
    }

    const bufferMs = 120_000;
    if (
      account.oauthAccessToken &&
      account.oauthAccessTokenExpiresAt &&
      account.oauthAccessTokenExpiresAt.getTime() > Date.now() + bufferMs
    ) {
      return account.oauthAccessToken;
    }
    if (!account.oauthRefreshToken) {
      throw new Error('Missing refresh token; reconnect the email account');
    }

    if (account.provider === 'gmail') {
      const clientId = this.getGoogleClientId();
      const clientSecret = this.getGoogleClientSecret();
      if (!clientId || !clientSecret) {
        throw new Error(
          'Gmail OAuth is not configured on the server (CRM_INBOX_GOOGLE_* or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
        );
      }
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.oauthRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        this.logger.error(
          `Failed to refresh Google token: ${JSON.stringify(json)}`,
        );
        throw new Error(
          'Failed to refresh Gmail access; reconnect your account',
        );
      }
      const accessToken = json.access_token as string;
      const expiresIn = (json.expires_in as number) || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      account.oauthAccessToken = accessToken;
      account.oauthAccessTokenExpiresAt = expiresAt;
      if (json.refresh_token) {
        account.oauthRefreshToken = json.refresh_token as string;
      }
      await account.save();
      return accessToken;
    }

    if (account.provider === 'outlook') {
      const clientId = this.getMicrosoftClientId();
      const clientSecret = this.getMicrosoftClientSecret();
      if (!clientId || !clientSecret) {
        throw new Error('Microsoft OAuth is not configured on the server');
      }
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.oauthRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });
      if (account.microsoftGraphMail) {
        body.set('scope', MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES);
      }
      const res = await fetch(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        this.logger.error(
          `Failed to refresh Microsoft token: ${JSON.stringify(json)}`,
        );
        throw new Error(
          'Failed to refresh Outlook access; reconnect your account',
        );
      }
      const accessToken = json.access_token as string;
      const expiresIn = (json.expires_in as number) || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      account.oauthAccessToken = accessToken;
      account.oauthAccessTokenExpiresAt = expiresAt;
      if (json.refresh_token) {
        account.oauthRefreshToken = json.refresh_token as string;
      }
      await account.save();
      return accessToken;
    }

    throw new Error('OAuth is not supported for this provider');
  }

  private async openImapClient(
    account: UserEmailAccountDocument,
  ): Promise<ImapFlow> {
    let auth: { user: string; pass?: string; accessToken?: string };
    if (account.authType === 'oauth') {
      const accessToken = await this.getValidOAuthAccessToken(account);
      auth = { user: account.imapUser, accessToken };
    } else {
      auth = { user: account.imapUser, pass: account.imapPassword };
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth,
      logger: false,
    });
    client.on('error', (err) => {
      this.logger.error(`IMAP client error for ${account.email}:`, err);
    });
    await client.connect();
    return client;
  }

  /** Only log inbound CRM activities for actual inbox (not Sent / Drafts / etc.). */
  private isInboundFolder(folder: string): boolean {
    const f = folder.trim();
    if (FOLDER_NAMES.inbox.includes(f)) return true;
    return this.normalizeGraphFolderId(f) === 'inbox';
  }

  private isSentFolder(folder: string): boolean {
    const f = folder.trim();
    if (FOLDER_NAMES.sent.some((name) => name.toLowerCase() === f.toLowerCase())) {
      return true;
    }
    return this.normalizeGraphFolderId(f) === 'sentitems';
  }

  resolveSentFolderForAccount(
    account: UserEmailAccountDocument,
  ): string {
    if (
      account.authType === 'oauth' &&
      account.provider === 'outlook' &&
      account.microsoftGraphMail
    ) {
      return 'sentitems';
    }
    if (account.provider === 'gmail') {
      return '[Gmail]/Sent Mail';
    }
    return 'Sent';
  }

  private normalizeRfcMessageId(id?: string): string | undefined {
    if (!id) return undefined;
    const normalized = String(id).replace(/[<>]/g, '').trim();
    return normalized || undefined;
  }

  private htmlBodyToPlain(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Persist a copy of an outbound email in InboxEmail (Sent folder).
   * Provider sync later reconciles local copies via RFC Message-ID or heuristics.
   */
  async saveSentEmailCopy(
    userId: string,
    account: UserEmailAccountDocument,
    data: {
      to: string;
      subject: string;
      bodyHtml: string;
      cc?: string[];
      bcc?: string[];
      module?: string;
      entityId?: string;
      trackingToken?: string;
      replyToInboxEmailId?: string;
      attachments?: Array<{
        filename: string;
        contentType: string;
        content?: Buffer;
        size?: number;
      }>;
      rfcMessageId?: string;
      graphMessageId?: string;
      inReplyTo?: string;
      references?: string;
    },
  ): Promise<string | undefined> {
    try {
      const folder = this.resolveSentFolderForAccount(account);
      const normalizedRfc = this.normalizeRfcMessageId(data.rfcMessageId);
      const localMessageId =
        data.graphMessageId ||
        (normalizedRfc
          ? `crm-local:${normalizedRfc}`
          : `crm-local:${randomBytes(12).toString('hex')}`);
      const toFirst =
        this.normalizeCcList(data.to)[0] || (data.to || '').trim();
      const plain = this.htmlBodyToPlain(data.bodyHtml) || data.subject;
      const attachmentMeta = (data.attachments || []).map((a, idx) => ({
        id: `crm-sent-${idx}`,
        filename: a.filename,
        size: a.size ?? a.content?.length ?? 0,
        contentType: a.contentType || 'application/octet-stream',
      }));
      const sentAt = new Date();
      const filter: Record<string, unknown> = normalizedRfc
        ? {
            accountId: account._id,
            'meta.rfcMessageId': normalizedRfc,
            folder,
          }
        : {
            accountId: account._id,
            messageId: localMessageId,
            folder,
          };

      const saved = await this.inboxEmailModel.findOneAndUpdate(
        filter,
        {
          $set: {
            userId: new Types.ObjectId(userId),
            messageId: data.graphMessageId || localMessageId,
            folder,
            from: account.email,
            fromName: account.displayName || '',
            to: toFirst,
            toName: '',
            subject: data.subject || '(No subject)',
            body: plain,
            bodyHtml: data.bodyHtml,
            date: sentAt,
            isRead: true,
            hasAttachments: attachmentMeta.length > 0,
            category: 'business',
            score: 100,
            confidence: 1,
            classificationVersion: 1,
            classificationReasons: ['crm_outbound_send'],
            meta: {
              crmLocalCopy: !data.graphMessageId,
              direction: 'outbound',
              sentAt,
              ...(normalizedRfc ? { rfcMessageId: normalizedRfc } : {}),
              ...(data.graphMessageId
                ? { graph: true, graphMessageId: data.graphMessageId }
                : {}),
              ...(data.cc?.length ? { cc: data.cc } : {}),
              ...(data.bcc?.length ? { bcc: data.bcc } : {}),
              ...(data.module ? { module: data.module } : {}),
              ...(data.entityId ? { entityId: data.entityId } : {}),
              ...(data.trackingToken ? { trackingToken: data.trackingToken } : {}),
              ...(data.replyToInboxEmailId
                ? { replyToInboxEmailId: data.replyToInboxEmailId }
                : {}),
              ...(data.inReplyTo ? { inReplyTo: data.inReplyTo } : {}),
              ...(data.references ? { references: data.references } : {}),
              ...(attachmentMeta.length ? { attachments: attachmentMeta } : {}),
            },
          },
        },
        { upsert: true, new: true },
      );
      return saved?._id?.toString();
    } catch (e: unknown) {
      this.logger.warn(
        `[saveSentEmailCopy] failed: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  private async reconcileSyncedSentEmail(
    accountId: Types.ObjectId,
    folder: string,
    providerMessageId: string,
    fields: {
      rfcMessageId?: string;
      subject?: string;
      to?: string;
      date?: Date;
    },
  ): Promise<InboxEmailDocument | null> {
    if (!this.isSentFolder(folder)) return null;

    const normalizedRfc = this.normalizeRfcMessageId(fields.rfcMessageId);
    let matched: InboxEmailDocument | null = null;
    if (normalizedRfc) {
      matched = await this.inboxEmailModel.findOneAndUpdate(
        {
          accountId,
          'meta.crmLocalCopy': true,
          'meta.rfcMessageId': normalizedRfc,
        },
        {
          $set: {
            messageId: providerMessageId,
            folder,
            'meta.crmLocalCopy': false,
            ...(normalizedRfc ? { 'meta.rfcMessageId': normalizedRfc } : {}),
          },
        },
        { new: true },
      );
    }

    if (!matched && fields.subject && fields.to) {
      const since = new Date(
        (fields.date || new Date()).getTime() - 3 * 60 * 1000,
      );
      matched = await this.inboxEmailModel.findOneAndUpdate(
        {
          accountId,
          'meta.crmLocalCopy': true,
          subject: fields.subject,
          to: fields.to,
          date: { $gte: since },
        },
        {
          $set: {
            messageId: providerMessageId,
            folder,
            'meta.crmLocalCopy': false,
            ...(normalizedRfc ? { 'meta.rfcMessageId': normalizedRfc } : {}),
          },
        },
        { new: true },
      );
    }

    if (matched && normalizedRfc) {
      const token = String(
        (matched.meta as { trackingToken?: string } | undefined)?.trackingToken ||
          '',
      ).trim();
      if (token) {
        void this.emailTrackingService
          .attachRfcMessageId(token, normalizedRfc)
          .catch((err: unknown) =>
            this.logger.warn(
              `attachRfcMessageId failed: ${err instanceof Error ? err.message : err}`,
            ),
          );
      }
    }

    return matched;
  }

  private async syncRecentSentFolder(
    userId: string,
    account: UserEmailAccountDocument,
    limit = 5,
  ): Promise<void> {
    try {
      const folder = this.resolveSentFolderForAccount(account);
      await this.syncInbox(userId, account._id.toString(), folder, limit);
    } catch (e: unknown) {
      this.logger.warn(
        `Post-send sent folder sync failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async persistSentEmailAndLogActivity(
    userId: string,
    account: UserEmailAccountDocument,
    data: {
      to: string;
      subject: string;
      bodyHtml: string;
      module?: string;
      entityId?: string;
      cc?: string[];
      bcc?: string[];
      fromEmail: string;
      trackingToken?: string;
      attachments?: Array<{
        filename: string;
        contentType: string;
        content?: Buffer;
        size?: number;
      }>;
      replyToInboxEmailId?: string;
      rfcMessageId?: string;
      graphMessageId?: string;
      inReplyTo?: string;
      references?: string;
      workflowMeta?: {
        followUpSequence?: boolean;
        alternateStep?: number;
        workflowId?: string;
      };
    },
    options?: { syncSentFolder?: boolean },
  ): Promise<void> {
    const inboxEmailId = await this.saveSentEmailCopy(userId, account, data);
    await this.logEmailSentActivity(userId, {
      to: data.to,
      subject: data.subject,
      module: data.module,
      entityId: data.entityId,
      cc: data.cc,
      fromEmail: data.fromEmail,
      trackingToken: data.trackingToken,
      bodyHtml: data.bodyHtml,
      attachments: data.attachments,
      inboxEmailId,
      workflowMeta: data.workflowMeta,
    });
    if (options?.syncSentFolder !== false && account.microsoftGraphMail) {
      void this.syncRecentSentFolder(userId, account, 5);
    }
  }

  private parseEmailAddress(raw: string): string {
    const t = (raw || '').trim();
    const angle = t.match(/<([^>]+@[^>]+)>/);
    if (angle?.[1]) return angle[1].trim().toLowerCase();
    return t.toLowerCase();
  }

  /**
   * Detect calendar / meeting invite emails from attachments, MIME types, and subject.
   * Used to surface client invitations in the Sales Workspace work queue.
   */
  private detectMeetingInvite(input: {
    subject?: string;
    body?: string;
    bodyHtml?: string;
    attachments?: Array<{ filename?: string; contentType?: string }>;
    headers?: Record<string, unknown>;
  }): { isMeetingInvite: boolean; inviteMethod?: string; inviteSummary?: string } {
    const subject = String(input.subject || '');
    const subjectLower = subject.toLowerCase();
    const bodyText = `${input.body || ''}\n${input.bodyHtml || ''}`.toLowerCase();
    const attachments = input.attachments || [];

    const hasCalendarAttachment = attachments.some((a) => {
      const ct = String(a.contentType || '').toLowerCase();
      const fn = String(a.filename || '').toLowerCase();
      return (
        ct.includes('text/calendar') ||
        ct.includes('application/ics') ||
        (ct.includes('application/octet-stream') && fn.endsWith('.ics')) ||
        fn.endsWith('.ics') ||
        fn.endsWith('.ical')
      );
    });

    const headers = input.headers || {};
    const headerBlob = Object.entries(headers)
      .map(([k, v]) => `${k}:${String(v ?? '')}`)
      .join('\n')
      .toLowerCase();
    const headerSignal =
      headerBlob.includes('text/calendar') ||
      headerBlob.includes('method=request') ||
      headerBlob.includes('method: request') ||
      headerBlob.includes('ipm.schedule.meeting.request') ||
      headerBlob.includes('content-class: urn:content-classes:calendarmessage');

    const subjectSignal =
      /^(invitation|invite|meeting invitation|accepted:|declined:|tentative:|canceled:|cancelled:)/i.test(
        subject.trim(),
      ) ||
      subjectLower.includes('invited you to') ||
      subjectLower.includes("you're invited") ||
      subjectLower.includes('you are invited') ||
      subjectLower.includes('meeting request') ||
      subjectLower.includes('calendar invitation');

    const bodySignal =
      bodyText.includes('begin:vcalendar') ||
      bodyText.includes('text/calendar') ||
      bodyText.includes('method:request');

    const isMeetingInvite = hasCalendarAttachment || headerSignal || subjectSignal || bodySignal;
    if (!isMeetingInvite) {
      return { isMeetingInvite: false };
    }

    let inviteMethod: string | undefined;
    const methodMatch =
      headerBlob.match(/\bmethod[=:\s]+(request|cancel|reply|publish|counter)/i) ||
      bodyText.match(/\bmethod:?(request|cancel|reply|publish|counter)/i);
    if (methodMatch?.[1]) {
      inviteMethod = methodMatch[1].toUpperCase();
    } else if (/^canceled:|^cancelled:/i.test(subject.trim())) {
      inviteMethod = 'CANCEL';
    } else if (/^accepted:|^declined:|^tentative:/i.test(subject.trim())) {
      inviteMethod = 'REPLY';
    } else {
      inviteMethod = 'REQUEST';
    }

    const inviteSummary = subject.replace(/^(invitation|invite|meeting invitation):\s*/i, '').trim() || subject;

    return { isMeetingInvite: true, inviteMethod, inviteSummary };
  }

  private isLikelyHardBounceNotice(saved: InboxEmailDocument): boolean {
    const fromRaw = `${saved.from || ''} ${saved.fromName || ''}`.toLowerCase();
    const subject = String(saved.subject || '').toLowerCase();
    const body = `${saved.body || ''}\n${saved.bodyHtml || ''}`.toLowerCase();
    const fromBounceSender =
      fromRaw.includes('mailer-daemon') ||
      fromRaw.includes('mail delivery subsystem') ||
      fromRaw.includes('postmaster@');
    const subjectBounce =
      subject.includes('delivery status notification (failure)') ||
      subject.includes('undeliverable') ||
      subject.includes('undelivered mail returned to sender') ||
      subject.includes('delivery failure') ||
      subject.includes('mail delivery failed');
    const hardBounceBody =
      body.includes('address not found') ||
      body.includes('mailbox not found') ||
      body.includes('does not exist') ||
      body.includes('recipient address rejected') ||
      body.includes('recipient not found') ||
      body.includes('user unknown') ||
      body.includes('unknown user') ||
      body.includes('no such user') ||
      body.includes('550 5.1.1') ||
      body.includes('550-5.1.1') ||
      body.includes('invalid recipient');
    return (fromBounceSender && subjectBounce) || (subjectBounce && hardBounceBody);
  }

  private async flagRecipientsFromSendError(
    recipients: string[],
    errorMessage: string,
  ): Promise<void> {
    if (!isPermanentRecipientFailure(errorMessage)) return;
    const reason = `Send rejected: ${String(errorMessage).slice(0, 160)}`;
    for (const raw of recipients) {
      const e = String(raw || '').trim();
      if (!e.includes('@')) continue;
      await this.markEmailInvalidAcrossRecords(e, reason);
    }
  }

  private extractBouncedRecipients(saved: InboxEmailDocument): string[] {
    const text = `${saved.body || ''}\n${saved.bodyHtml || ''}`;
    const out = new Set<string>();
    const push = (raw: string) => {
      const parsed = this.parseEmailAddress(raw);
      if (parsed.includes('@')) out.add(parsed);
    };
    const patterns = [
      /Final-Recipient:\s*rfc822;\s*([^\s<>]+)/gi,
      /Original-Recipient:\s*rfc822;\s*([^\s<>]+)/gi,
      /Recipient(?: address)? rejected[^<\n]*<([^>]+)>/gi,
      /The email account that you tried to reach[^\n]*\n?[^\n]*<([^>]+)>/gi,
      /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null = null;
      while ((m = re.exec(text))) {
        if (m[1]) push(m[1]);
      }
    }
    return [...out].slice(0, 10);
  }

  private async markEmailInvalidAcrossRecords(
    email: string,
    reason: string,
  ): Promise<number> {
    const trimmed = String(email || '').trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return 0;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}$`, 'i');
    const now = new Date().toISOString();
    const marker = `${trimmed} | ${reason} | ${now}`;
    const update = {
      $addToSet: {
        invalidEmails: trimmed,
        'customFields.__emailInvalidLog': marker,
      },
    };
    const [leadRes, contactRes, clientRes] = await Promise.all([
      this.leadModel
        .updateMany({ $or: [{ email: regex }, { additionalEmails: regex }] }, update)
        .exec(),
      this.contactModel
        .updateMany({ $or: [{ email: regex }, { additionalEmails: regex }] }, update)
        .exec(),
      this.clientModel
        .updateMany({ $or: [{ email: regex }, { additionalEmails: regex }] }, update)
        .exec(),
    ]);
    return (
      Number(leadRes.modifiedCount || 0) +
      Number(contactRes.modifiedCount || 0) +
      Number(clientRes.modifiedCount || 0)
    );
  }

  private isUnsubscribeRequest(saved: InboxEmailDocument): boolean {
    const subj = String(saved.subject || '').trim().toLowerCase();
    const body = `${saved.body || ''} ${htmlToPlainTextBasic(saved.bodyHtml || '')}`
      .toLowerCase()
      .trim();
    if (/^(unsubscribe|remove me|opt[ -]?out|stop emailing)\.?$/.test(subj)) {
      return true;
    }
    if (body.length > 0 && body.length < 600) {
      if (/\bunsubscribe\b/.test(body) && !/\bdo not unsubscribe\b/.test(body)) {
        return true;
      }
      if (/\b(remove me|opt out|stop emailing)\b/.test(body)) return true;
    }
    return false;
  }

  private async isSuppressedRecipientEmail(email: string): Promise<boolean> {
    const trimmed = String(email || '').trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return false;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}$`, 'i');
    const [leadHit, contactHit, clientHit] = await Promise.all([
      this.leadModel
        .exists({ invalidEmails: regex })
        .lean()
        .exec(),
      this.contactModel
        .exists({ invalidEmails: regex })
        .lean()
        .exec(),
      this.clientModel
        .exists({ invalidEmails: regex })
        .lean()
        .exec(),
    ]);
    return !!(leadHit || contactHit || clientHit);
  }

  private relatedTypeFromModule(module: string): string {
    if (module === 'leads') return 'Lead';
    if (module === 'contacts') return 'Contact';
    if (module === 'clients') return 'Client';
    return 'Organization';
  }

  private crmRecordPathFromModule(module: string, entityId: string): string | null {
    const id = String(entityId || '').trim();
    if (!Types.ObjectId.isValid(id)) return null;
    const m = String(module || '').toLowerCase();
    if (m === 'leads') return `/crm/leads/${id}`;
    if (m === 'contacts') return `/crm/contacts/${id}`;
    if (m === 'clients') return `/crm/clients/${id}`;
    if (m === 'organizations') return `/crm/organizations/${id}`;
    return null;
  }

  /**
   * Sanitize inbound HTML for activity iframes, but keep CID identity so the CRM UI
   * can resolve inline images via attachment download (data-crm-cid).
   */
  private sanitizeInboundEmailHtmlForActivity(html: string): string {
    if (!html || typeof html !== 'string') return '';
    let h = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    h = h.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    h = h.replace(
      /\ssrc\s*=\s*["']cid:([^"']+)["']/gi,
      (_m, cid: string) =>
        ` src="" data-crm-cid="${String(cid || '')
          .replace(/[<>]/g, '')
          .replace(/"/g, '')
          .trim()}"`,
    );
    h = h.replace(
      /\surl\(\s*["']?cid:([^)"']+)["']?\s*\)/gi,
      (_m, cid: string) =>
        ` url() /*crm-cid:${String(cid || '')
          .replace(/[<>]/g, '')
          .replace(/\*\//g, '')
          .trim()}*/`,
    );
    return h;
  }

  /** Fallback content type from the filename when provider metadata is missing or generic. */
  private guessAttachmentContentType(filename: string): string {
    const ext = String(filename || '')
      .split('.')
      .pop()
      ?.toLowerCase();
    const byExt: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      jpe: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      avif: 'image/avif',
      ico: 'image/x-icon',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      heic: 'image/heic',
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
    };
    return (ext && byExt[ext]) || 'application/octet-stream';
  }

  /**
   * Graph reports hasAttachments=false when a message only carries inline (cid:) images,
   * so also look at the body — otherwise embedded pictures have no downloadable metadata.
   */
  private graphMessageNeedsAttachmentMeta(m: {
    hasAttachments?: boolean;
    body?: { content?: string };
    bodyPreview?: string;
  }): boolean {
    if (m?.hasAttachments) return true;
    return /(?:src=["']?cid:|url\(\s*["']?cid:)/i.test(m?.body?.content || '');
  }

  private async fetchGraphAttachmentMeta(
    token: string,
    graphMessageId: string,
  ): Promise<
    Array<{
      id: string;
      filename: string;
      size: number;
      contentType: string;
      cid?: string;
      isInline?: boolean;
    }>
  > {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(graphMessageId)}/attachments?$select=id,name,size,contentType,contentId,isInline`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as {
        value?: Array<{
          id?: string;
          name?: string;
          size?: number;
          contentType?: string;
          contentId?: string;
          isInline?: boolean;
        }>;
      };
      return this.mapGraphAttachmentMeta(json.value || []);
    } catch (err) {
      this.logger.warn(
        `Graph attachment metadata fetch failed for ${graphMessageId}: ${err}`,
      );
      return [];
    }
  }

  private mapGraphAttachmentMeta(
    rows: Array<{
      id?: string;
      name?: string;
      size?: number;
      contentType?: string;
      contentId?: string;
      isInline?: boolean;
    }>,
  ): Array<{
    id: string;
    filename: string;
    size: number;
    contentType: string;
    cid?: string;
    isInline?: boolean;
  }> {
    return (rows || []).map((a, idx) => {
      const cid = String(a.contentId || '')
        .replace(/^<|>$/g, '')
        .trim();
      const filename =
        String(a.name || '').trim() ||
        (cid ? cid.split('@')[0] : '') ||
        (a.isInline || cid ? `inline-image-${idx + 1}` : `attachment-${idx + 1}`);
      const rawType = String(a.contentType || '').trim().toLowerCase();
      const contentType =
        rawType && rawType !== 'application/octet-stream'
          ? rawType
          : a.isInline || cid
            ? this.guessAttachmentContentType(
                /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename}.png`,
              )
            : this.guessAttachmentContentType(filename);
      return {
        id: a.id || '',
        filename,
        size: a.size || 0,
        contentType,
        ...(cid ? { cid } : {}),
        ...(a.isInline || cid ? { isInline: true } : {}),
      };
    });
  }

  /** Remove Outlook/plain-text cid placeholders from one-line previews. */
  private sanitizeEmailActivityPreviewPlain(text: string, maxLen: number): string {
    const t = (text || '')
      .replace(/\[\s*cid:[-a-fA-F0-9]+\s*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return maxLen > 0 && t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  }

  private moduleLabel(module: 'leads' | 'contacts' | 'clients'): string {
    if (module === 'leads') return 'Lead';
    if (module === 'contacts') return 'Contact';
    return 'Client';
  }

  private formatReplyPreview(bodyPlain: string): string {
    const compact = (bodyPlain || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '(No body text)';
    return compact.length > 450 ? `${compact.slice(0, 450)}…` : compact;
  }

  private isAdminRole(role: string | undefined): boolean {
    const r = String(role || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/_/g, '')
      .replace(/-/g, '');
    return (
      r === 'ADMIN' ||
      r === 'ADMINISTRATOR' ||
      r === 'SUPERADMIN' ||
      r === 'SUBADMIN' ||
      r === 'CEO' ||
      r === 'CTO' ||
      r === 'OWNER'
    );
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async getOwnerUserIdsForTarget(target: {
    module: 'leads' | 'contacts' | 'clients';
    entityId: string;
  }): Promise<string[]> {
    if (!Types.ObjectId.isValid(target.entityId)) return [];
    const ids = new Set<string>();

    const pushByDisplayName = async (name: string | null | undefined) => {
      const n = (name || '').trim();
      if (!n) return;
      const u = await this.userModel
        .findOne({
          displayName: { $regex: new RegExp(`^${this.escapeRegex(n)}$`, 'i') },
          isActive: true,
        })
        .select('_id')
        .lean()
        .exec();
      if (u) ids.add(String(u._id));
    };

    if (target.module === 'leads') {
      const lead = await this.leadModel
        .findById(new Types.ObjectId(target.entityId))
        .select('createdBy leadOwner')
        .lean()
        .exec();
      if (lead?.createdBy) ids.add(String(lead.createdBy));
      await pushByDisplayName(lead?.leadOwner);
    } else if (target.module === 'contacts') {
      const contact = await this.contactModel
        .findById(new Types.ObjectId(target.entityId))
        .select('createdBy leadOwner')
        .lean()
        .exec();
      if (contact?.createdBy) ids.add(String(contact.createdBy));
      await pushByDisplayName(contact?.leadOwner);
    } else if (target.module === 'clients') {
      const client = await this.clientModel
        .findById(new Types.ObjectId(target.entityId))
        .select('assignedTo')
        .lean()
        .exec();
      for (const uid of client?.assignedTo || []) {
        if (uid) ids.add(String(uid));
      }
    }
    return [...ids].filter((id) => Types.ObjectId.isValid(id));
  }

  /**
   * In-app notification recipients for a CRM record.
   * Owners / assignees only — do NOT fan out to every ADMIN/SUBADMIN
   * (that flooded the CRM bell with months of unrelated inbound mail).
   * Mailbox owner + sharers are added separately in getInboundAlertRecipientUserIds.
   */
  private async getAlertRecipientUserIdsForTarget(target: {
    module: 'leads' | 'contacts' | 'clients';
    entityId: string;
  }): Promise<string[]> {
    return this.getOwnerUserIdsForTarget(target);
  }

  private async getAlertRecipientsForTarget(target: {
    module: 'leads' | 'contacts' | 'clients';
    entityId: string;
  }): Promise<string[]> {
    const ownerIds = await this.getOwnerUserIdsForTarget(target);
    const admins = await this.userModel
      .find({ isActive: true })
      .select('email role')
      .lean()
      .exec();

    const adminEmails = admins
      .filter((u) => this.isAdminRole(u.role))
      .map((u) => String(u.email || '').trim())
      .filter((email) => email.includes('@'));

    const ownerUsers = ownerIds.length
      ? await this.userModel
        .find({
          _id: {
            $in: ownerIds
              .filter((id) => Types.ObjectId.isValid(id))
              .map((id) => new Types.ObjectId(id)),
          },
          isActive: true,
        })
        .select('email')
        .lean()
        .exec()
      : [];
    const ownerEmails = ownerUsers
      .map((u) => String(u.email || '').trim())
      .filter((email) => email.includes('@'));

    return [...new Set([...ownerEmails, ...adminEmails])];
  }

  /** Mailbox owner + shared users (always include so alerts still deliver if record has no createdBy). */
  private async getMailboxUserEmails(
    account: UserEmailAccountDocument,
    actorUserId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    const ownerId = String(account.userId || '').trim();
    if (ownerId) ids.add(ownerId);
    const actor = String(actorUserId || '').trim();
    if (actor) ids.add(actor);
    for (const sid of account.sharedWithUserIds || []) {
      const id = String(sid || '').trim();
      if (id) ids.add(id);
    }
    if (!ids.size) return [];
    const users = await this.userModel
      .find({
        $or: [
          {
            _id: {
              $in: [...ids]
                .filter((id) => Types.ObjectId.isValid(id))
                .map((id) => new Types.ObjectId(id)),
            },
          },
          { accessibleEmailAccounts: String(account._id) },
        ],
        isActive: true,
      } as any)
      .select('email')
      .lean()
      .exec();
    return users
      .map((u) => String(u.email || '').trim())
      .filter((email) => email.includes('@'));
  }

  private async getInboundAlertRecipientUserIds(
    target: {
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
    },
    account: UserEmailAccountDocument,
    actorUserId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();

    // 1. Mailbox accessibility (owner, actor, shared users)
    const ownerId = String(account.userId || '').trim();
    if (ownerId) ids.add(ownerId);
    const actor = String(actorUserId || '').trim();
    if (actor) ids.add(actor);
    for (const sid of account.sharedWithUserIds || []) {
      const id = String(sid || '').trim();
      if (id) ids.add(id);
    }

    // 2. CRM Record Ownership + Admins
    const recordRelatedIds = await this.getAlertRecipientUserIdsForTarget(target);
    for (const rid of recordRelatedIds) ids.add(rid);

    // 3. Indirect accessibility via User.accessibleEmailAccounts (HRMS-synced sharing)
    const indirectUsers = await this.userModel
      .find({
        accessibleEmailAccounts: String(account._id),
        isActive: true,
      } as any)
      .select('_id')
      .lean()
      .exec();
    for (const u of indirectUsers) {
      ids.add(String(u._id));
    }

    return [...ids].filter((id) => Types.ObjectId.isValid(id));
  }

  /**
   * Recipients for tracked email open/click notifications — same fan-out as
   * inbound reply alerts: mailbox users + record owners (+ sender).
   */
  async resolveEngagementNotificationRecipientIds(opts: {
    senderUserId: string;
    accountId?: string | null;
    module?: string | null;
    entityId?: string | null;
  }): Promise<string[]> {
    const sender = String(opts.senderUserId || '').trim();
    const ids = new Set<string>();
    if (sender && Types.ObjectId.isValid(sender)) ids.add(sender);

    const mod = String(opts.module || '').toLowerCase();
    const entityId = String(opts.entityId || '').trim();
    const validModule =
      mod === 'leads' ||
      mod === 'contacts' ||
      mod === 'clients'
        ? (mod as 'leads' | 'contacts' | 'clients')
        : null;

    const accountId = String(opts.accountId || '').trim();
    let account: UserEmailAccountDocument | null = null;
    if (accountId && Types.ObjectId.isValid(accountId)) {
      account = await this.accountModel.findById(accountId).exec();
    }

    if (validModule && entityId && Types.ObjectId.isValid(entityId) && account) {
      const more = await this.getInboundAlertRecipientUserIds(
        { module: validModule, entityId },
        account,
        sender,
      );
      for (const id of more) ids.add(id);
    } else if (validModule && entityId && Types.ObjectId.isValid(entityId)) {
      const owners = await this.getAlertRecipientUserIdsForTarget({
        module: validModule,
        entityId,
      });
      for (const id of owners) ids.add(id);
    } else if (account) {
      const ownerId = String(account.userId || '').trim();
      if (ownerId) ids.add(ownerId);
      for (const sid of account.sharedWithUserIds || []) {
        const id = String(sid || '').trim();
        if (id) ids.add(id);
      }
      const indirectUsers = await this.userModel
        .find({
          accessibleEmailAccounts: String(account._id),
          isActive: true,
        } as any)
        .select('_id')
        .lean()
        .exec();
      for (const u of indirectUsers) ids.add(String(u._id));
    }

    return [...ids].filter((id) => Types.ObjectId.isValid(id));
  }

  private async getInboundAlertEmailRecipients(
    target: {
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
    },
    account: UserEmailAccountDocument,
    actorUserId: string,
  ): Promise<string[]> {
    const fromRecord = await this.getAlertRecipientsForTarget(target);
    const fromMailbox = await this.getMailboxUserEmails(account, actorUserId);
    return [...new Set([...fromRecord, ...fromMailbox])];
  }

  private async sendInboundCrmEmailAlerts(
    params: {
      userId: string;
      account: UserEmailAccountDocument;
      matchReason: 'in_reply_to' | 'sender_email';
      target: {
        module: 'leads' | 'contacts' | 'clients';
        entityId: string;
        label: string;
      };
      fromAddr: string;
      senderLabel: string;
      toAddr: string;
      subject: string;
      bodyPlain: string;
      inboxEmailId: string;
    },
  ): Promise<void> {
    const receivedAt = new Date();
    const modulePretty = this.moduleLabel(params.target.module);
    const preview = this.formatReplyPreview(params.bodyPlain);
    const isReply = params.matchReason === 'in_reply_to';
    const frontendBase = String(this.config.get<string>('FRONTEND_URL') || '').replace(
      /\/$/,
      '',
    );
    const crmUrl = frontendBase
      ? `${frontendBase}/crm/workspace?module=${encodeURIComponent(params.target.module)}&recordId=${encodeURIComponent(params.target.entityId)}`
      : '';
    const teamsTitle = isReply
      ? `Client replied: ${params.subject || '(No subject)'}`
      : `Inbound email: ${params.subject || '(No subject)'}`;
    const emailSubject = isReply
      ? `CRM Alert: Client replied - ${params.subject || '(No subject)'}`
      : `CRM Alert: New email - ${params.subject || '(No subject)'}`;

    try {
      await this.teamsIntegrationService.notifyTeams(params.target.module, {
        title: teamsTitle,
        text: [
          isReply ? 'Thread: reply to your CRM email' : 'Thread: message from known CRM contact',
          `From: ${params.senderLabel} <${params.fromAddr}>`,
          `To Mailbox: ${params.toAddr || params.account.email}`,
          `CRM: ${modulePretty} - ${params.target.label || params.target.entityId}`,
          `Preview: ${preview}`,
          crmUrl ? `Open CRM: ${crmUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Teams inbound email alert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const recipients = await this.getInboundAlertEmailRecipients(
        params.target,
        params.account,
        params.userId,
      );
      if (!recipients.length) {
        this.logger.warn(
          'Inbound CRM email alert: no email recipients (check CRM user emails + mailbox owner).',
        );
        return;
      }
      await this.emailService.sendMail(
        recipients.join(','),
        emailSubject,
        'crm-email-reply-alert',
        {
          senderName: params.senderLabel,
          senderEmail: params.fromAddr,
          mailboxEmail: params.toAddr || params.account.email,
          subject: params.subject || '(No subject)',
          module: modulePretty,
          recordLabel: params.target.label || params.target.entityId,
          receivedAt: receivedAt.toISOString(),
          bodyPreview: preview,
          inboxEmailId: params.inboxEmailId,
          crmUrl,
        },
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Email inbound alert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Timeline activities keep their own copy of the attachment list, taken when the activity was
   * created. Attachments discovered on a later sync would otherwise never reach the timeline,
   * leaving inline images unresolvable there.
   */
  private async backfillActivityAttachments(
    inboxEmailId: string,
    attachments: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (!inboxEmailId || !attachments?.length) return;
    const idVariants: Array<string | Types.ObjectId> = [String(inboxEmailId)];
    if (Types.ObjectId.isValid(inboxEmailId)) {
      idVariants.push(new Types.ObjectId(inboxEmailId));
    }
    try {
      await this.activityModel
        .updateMany(
          {
            'metadata.inboxEmailId': { $in: idVariants },
            $or: [
              { 'metadata.attachments': { $exists: false } },
              { 'metadata.attachments': { $size: 0 } },
            ],
          },
          { $set: { 'metadata.attachments': attachments } },
        )
        .exec();
    } catch (err: unknown) {
      this.logger.warn(
        `Activity attachment backfill failed for email ${inboxEmailId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * When inbox sync pulls a message from a CRM-known address (or In-Reply-To matches our CRM send),
   * append an activity on the lead/contact/client timeline.
   *
   * Provider ids can change after an IMAP UIDVALIDITY reset or mailbox migration, so use the
   * RFC Message-ID as an additional stable dedupe key when it is available.
   */
  private async maybeLogInboundCrmActivity(
    userId: string,
    account: UserEmailAccountDocument,
    folder: string,
    saved: InboxEmailDocument,
    headerContext: { inReplyTo?: string; references?: string },
  ): Promise<void> {
    if (!this.isInboundFolder(folder)) return;

    const fromAddr = this.parseEmailAddress(saved.from);
    if (this.isUnsubscribeRequest(saved)) {
      const touched = await this.markEmailInvalidAcrossRecords(
        fromAddr,
        'Inbound unsubscribe request',
      );
      if (touched > 0) {
        this.logger.log(
          `Suppressed ${fromAddr} after inbound unsubscribe (${saved.messageId})`,
        );
      }
      return;
    }
    if (this.isLikelyHardBounceNotice(saved)) {
      const bounced = this.extractBouncedRecipients(saved);
      if (bounced.length > 0) {
        let touched = 0;
        for (const email of bounced) {
          touched += await this.markEmailInvalidAcrossRecords(
            email,
            'Hard bounce: delivery status notification (failure)',
          );
        }
        if (touched > 0) {
          this.logger.warn(
            `Marked ${bounced.length} bounced email(s) invalid from DSN message ${saved.messageId}`,
          );
        }
      }
      return;
    }
    const ourAddr = (account.email || '').trim().toLowerCase();
    if (!fromAddr.includes('@')) return;
    if (fromAddr === ourAddr) return;

    const headerBlob = [headerContext.inReplyTo, headerContext.references]
      .filter(Boolean)
      .join(' ');
    const fromReply =
      await this.emailTrackingService.findTrackingFromInReplyHeaders(
        headerBlob,
      );

    type Target = {
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      email: string;
    };
    let targets: Target[] = [];
    if (fromReply?.entityId && fromReply.module) {
      const mod = fromReply.module as Target['module'];
      if (['leads', 'contacts', 'clients'].includes(mod)) {
        targets = [
          {
            module: mod,
            entityId: fromReply.entityId.toString(),
            label: '',
            email: fromAddr,
          },
        ];
      }
    }
    if (!targets.length) {
      targets = await this.resolveRecipientEmail(fromAddr);
    }
    if (!targets.length) return;

    // One activity per inbound message. involvedEntities + activity rollup already
    // surfaces it on related lead/contact/client timelines — logging on every
    // match created duplicate "Email reply received" cards on the same record.
    targets = this.pickPrimaryInboundTargets(targets);
    if (!targets.length) return;

    const inboundMessageKey = `${account._id}:${folder}:${saved.messageId}`;
    const normalizedRfcMessageId = this.normalizeRfcMessageId(
      String((saved.meta as Record<string, unknown> | undefined)?.rfcMessageId || ''),
    );
    const inboundRfcMessageKey = normalizedRfcMessageId
      ? `${account._id}:${normalizedRfcMessageId}`
      : '';
    const inboundDedupeClauses: Array<Record<string, unknown>> = [
      { 'metadata.inboxEmailId': saved._id },
      { 'metadata.inboundMessageKey': inboundMessageKey },
    ];
    if (inboundRfcMessageKey) {
      inboundDedupeClauses.push({
        'metadata.inboundRfcMessageKey': inboundRfcMessageKey,
      });
    }
    // If a previous sync already logged any linked record, missing sibling activities may still
    // be healed below, but users must not receive the same notification/alert again.
    const wasAlreadyLogged = Boolean(
      await this.activityModel
        .exists({ type: 'Email', $or: inboundDedupeClauses })
        .exec(),
    );
    const title = fromReply ? 'Email reply received' : 'Email received';
    const matchReason = fromReply ? 'in_reply_to' : 'sender_email';
    const senderLabel = (saved.fromName || '').trim() || fromAddr;
    const toAddr = (saved.to || '').trim().toLowerCase();
    const bodyHtmlRaw = (saved.bodyHtml || '').trim();
    const bodyPlainRaw = (saved.body || '').trim();
    const bodyHtml = bodyHtmlRaw
      ? this.sanitizeInboundEmailHtmlForActivity(bodyHtmlRaw)
      : '';
    let bodyPlain = bodyPlainRaw;
    if (!bodyPlain && bodyHtmlRaw) {
      bodyPlain = bodyHtmlRaw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    bodyPlain = this.sanitizeEmailActivityPreviewPlain(bodyPlain, 12_000);
    const content = `${senderLabel} — ${saved.subject || '(No subject)'}`;
    let createdAnyActivity = false;
    let alertTarget:
      | {
        module: 'leads' | 'contacts' | 'clients';
        entityId: string;
        label: string;
      }
      | null = null;

    for (const t of targets) {
      const inboundPrimaryOid = new Types.ObjectId(t.entityId);
      const inboxEmailOid =
        saved._id instanceof Types.ObjectId
          ? saved._id
          : new Types.ObjectId(String(saved._id));
      const dup = await this.activityModel
        .findOne({
          $or: [
            {
              relatedTo: inboundPrimaryOid,
              $or: [
                ...inboundDedupeClauses,
                { 'metadata.inboxEmailId': String(saved._id) },
              ],
            },
            // Same synced message already logged on a related record that rolls up here
            {
              'metadata.inboxEmailId': inboxEmailOid,
              'involvedEntities.id': inboundPrimaryOid,
            },
            {
              'metadata.inboxEmailId': String(saved._id),
              'involvedEntities.id': inboundPrimaryOid,
            },
          ],
        })
        .select('_id')
        .lean()
        .exec();
      if (dup) continue;

      const inboundRelatedType = this.relatedTypeFromModule(t.module);
      const inboundInvolvedEntities = await this.buildInvolvedEntities(inboundPrimaryOid, inboundRelatedType);

      await new this.activityModel({
        type: 'Email',
        title,
        content,
        relatedTo: inboundPrimaryOid,
        relatedType: inboundRelatedType,
        author: new Types.ObjectId(userId),
        involvedEntities: inboundInvolvedEntities,
        metadata: {
          inboundMessageKey,
          ...(inboundRfcMessageKey ? { inboundRfcMessageKey } : {}),
          ...(normalizedRfcMessageId
            ? { rfcMessageId: normalizedRfcMessageId }
            : {}),
          inboxEmailId: saved._id,
          direction: 'inbound',
          subject: saved.subject,
          matchReason,
          fromEmail: fromAddr,
          fromDisplay: senderLabel,
          toEmail: toAddr || ourAddr,
          ...(bodyHtml ? { bodyHtml } : {}),
          ...(bodyPlain ? { bodyPlain } : {}),
          attachments: (saved.meta as any)?.attachments || [],
          ...(fromReply?.trackingToken
            ? { trackingToken: fromReply.trackingToken }
            : {}),
        },
      }).save();
      createdAnyActivity = true;

      // Stop follow-up sequences on any inbound from a matched CRM record
      // (tracked thread reply or new email from the same address).
      if (
        t.module === 'leads' ||
        t.module === 'contacts'
      ) {
        void this.workflowsService
          .cancelPendingJobsOnReply(t.module, t.entityId)
          .catch((err: unknown) =>
            this.logger.warn(
              `cancelPendingJobsOnReply: ${err instanceof Error ? err.message : err}`,
            ),
          );
        if (matchReason === 'in_reply_to') {
          void this.workflowsService.onTrackedEmailReply({
            module: t.module,
            entityId: new Types.ObjectId(t.entityId),
            senderUserId: new Types.ObjectId(userId),
          });
          if (t.module === 'leads') {
            this.salesAgentTrigger.onEvent({
              trigger: 'email_reply_received',
              recordType: 'Lead',
              recordId: t.entityId,
              metadata: {
                inboxEmailId: String(saved._id),
                fromEmail: fromAddr,
                subject: saved.subject,
              },
            });
          }
        }
      }

    }

    if (!wasAlreadyLogged && createdAnyActivity) {
      const isReply = matchReason === 'in_reply_to';
      // A sender can match a lead and related contact. Notify the union of their
      // owners plus mailbox users once per person, retaining the first relevant record link.
      const recipientTargets = new Map<string, Target>();
      for (const target of targets) {
        const recipientIds = await this.getInboundAlertRecipientUserIds(
          target,
          account,
          userId,
        );
        for (const rid of recipientIds) {
          if (!recipientTargets.has(rid)) recipientTargets.set(rid, target);
        }
      }
      for (const [rid, target] of recipientTargets) {
        const recordPath = this.crmRecordPathFromModule(
          target.module,
          target.entityId,
        );
        await this.notificationsService.create({
          recipient: rid,
          type: isReply ? 'CRM_EMAIL_REPLY_RECEIVED' : 'CRM_EMAIL_RECEIVED',
          title: isReply ? 'Client replied' : 'New inbound email',
          message: `${senderLabel} · ${saved.subject || '(No subject)'}`,
          metadata: {
            module: target.module,
            entityId: target.entityId,
            fromEmail: fromAddr,
            relatedType: this.relatedTypeFromModule(target.module),
            inboxEmailId: String(saved._id),
            receivedAt: new Date().toISOString(),
            ...(recordPath ? { link: recordPath } : {}),
          },
        });
      }
      const primaryTarget = targets[0];
      alertTarget = primaryTarget
        ? {
            module: primaryTarget.module,
            entityId: primaryTarget.entityId,
            label: primaryTarget.label,
          }
        : null;
    }

    if (!wasAlreadyLogged && createdAnyActivity && alertTarget) {
      try {
        await this.sendInboundCrmEmailAlerts({
          userId,
          account,
          matchReason,
          target: alertTarget,
          fromAddr,
          senderLabel,
          toAddr: toAddr || ourAddr,
          subject: saved.subject || '(No subject)',
          bodyPlain,
          inboxEmailId: String(saved._id),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `sendInboundCrmEmailAlerts failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async syncInboxMicrosoftGraph(
    userId: string,
    account: UserEmailAccountDocument,
    folder: string,
    limit: number,
  ): Promise<number> {
    const graphFolder = this.normalizeGraphFolderId(folder);
    const token = await this.getValidOAuthAccessToken(account);
    const orderby =
      graphFolder === 'sentitems'
        ? 'sentDateTime desc'
        : 'receivedDateTime desc';
    const selectFields = [
      'id',
      'subject',
      'bodyPreview',
      'receivedDateTime',
      'sentDateTime',
      'from',
      'toRecipients',
      'body',
      'hasAttachments',
      'isRead',
      'internetMessageId',
      'internetMessageHeaders',
    ].join(',');
    const url =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(graphFolder)}/messages` +
      `?$top=${limit}&$orderby=${encodeURIComponent(orderby)}&$select=${encodeURIComponent(selectFields)}`;

    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const selectFieldsNoHdr = selectFields.replace(
        ',internetMessageHeaders',
        '',
      );
      const fallbackUrl =
        `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(graphFolder)}/messages` +
        `?$top=${limit}&$orderby=${encodeURIComponent(orderby)}&$select=${encodeURIComponent(selectFieldsNoHdr)}`;
      res = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    const json = (await res.json()) as {
      value?: Array<{
        id: string;
        subject?: string;
        bodyPreview?: string;
        receivedDateTime?: string;
        sentDateTime?: string;
        from?: { emailAddress?: { name?: string; address?: string } };
        toRecipients?: Array<{
          emailAddress?: { name?: string; address?: string };
        }>;
        body?: { contentType?: string; content?: string };
        hasAttachments?: boolean;
        isRead?: boolean;
        internetMessageId?: string;
        internetMessageHeaders?: Array<{ name?: string; value?: string }>;
      }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      this.logger.warn(`Graph list messages failed: ${JSON.stringify(json)}`);
      throw new Error(json.error?.message || 'Graph mail sync failed');
    }

    const messages = json.value || [];
    const existingRows = await this.inboxEmailModel
      .find({
        accountId: account._id,
        folder: graphFolder,
        messageId: { $in: messages.map((m) => m.id).filter(Boolean) },
      })
      .select('messageId categoryOverride meta isRead _id')
      .lean()
      .exec();
    const existingByMessageId = new Map(
      existingRows.map((row) => [row.messageId, row]),
    );

    let synced = 0;
    for (const m of messages) {
      try {
        const existingRow = existingByMessageId.get(m.id);
        const isReadOnServer = m.isRead ?? false;

        if (existingRow) {
          const patch: Record<string, unknown> = {};
          if (isReadOnServer && !existingRow.isRead) {
            patch.isRead = true;
          }
          const existingAttachments = Array.isArray(
            (existingRow.meta as { attachments?: unknown[] })?.attachments,
          )
            ? ((existingRow.meta as { attachments?: unknown[] })
                .attachments as unknown[])
            : [];
          let attachmentMeta = existingAttachments as Array<
            Record<string, unknown>
          >;
          if (
            !attachmentMeta.length &&
            this.graphMessageNeedsAttachmentMeta(m)
          ) {
            attachmentMeta = await this.fetchGraphAttachmentMeta(
              token,
              m.id,
            );
            if (attachmentMeta.length) {
              patch.meta = this.mergeSyncMeta(
                existingRow.meta as Record<string, unknown>,
                { attachments: attachmentMeta, graphMessageId: m.id },
              );
            }
          }
          // Graph reports false for inline-only images; prefer what we actually have.
          patch.hasAttachments =
            (m.hasAttachments ?? false) || attachmentMeta.length > 0;
          // Timelines snapshot attachments at create time — heal older empty rows.
          if (attachmentMeta.length) {
            await this.backfillActivityAttachments(
              String((existingRow as any)._id),
              attachmentMeta,
            );
          }
          if (Object.keys(patch).length > 0) {
            await this.inboxEmailModel.updateOne(
              { _id: (existingRow as any)._id },
              { $set: patch },
            );
          }
          continue;
        }

        const fromAddr = m.from?.emailAddress?.address || '';
        const fromName = m.from?.emailAddress?.name || '';
        const toAddr = m.toRecipients?.[0]?.emailAddress?.address || '';
        const toName = m.toRecipients?.[0]?.emailAddress?.name || '';
        let bodyHtml = '';
        let plain = '';
        if (m.body?.content) {
          if ((m.body.contentType || '').toLowerCase() === 'html') {
            bodyHtml = m.body.content;
            plain = m.body.content
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } else {
            plain = m.body.content;
          }
        } else {
          plain = m.bodyPreview || '';
        }
        const dateStr = m.receivedDateTime || m.sentDateTime;
        const date = dateStr ? new Date(dateStr) : new Date();

        const hdrs = m.internetMessageHeaders || [];
        const inReplyHdr = hdrs.find(
          (h) => (h.name || '').toLowerCase() === 'in-reply-to',
        );
        const refHdr = hdrs.find(
          (h) => (h.name || '').toLowerCase() === 'references',
        );
        const inReplyTo = inReplyHdr?.value || '';
        const references = refHdr?.value || '';

        // Fetch attachment metadata (incl. contentId for inline CID images) from Graph
        let attachmentMeta: Array<{
          id: string;
          filename: string;
          size: number;
          contentType: string;
          cid?: string;
          isInline?: boolean;
        }> = [];
        if (this.graphMessageNeedsAttachmentMeta(m)) {
          attachmentMeta = await this.fetchGraphAttachmentMeta(token, m.id);
        }

        const classification = await this.classificationService.classify(
          {
            from: fromAddr,
            subject: m.subject || '(No subject)',
            body: plain,
            bodyHtml,
            meta: {
              headers: m.internetMessageHeaders?.reduce((acc, h) => ({ ...acc, [h.name?.toLowerCase() || '']: h.value }), {}) || {},
              bodyPreview: m.bodyPreview,
              isReplyToUser: !!inReplyTo,
            }
          },
          userId
        );

        const headerMap =
          m.internetMessageHeaders?.reduce(
            (acc, h) => ({
              ...acc,
              [h.name?.toLowerCase() || '']: h.value,
            }),
            {} as Record<string, string>,
          ) || {};
        const inviteDetect = this.detectMeetingInvite({
          subject: m.subject || '(No subject)',
          body: plain,
          bodyHtml,
          attachments: attachmentMeta,
          headers: headerMap,
        });

        const rfcMessageId = this.normalizeRfcMessageId(m.internetMessageId);
        const reconciled = await this.reconcileSyncedSentEmail(
          account._id,
          graphFolder,
          m.id,
          {
            rfcMessageId,
            subject: m.subject || '(No subject)',
            to: toAddr,
            date,
          },
        );

        const reconciledMeta = reconciled
          ? (
              await this.inboxEmailModel
                .findById(reconciled._id)
                .select('meta categoryOverride')
                .lean()
                .exec()
            )
          : null;
        const mergedMeta = this.mergeSyncMeta(
          reconciledMeta?.meta as Record<string, unknown> | undefined,
          {
            graph: true,
            rfcMessageId: rfcMessageId || undefined,
            graphMessageId: m.id,
            crmLocalCopy: false,
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references ? { references } : {}),
            ...(attachmentMeta.length ? { attachments: attachmentMeta } : {}),
          },
        );
        const result = await this.inboxEmailModel.findOneAndUpdate(
          reconciled
            ? { _id: reconciled._id }
            : {
            accountId: account._id,
            messageId: m.id,
            folder: graphFolder,
          },
          {
            $set: {
              userId: new Types.ObjectId(userId), // Keep userId as the latest syncer
              from: fromAddr,
              fromName,
              to: toAddr,
              toName,
              subject: m.subject || '(No subject)',
              body: plain,
              bodyHtml,
              date,
              // Graph sets hasAttachments=false for inline-only (cid) images.
              hasAttachments:
                (m.hasAttachments ?? false) || attachmentMeta.length > 0,
              isMeetingInvite: inviteDetect.isMeetingInvite,
              ...(inviteDetect.inviteMethod
                ? { inviteMethod: inviteDetect.inviteMethod }
                : {}),
              ...(inviteDetect.inviteSummary
                ? { inviteSummary: inviteDetect.inviteSummary }
                : {}),
              ...this.classificationFieldsFromResult(
                classification,
                reconciledMeta,
              ),
              meta: mergedMeta,
            },
            $setOnInsert: {
              isRead: isReadOnServer,
            },
          },
          { upsert: true, new: true, includeResultMetadata: true },
        );
        const saved = result.value;
        const isNewInsert = !result.lastErrorObject?.updatedExisting;
        // Promote to read when provider says so; never reset local read → unread on re-sync
        if (saved && isReadOnServer && !saved.isRead) {
          await this.inboxEmailModel.updateOne(
            { _id: saved._id },
            { $set: { isRead: true } },
          );
          saved.isRead = true;
        }
        if (saved) {
          await this.maybeLogInboundCrmActivity(
            userId,
            account,
            graphFolder,
            saved,
            {
              inReplyTo,
              references,
            },
          );
        }
        if (isNewInsert) synced++;
      } catch (e) {
        this.logger.warn(`Graph message sync: ${e}`);
      }
    }

    account.lastSyncedAt = new Date();
    this.markAccountSyncSuccess(account, synced);
    await account.save();
    return synced;
  }

  /** Mailbox owner or CRM admin may change account settings. */
  async canManageMailbox(
    userId: string,
    account: Pick<UserEmailAccount, 'userId'>,
    userEmail?: string,
  ): Promise<boolean> {
    if (await this.isAdminUser(userId, userEmail)) return true;
    return this.isMailboxOwner(userId, account, userEmail);
  }

  private async isMailboxOwner(
    userId: string,
    account: Pick<UserEmailAccount, 'userId'>,
    userEmail?: string,
  ): Promise<boolean> {
    const ownerId = String(account.userId || '').trim();
    if (!ownerId) return false;
    if (ownerId === String(userId).trim()) return true;

    let user = await this.userModel.findById(userId).lean().exec();
    if (!user && userEmail) {
      user = await this.userModel.findOne({ email: userEmail }).lean().exec();
    }
    if (user?._id && ownerId === String(user._id)) return true;
    return false;
  }

  async listAccountsForUser(
    userId: string,
    email?: string,
  ): Promise<Array<Record<string, unknown> & { canManage: boolean }>> {
    const accounts = await this.findAccountsByUser(userId, email);
    const rows: Array<Record<string, unknown> & { canManage: boolean }> = [];
    for (const acc of accounts) {
      const plain =
        typeof (acc as UserEmailAccountDocument).toObject === 'function'
          ? (acc as UserEmailAccountDocument).toObject()
          : { ...(acc as object) };
      rows.push({
        ...(plain as Record<string, unknown>),
        canManage: await this.canManageMailbox(userId, acc, email),
      });
    }
    return rows;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    dto: Partial<{
      displayName: string;
      password: string;
      isActive: boolean;
      isDefault: boolean;
      preferImapIdle: boolean;
      sendLimitOverrideEnabled: boolean;
      sendLimitOverrideMaxEmailsPerHour: number | null;
      sendLimitOverrideMaxEmailsPerDay: number | null;
      accountLabel: string;
      outreachType: 'agency' | 'freelancer' | 'both' | null;
      provider: string;
      imapHost: string;
      imapPort: number;
      imapSecure: boolean;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
    }>,
    userEmail?: string,
  ): Promise<UserEmailAccount | null> {
    const account = await this.accountModel.findById(accountId).exec();
    if (!account) return null;
    if (!(await this.canManageMailbox(userId, account, userEmail))) {
      throw new ForbiddenException(
        'Only the mailbox owner or an administrator can edit this account',
      );
    }

    if (dto.displayName !== undefined) account.displayName = dto.displayName;
    if (dto.password !== undefined && account.authType !== 'oauth') {
      const pwd = String(dto.password);
      if (pwd.trim()) {
        const verified = await this.verifySmtpWithFallback(account.provider, {
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort,
          smtpSecure: account.smtpSecure,
          smtpUser: account.smtpUser || account.email,
          smtpPassword: pwd,
        });
        if ('error' in verified) {
          throw new BadRequestException(verified.error);
        }
        account.smtpPort = verified.smtpPort;
        account.smtpSecure = verified.smtpSecure === true;
        account.imapPassword = pwd;
        account.smtpPassword = pwd;
      }
    }
    if (dto.provider !== undefined && account.authType !== 'oauth') {
      const provider = String(dto.provider).trim().toLowerCase();
      if (provider) {
        account.provider = provider;
        const preset = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.other;
        if (dto.imapHost === undefined && preset.imap.host) {
          account.imapHost = preset.imap.host;
          account.imapPort = preset.imap.port;
          account.imapSecure = true;
        }
        if (dto.smtpHost === undefined && preset.smtp.host) {
          account.smtpHost = preset.smtp.host;
          account.smtpPort = preset.smtp.port;
          account.smtpSecure = preset.smtp.port === 465;
        }
      }
    }
    if (dto.imapHost !== undefined && account.authType !== 'oauth') {
      account.imapHost = String(dto.imapHost).trim();
    }
    if (dto.imapPort !== undefined && account.authType !== 'oauth') {
      account.imapPort = Math.max(1, Math.floor(Number(dto.imapPort)));
    }
    if (dto.imapSecure !== undefined && account.authType !== 'oauth') {
      account.imapSecure = dto.imapSecure === true;
    }
    if (dto.smtpHost !== undefined && account.authType !== 'oauth') {
      account.smtpHost = String(dto.smtpHost).trim();
    }
    if (dto.smtpPort !== undefined && account.authType !== 'oauth') {
      account.smtpPort = Math.max(1, Math.floor(Number(dto.smtpPort)));
    }
    if (dto.smtpSecure !== undefined && account.authType !== 'oauth') {
      account.smtpSecure = dto.smtpSecure === true;
    } else if (
      dto.smtpPort !== undefined &&
      account.authType !== 'oauth' &&
      dto.smtpSecure === undefined
    ) {
      account.smtpSecure = account.smtpPort === 465;
    }
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    if (dto.preferImapIdle !== undefined) {
      account.preferImapIdle = dto.preferImapIdle === true;
    }
    if (dto.isDefault === true) {
      await this.accountModel.updateMany(
        { userId: new Types.ObjectId(userId) },
        { $set: { isDefault: false } },
      );
      account.isDefault = true;
    }
    if (
      dto.sendLimitOverrideEnabled !== undefined ||
      dto.sendLimitOverrideMaxEmailsPerHour !== undefined ||
      dto.sendLimitOverrideMaxEmailsPerDay !== undefined
    ) {
      const enabled = dto.sendLimitOverrideEnabled === true;
      const rawHour = dto.sendLimitOverrideMaxEmailsPerHour;
      const rawDay = dto.sendLimitOverrideMaxEmailsPerDay;
      const maxEmailsPerHour =
        rawHour === null || rawHour === undefined
          ? null
          : Math.max(1, Math.floor(Number(rawHour)));
      const maxEmailsPerDay =
        rawDay === null || rawDay === undefined
          ? null
          : Math.max(
            maxEmailsPerHour || 1,
            Math.floor(Number(rawDay)),
          );
      account.sendLimitOverride = {
        enabled,
        maxEmailsPerHour,
        maxEmailsPerDay,
      };
    }

    if (dto.accountLabel !== undefined) {
      const isAdmin = await this.isAdminUser(userId);
      if (isAdmin) {
        account.accountLabel = dto.accountLabel;
      }
    }

    if (dto.outreachType !== undefined) {
      if (
        dto.outreachType === 'agency' ||
        dto.outreachType === 'freelancer' ||
        dto.outreachType === 'both'
      ) {
        account.outreachType = dto.outreachType;
      } else if (dto.outreachType === null) {
        account.outreachType = undefined;
      }
    }

    return account.save();
  }

  async deleteAccount(
    userId: string,
    accountId: string,
    userEmail?: string,
  ): Promise<boolean> {
    const account = await this.accountModel.findById(accountId).exec();
    if (!account) return false;
    if (!(await this.canManageMailbox(userId, account, userEmail))) {
      throw new ForbiddenException(
        'Only the mailbox owner or an administrator can remove this account',
      );
    }
    await this.inboxPushService.unregisterPushForAccount(account).catch(
      (err: unknown) => {
        this.logger.warn(
          `Push unregister failed for account ${accountId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    );

    // Soft-disconnect: keep synced inbox/sent copies and CRM timeline links
    // (activity.metadata.inboxEmailId). Hard-deleting messages wiped lead
    // conversation history when users removed + reconnected a mailbox.
    const wasDefault = account.isDefault === true;
    account.isActive = false;
    account.isDefault = false;
    account.imapPassword = '';
    account.smtpPassword = '';
    account.oauthRefreshToken = '';
    account.oauthAccessToken = '';
    account.oauthAccessTokenExpiresAt = undefined;
    account.syncState = {
      ...(account.syncState || {}),
      lastError: 'Disconnected — reconnect to resume sync',
    } as typeof account.syncState;
    account.pushState = undefined;
    await account.save();

    if (wasDefault) {
      const ownerId = account.userId || new Types.ObjectId(userId);
      const next = await this.accountModel.findOne({
        userId: ownerId,
        isActive: true,
      });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    return true;
  }

  /** Case-insensitive mailbox address match for reconnect / revive. */
  private emailExactMatchFilter(email: string): RegExp {
    const escaped = String(email || '')
      .trim()
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private async resolveCrmPortalUser(
    userId: string,
    email?: string,
  ): Promise<Record<string, unknown> | null> {
    const populateRole = {
      path: 'roleId',
      populate: { path: 'permissions' },
    };
    if (Types.ObjectId.isValid(userId)) {
      const byId = await this.userModel
        .findById(userId)
        .populate(populateRole)
        .lean()
        .exec();
      if (byId) return byId as unknown as Record<string, unknown>;
    }
    const em = String(email || '').trim();
    if (em) {
      const byEmail = await this.userModel
        .findOne({
          email: {
            $regex: new RegExp(
              `^${this.escapeRegex(em)}$`,
              'i',
            ),
          },
        })
        .populate(populateRole)
        .lean()
        .exec();
      if (byEmail) return byEmail as unknown as Record<string, unknown>;
    }
    return null;
  }

  private async isAdminUser(userId: string, email?: string): Promise<boolean> {
    const crmUser = await this.resolveCrmPortalUser(userId, email);
    if (hasCrmAdminFromDbUser(crmUser)) return true;
    return false;
  }

  private async isStrictAdminUser(userId: string, email?: string): Promise<boolean> {
    let user = await this.userModel.findById(userId).lean().exec();
    if (!user && email) {
      user = await this.userModel.findOne({ email }).lean().exec();
    }
    if (!user) return false;
    const raw = user.role;
    const s =
      raw != null &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        'name' in raw
        ? String((raw as { name?: unknown }).name ?? '')
        : String(raw ?? '');
    const r = s
      .trim()
      .toUpperCase()
      .replace(/[\s\-_]+/g, '');
    return (
      r === 'ADMIN' ||
      r === 'ADMINISTRATOR' ||
      r === 'SUPERADMIN' ||
      r === 'CEO' ||
      r === 'CTO' ||
      r === 'OWNER'
    );
  }

  async findAccountsByUser(
    userId: string,
    email?: string,
  ): Promise<UserEmailAccount[]> {
    const isAdmin = await this.isAdminUser(userId, email);
    if (isAdmin) {
      return this.accountModel
        .find({ isActive: true })
        .sort({ isDefault: -1, createdAt: 1 })
        .select(
          '-imapPassword -smtpPassword -oauthRefreshToken -oauthAccessToken',
        )
        .exec();
    }

    const uId = new Types.ObjectId(userId);
    let user = await this.userModel.findById(uId).lean().exec();

    // Fallback: Resolve by email if ID lookup failed (resolves HRMS vs CRM ID mismatches)
    if (!user && email) {
      user = await this.userModel.findOne({ email }).lean().exec();
    }

    this.logger.log(
      `Resolving mailbox access for user ${userId} (${email || user?.email || 'unknown'}). DB Record: ${!!user}, Admin: ${isAdmin}, Accessible Count: ${user?.accessibleEmailAccounts?.length ?? 0}`,
    );

    const allowedAccountIds = (user?.accessibleEmailAccounts || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    // When found via email fallback, the CRM user's actual _id may differ from the HRMS userId
    const resolvedId = user?._id
      ? new Types.ObjectId(user._id.toString())
      : uId;

    const ownerOrSharedFilter = [
      { userId: uId },
      { sharedWithUserIds: uId },
    ] as any[];

    // Add resolved CRM ID if it differs from the HRMS ID (email fallback case)
    if (resolvedId.toString() !== uId.toString()) {
      ownerOrSharedFilter.push({ userId: resolvedId });
      ownerOrSharedFilter.push({ sharedWithUserIds: resolvedId });
    }

    if (allowedAccountIds.length > 0) {
      ownerOrSharedFilter.push({ _id: { $in: allowedAccountIds } });
    }

    return this.accountModel
      .find({ $or: ownerOrSharedFilter, isActive: true })
      .sort({ isDefault: -1, createdAt: 1 })
      .select(
        '-imapPassword -smtpPassword -oauthRefreshToken -oauthAccessToken',
      )
      .exec();
  }

  async getAccountWithCredentials(
    userId: string,
    accountId: string,
    userEmail?: string, // Added for robustness against ID mismatches
  ): Promise<UserEmailAccountDocument | null> {
    const uId = new Types.ObjectId(userId);
    const isAdmin = await this.isAdminUser(userId, userEmail);
    const filter: any = { _id: new Types.ObjectId(accountId) };
    if (!isAdmin) {
      let user = await this.userModel.findById(uId).lean().exec();
      if (!user && userEmail) {
        user = await this.userModel.findOne({ email: userEmail }).lean().exec();
      }

      const allowedAccountIds = (user?.accessibleEmailAccounts || [])
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const resolvedId = user?._id
        ? new Types.ObjectId(user._id.toString())
        : uId;

      const ownerOrSharedFilter = [
        { userId: uId },
        { sharedWithUserIds: uId },
      ] as any[];

      if (resolvedId.toString() !== uId.toString()) {
        ownerOrSharedFilter.push({ userId: resolvedId });
        ownerOrSharedFilter.push({ sharedWithUserIds: resolvedId });
      }

      if (allowedAccountIds.length > 0) {
        ownerOrSharedFilter.push({ _id: { $in: allowedAccountIds } });
      }

      filter.$or = ownerOrSharedFilter;
    }
    return this.accountModel.findOne(filter).exec();
  }

  /** First active mailbox the user may send from (owned, shared, or accessible). */
  async getPreferredSendAccountId(
    userId: string,
    userEmail?: string,
  ): Promise<string | null> {
    const accounts = await this.findAccountsByUser(userId, userEmail);
    const first = (Array.isArray(accounts) ? accounts : []).find(
      (a: { isActive?: boolean; _id?: unknown }) => a?.isActive !== false,
    ) as { _id?: { toString(): string } } | undefined;
    return first?._id ? String(first._id) : null;
  }

  async syncInbox(
    userId: string,
    accountId: string,
    folder: string = 'INBOX',
    limit: number = 100,
    userEmail?: string,
    options?: { skipLock?: boolean },
  ): Promise<SyncInboxResult> {
    if (!options?.skipLock) {
      const acquired = await this.acquireAccountSyncLock(accountId);
      if (!acquired) {
        this.logger.debug(`Skipping inbox sync for ${accountId} — lock held`);
        return { synced: 0, lockSkipped: true };
      }
      try {
        const synced = await this.syncInboxUnlocked(
          userId,
          accountId,
          folder,
          limit,
          userEmail,
        );
        return { synced, lockSkipped: false };
      } finally {
        await this.releaseAccountSyncLock(accountId);
      }
    }

    const synced = await this.syncInboxUnlocked(
      userId,
      accountId,
      folder,
      limit,
      userEmail,
    );
    return { synced, lockSkipped: false };
  }

  private async syncInboxUnlocked(
    userId: string,
    accountId: string,
    folder: string = 'INBOX',
    limit: number = 100,
    userEmail?: string,
  ): Promise<number> {
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) throw new Error('Account not found');

    try {
      if (
        account.authType === 'oauth' &&
        account.provider === 'outlook' &&
        account.microsoftGraphMail
      ) {
        return await this.syncInboxMicrosoftGraph(
          userId,
          account,
          folder,
          limit,
        );
      }

      let synced = 0;
      const client = await this.openImapClient(account);
      try {
      const mailbox = await client.mailboxOpen(folder);
      if (mailbox.uidValidity) {
        await this.handleImapUidValidityChange(
          account,
          folder,
          Number(mailbox.uidValidity),
        );
      }
      if (mailbox.exists === 0) {
        account.lastSyncedAt = new Date();
        this.markAccountSyncSuccess(account, 0);
        await account.save();
        return 0;
      }
      const start = Math.max(1, mailbox.exists - limit + 1);
      const range = `${start}:${mailbox.exists}`;

      const uidRows: Array<{ uid: number; flags: unknown }> = [];
      for await (const msg of client.fetch(range, { uid: true, flags: true })) {
        uidRows.push({ uid: msg.uid, flags: msg.flags });
      }

      const existingRows = await this.inboxEmailModel
        .find({
          accountId: account._id,
          folder,
          messageId: { $in: uidRows.map((row) => String(row.uid)) },
        })
        .select('messageId isRead')
        .lean()
        .exec();
      const existingSet = new Set(existingRows.map((row) => row.messageId));

      for (const row of uidRows) {
        if (!existingSet.has(String(row.uid))) continue;
        const isSeen =
          row.flags instanceof Set
            ? row.flags.has('\\Seen')
            : Array.isArray(row.flags)
              ? (row.flags as string[]).includes('\\Seen')
              : false;
        if (!isSeen) continue;
        const existing = existingRows.find(
          (entry) => entry.messageId === String(row.uid),
        );
        if (existing && !existing.isRead) {
          await this.inboxEmailModel.updateOne(
            { accountId: account._id, messageId: String(row.uid), folder },
            { $set: { isRead: true } },
          );
        }
      }

      const newUids = uidRows
        .map((row) => row.uid)
        .filter((uid) => !existingSet.has(String(uid)));
      if (newUids.length === 0) {
        account.lastSyncedAt = new Date();
        this.markAccountSyncSuccess(account, 0);
        await account.save();
        return 0;
      }

      const list = client.fetch(
        newUids,
        { uid: true, envelope: true, source: true, flags: true },
        { uid: true },
      );

      for await (const msg of list) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const pm = parsed as {
            messageId?: string;
            inReplyTo?: string | string[];
            references?: string | string[];
          };
          const body = parsed.text || parsed.html || '';
          const bodyHtml = parsed.html || '';

          const inReplyToRaw = pm.inReplyTo
            ? Array.isArray(pm.inReplyTo)
              ? pm.inReplyTo.map((x) => String(x)).join(' ')
              : String(pm.inReplyTo)
            : '';
          const referencesRaw = pm.references
            ? Array.isArray(pm.references)
              ? pm.references.map((x) => String(x)).join(' ')
              : String(pm.references)
            : '';

          // Extract attachment metadata only — do NOT store the buffer in DB
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const attachmentMeta = (parsed.attachments || []).map((att: any, idx: number) => {
            const a = att as any;
            const cid = String(a.cid || '')
              .replace(/^<|>$/g, '')
              .trim();
            const isInline =
              a.related === true ||
              String(a.contentDisposition || '').toLowerCase() === 'inline' ||
              !!cid;
            const filename =
              String(a.filename || '').trim() ||
              (cid ? cid.split('@')[0] : '') ||
              (isInline ? `inline-image-${idx + 1}` : `attachment-${idx}`);
            const rawType = String(a.contentType || '').trim().toLowerCase();
            const contentType =
              rawType && rawType !== 'application/octet-stream'
                ? rawType
                : isInline
                  ? this.guessAttachmentContentType(
                      /\.[a-z0-9]+$/i.test(filename)
                        ? filename
                        : `${filename}.png`,
                    )
                  : this.guessAttachmentContentType(filename);
            return {
              id: `imap-${msg.uid}-${idx}`,
              filename,
              size: a.size ?? (a.content?.length ?? 0),
              contentType,
              ...(cid ? { cid } : {}),
              ...(isInline ? { isInline: true } : {}),
            };
          });

          const classification = await this.classificationService.classify(
            {
              from: parsed.from?.addresses?.[0]?.address || parsed.from?.text || '',
              subject: parsed.subject || '(No subject)',
              body,
              bodyHtml,
              meta: {
                headers: (parsed as any).headers instanceof Map ? Object.fromEntries((parsed as any).headers) : (parsed as any).headers,
                isReplyToUser: !!inReplyToRaw,
              }
            },
            userId
          );

          const imapHeaders =
            (parsed as any).headers instanceof Map
              ? Object.fromEntries((parsed as any).headers)
              : ((parsed as any).headers as Record<string, unknown>) || {};
          const inviteDetect = this.detectMeetingInvite({
            subject: parsed.subject || '(No subject)',
            body,
            bodyHtml,
            attachments: attachmentMeta,
            headers: imapHeaders,
          });

          const rfcMessageId = pm.messageId
            ? this.normalizeRfcMessageId(String(pm.messageId))
            : undefined;
          const toAddr =
            parsed.to?.addresses?.[0]?.address || parsed.to?.text || '';
          const reconciled = await this.reconcileSyncedSentEmail(
            account._id,
            folder,
            String(msg.uid),
            {
              rfcMessageId,
              subject: parsed.subject || '(No subject)',
              to: toAddr,
              date: parsed.date || new Date(),
            },
          );

          // Prefer IMAP \Seen for initial read state; never force unread on re-sync
          const isSeen =
            msg.flags instanceof Set
              ? msg.flags.has('\\Seen')
              : Array.isArray(msg.flags)
                ? (msg.flags as string[]).includes('\\Seen')
                : false;

          const reconciledMeta = reconciled
            ? (
                await this.inboxEmailModel
                  .findById(reconciled._id)
                  .select('meta categoryOverride')
                  .lean()
                  .exec()
              )
            : null;
          const mergedMeta = this.mergeSyncMeta(
            reconciledMeta?.meta as Record<string, unknown> | undefined,
            {
              envelope: msg.envelope,
              rfcMessageId,
              uidValidity: Number(mailbox.uidValidity),
              crmLocalCopy: false,
              inReplyTo: inReplyToRaw
                ? inReplyToRaw.replace(/[<>]/g, '')
                : undefined,
              references: pm.references,
              ...(attachmentMeta.length ? { attachments: attachmentMeta } : {}),
            },
          );

          const result = await this.inboxEmailModel.findOneAndUpdate(
            reconciled
              ? { _id: reconciled._id }
              : {
              accountId: account._id,
              messageId: String(msg.uid),
              folder,
            },
            {
              $set: {
                userId: new Types.ObjectId(userId), // Keep userId as the latest syncer
                from:
                  parsed.from?.addresses?.[0]?.address ||
                  parsed.from?.text ||
                  '',
                fromName: parsed.from?.addresses?.[0]?.name || '',
                to: parsed.to?.addresses?.[0]?.address || parsed.to?.text || '',
                toName: parsed.to?.addresses?.[0]?.name || '',
                subject: parsed.subject || '(No subject)',
                body,
                bodyHtml,
                date: parsed.date || new Date(),
                hasAttachments: (parsed.attachments?.length || 0) > 0,
                isMeetingInvite: inviteDetect.isMeetingInvite,
                ...(inviteDetect.inviteMethod
                  ? { inviteMethod: inviteDetect.inviteMethod }
                  : {}),
                ...(inviteDetect.inviteSummary
                  ? { inviteSummary: inviteDetect.inviteSummary }
                  : {}),
                ...this.classificationFieldsFromResult(
                  classification,
                  reconciledMeta,
                ),
                meta: mergedMeta,
              },
              $setOnInsert: {
                isRead: isSeen,
              },
            },
            { upsert: true, new: true, includeResultMetadata: true },
          );
          const saved = result.value;
          const isNewInsert = !result.lastErrorObject?.updatedExisting;
          if (saved && isSeen && !saved.isRead) {
            await this.inboxEmailModel.updateOne(
              { _id: saved._id },
              { $set: { isRead: true } },
            );
            saved.isRead = true;
          }
          if (saved) {
            await this.maybeLogInboundCrmActivity(
              userId,
              account,
              folder,
              saved,
              {
                inReplyTo: inReplyToRaw,
                references: referencesRaw,
              },
            );
          }
          if (isNewInsert) synced++;
        } catch (e) {
          this.logger.warn(`Failed to parse message ${msg.uid}: ${e}`);
        }
      }

        account.lastSyncedAt = new Date();
        this.markAccountSyncSuccess(account, synced);
        await account.save();
      } finally {
        await client.logout();
      }

      return synced;
    } catch (err) {
      await this.recordSyncFailure(account._id, err);
      throw err;
    }
  }

  /** Sync Inbox, Sent, Drafts, Trash, Spam - discovers folders via IMAP list */
  async syncAllFolders(
    userId: string,
    accountId: string,
    limit: number = 500,
    userEmail?: string,
  ): Promise<{
    total: number;
    byFolder: Record<string, number>;
    lockSkipped?: boolean;
    errors?: Record<string, string>;
  }> {
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) throw new Error('Account not found');

    const acquired = await this.acquireAccountSyncLock(accountId, 600);
    if (!acquired) {
      return {
        total: 0,
        byFolder: {},
        lockSkipped: true,
        errors: { _lock: 'Sync already in progress for this mailbox' },
      };
    }

    try {
    if (
      account.authType === 'oauth' &&
      account.provider === 'outlook' &&
      account.microsoftGraphMail
    ) {
      const folders = [
        'inbox',
        'sentitems',
        'drafts',
        'deleteditems',
        'junkemail',
      ];
      const byFolder: Record<string, number> = {};
      const errors: Record<string, string> = {};
      let total = 0;
      for (const f of folders) {
        try {
          const { synced } = await this.syncInbox(
            userId,
            accountId,
            f,
            limit,
            userEmail,
            { skipLock: true },
          );
          byFolder[f] = synced;
          total += synced;
        } catch (e) {
          const msg = this.syncErrorMessage(e);
          errors[f] = msg;
          this.logger.warn(`Graph sync folder ${f}: ${msg}`);
        }
      }
      const acc = await this.getAccountWithCredentials(
        userId,
        accountId,
        userEmail,
      );
      if (acc) {
        acc.lastSyncedAt = new Date();
        if (Object.keys(errors).length && total === 0) {
          await this.recordSyncFailure(acc._id, errors.sentitems || Object.values(errors)[0]);
        } else {
          this.markAccountSyncSuccess(acc, total);
        }
        await acc.save();
      }
      return {
        total,
        byFolder,
        ...(Object.keys(errors).length ? { errors } : {}),
      };
    }

    const standardFolders = new Set<string>(['INBOX']);
    const client = await this.openImapClient(account);
    try {
      const mailboxes = await client.list();
      for (const mb of mailboxes) {
        const path = mb.path;
        const flags = mb.flags ? [...mb.flags].map(String) : [];
        const hasInbox =
          path.toUpperCase() === 'INBOX' ||
          flags.some((f) => /\\Inbox/i.test(String(f)));
        const hasSent = flags.some((f) => /\\Sent/i.test(String(f)));
        const hasDrafts = flags.some((f) => /\\Drafts/i.test(String(f)));
        const hasTrash = flags.some((f) => /\\Trash/i.test(String(f)));
        const hasJunk = flags.some((f) => /\\Junk/i.test(String(f)));
        if (hasInbox || hasSent || hasDrafts || hasTrash || hasJunk)
          standardFolders.add(path);
      }
    } finally {
      try {
        await client.logout();
      } catch (_) { }
    }

    const byFolder: Record<string, number> = {};
    const errors: Record<string, string> = {};
    let total = 0;
    for (const path of standardFolders) {
      try {
        const { synced } = await this.syncInbox(
          userId,
          accountId,
          path,
          limit,
          userEmail,
          { skipLock: true },
        );
        byFolder[path] = synced;
        total += synced;
      } catch (e) {
        const msg = this.syncErrorMessage(e);
        errors[path] = msg;
        this.logger.warn(`Sync failed for folder ${path}: ${msg}`);
      }
    }

    const acc = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (acc) {
      acc.lastSyncedAt = new Date();
      if (Object.keys(errors).length && total === 0) {
        await this.recordSyncFailure(
          acc._id,
          errors.INBOX || Object.values(errors)[0],
        );
      } else {
        this.markAccountSyncSuccess(acc, total);
      }
      await acc.save();
    }
    return {
      total,
      byFolder,
      ...(Object.keys(errors).length ? { errors } : {}),
    };
    } finally {
      await this.releaseAccountSyncLock(accountId);
    }
  }

  /**
   * Parses optional ISO date bounds from query params (client should send local day start/end as ISO strings).
   */
  private inboxDateBounds(
    dateFrom?: string,
    dateTo?: string,
  ): { $gte?: Date; $lte?: Date } | null {
    const bounds: { $gte?: Date; $lte?: Date } = {};
    if (dateFrom?.trim()) {
      const d = new Date(dateFrom.trim());
      if (!isNaN(d.getTime())) bounds.$gte = d;
    }
    if (dateTo?.trim()) {
      const d = new Date(dateTo.trim());
      if (!isNaN(d.getTime())) bounds.$lte = d;
    }
    return bounds.$gte || bounds.$lte ? bounds : null;
  }

  /**
   * Inbox list / thread sidebar: short preview + account populate. Avoids loading
   * multi‑MB `body` / `bodyHtml` per row (major inbox UI cost). Full content is
   * loaded via {@link getInboxEmailByIdForUser} when opening a message.
   */
  private async aggregateInboxEmailPreviewRows(
    filter: Record<string, unknown>,
    options: {
      sortDate: 1 | -1;
      skip?: number;
      limit?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    const accountColl = this.accountModel.collection.name;
    const previewLen = 800;
    const pipeline: PipelineStage[] = [
      { $match: filter },
      { $sort: { date: options.sortDate } },
    ];
    if (options.skip && options.skip > 0) {
      pipeline.push({ $skip: options.skip });
    }
    if (options.limit && options.limit > 0) {
      pipeline.push({ $limit: options.limit });
    }
    pipeline.push(
      {
        $addFields: {
          _previewText: {
            $cond: {
              if: { $gt: [{ $strLenCP: { $ifNull: ['$body', ''] } }, 0] },
              then: '$body',
              else: { $ifNull: ['$bodyHtml', ''] },
            },
          },
        },
      },
      {
        $project: {
          accountId: 1,
          userId: 1,
          messageId: 1,
          folder: 1,
          from: 1,
          fromName: 1,
          to: 1,
          toName: 1,
          subject: 1,
          date: 1,
          isRead: 1,
          hasAttachments: 1,
          relationshipLabel: 1,
          category: 1,
          categoryOverride: 1,
          meta: 1,
          createdAt: 1,
          updatedAt: 1,
          body: { $substrCP: ['$_previewText', 0, previewLen] },
          bodyHtml: { $literal: '' },
        },
      },
      {
        $lookup: {
          from: accountColl,
          localField: 'accountId',
          foreignField: '_id',
          pipeline: [
            { $project: { email: 1, displayName: 1, provider: 1 } },
          ],
          as: '_acc',
        },
      },
      {
        $unwind: { path: '$_acc', preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: { accountId: '$_acc' },
      },
      { $project: { _acc: 0 } },
    );
    return this.inboxEmailModel.aggregate(pipeline).exec();
  }

  /** Paginated merged view of provider-synced drafts + local CRM compose drafts. */
  private async aggregateMergedDraftsPage(
    syncedFilter: Record<string, unknown>,
    localFilter: Record<string, unknown>,
    options: {
      skip: number;
      limit: number;
      fromLabel: string;
      fromName: string;
      userId: string;
    },
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const emailColl = this.emailModel.collection.name;
    const accountColl = this.accountModel.collection.name;
    const previewLen = 800;
    const userOid = new Types.ObjectId(options.userId);

    const [totalSynced, totalLocal] = await Promise.all([
      this.inboxEmailModel.countDocuments(syncedFilter),
      this.emailModel.countDocuments(localFilter),
    ]);

    const localUnionPipeline: PipelineStage.UnionWithPipelineStage[] = [
      { $match: localFilter },
      {
        $addFields: {
          _sortDate: { $ifNull: ['$updatedAt', '$createdAt'] },
          _previewText: { $ifNull: ['$body', ''] },
        },
      },
      {
        $project: {
          _id: 1,
          userId: { $literal: userOid },
          messageId: {
            $concat: ['local-draft-', { $toString: '$_id' }],
          },
          from: { $literal: options.fromLabel },
          fromName: { $literal: options.fromName },
          to: '$recipient',
          toName: { $literal: '' },
          subject: { $ifNull: ['$subject', '(No Subject)'] },
          folder: { $literal: 'Drafts' },
          date: '$_sortDate',
          accountId: 1,
          isRead: { $literal: true },
          hasAttachments: { $literal: false },
          relationshipLabel: { $literal: null },
          category: { $literal: null },
          categoryOverride: { $literal: null },
          meta: {
            isLocalDraft: true,
            recipient: '$recipient',
            module: '$module',
            entityId: '$entityId',
          },
          createdAt: 1,
          updatedAt: 1,
          body: { $substrCP: ['$_previewText', 0, previewLen] },
          bodyHtml: { $literal: '' },
        },
      },
    ];

    const pipeline: PipelineStage[] = [
      { $match: syncedFilter },
      {
        $addFields: {
          _previewText: {
            $cond: {
              if: { $gt: [{ $strLenCP: { $ifNull: ['$body', ''] } }, 0] },
              then: '$body',
              else: { $ifNull: ['$bodyHtml', ''] },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          messageId: 1,
          folder: 1,
          from: 1,
          fromName: 1,
          to: 1,
          toName: 1,
          subject: 1,
          date: 1,
          accountId: 1,
          isRead: 1,
          hasAttachments: 1,
          relationshipLabel: 1,
          category: 1,
          categoryOverride: 1,
          meta: 1,
          createdAt: 1,
          updatedAt: 1,
          body: { $substrCP: ['$_previewText', 0, previewLen] },
          bodyHtml: { $literal: '' },
        },
      },
      {
        $unionWith: {
          coll: emailColl,
          pipeline: localUnionPipeline,
        },
      },
      { $sort: { date: -1 } },
      { $skip: options.skip },
      { $limit: options.limit },
      {
        $lookup: {
          from: accountColl,
          localField: 'accountId',
          foreignField: '_id',
          pipeline: [{ $project: { email: 1, displayName: 1, provider: 1 } }],
          as: '_acc',
        },
      },
      {
        $addFields: {
          accountId: {
            $cond: {
              if: { $gt: [{ $size: '$_acc' }, 0] },
              then: { $arrayElemAt: ['$_acc', 0] },
              else: {
                _id: {
                  $toString: { $ifNull: ['$accountId', 'local-crm-storage'] },
                },
                email: 'local@crm-storage',
                displayName: 'Local CRM Storage',
                provider: 'local',
              },
            },
          },
        },
      },
      { $project: { _acc: 0, _previewText: 0, _sortDate: 0 } },
    ];

    const rows = await this.inboxEmailModel.aggregate(pipeline).exec();
    return { rows, total: totalSynced + totalLocal };
  }

  async getInboxEmails(
    userId: string,
    options: {
      accountId?: string;
      folder?: string;
      folderType?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'business' | 'promotional' | 'social' | 'other';
      relationshipLabel?: 'freelancer' | 'agency' | 'both';
      accountOutreachType?: 'freelancer' | 'agency' | 'both';
      page?: number;
      pageSize?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      userEmail?: string; // Added for robustness against ID mismatches
    } = {},
  ): Promise<{ emails: InboxEmail[]; total: number }> {
    const { isAdmin, ownerOrSharedFilter, resolvedUserId } =
      await this.resolveMailboxAccessFilter(userId, options.userEmail);

    const accessibleAccounts = await this.accountModel
      .find({
        $or: isAdmin ? [{}] : ownerOrSharedFilter,
        isActive: true,
      })
      .select('_id')
      .lean()
      .exec();
    let scopedAccountIds = accessibleAccounts.map((a) => a._id);

    if (options.accountOutreachType) {
      const typedAccounts = await this.accountModel
        .find({
          _id: { $in: scopedAccountIds },
          outreachType: { $in: [options.accountOutreachType, 'both'] },
          isActive: true,
        })
        .select('_id')
        .lean()
        .exec();
      scopedAccountIds = typedAccounts.map((a) => a._id);
    }

    const filter: any = { accountId: { $in: scopedAccountIds } };
    if (options.accountId) {
      const targetId = new Types.ObjectId(options.accountId);
      const allowed = scopedAccountIds.some((id) => id.equals(targetId));
      if (!allowed) {
        return { emails: [], total: 0 };
      }
      filter.accountId = targetId;
    }

    const categories = ['business', 'promotional', 'social', 'other'];
    if (options.folderType && categories.includes(options.folderType)) {
      filter.$expr = {
        $eq: [
          { $ifNull: ['$categoryOverride', '$category'] },
          options.folderType,
        ],
      };
      // When filtering by category, show both Inbox and Sent folders
      filter.folder = { $in: [...FOLDER_NAMES.inbox, ...FOLDER_NAMES.sent] };
    } else if (options.folder) {
      filter.folder = options.folder;
    } else if (options.folderType && options.folderType === 'inbox') {
      filter.folder = { $in: FOLDER_NAMES.inbox };
    } else if (options.folderType && options.folderType in FOLDER_NAMES) {
      filter.folder = { $in: FOLDER_NAMES[options.folderType] };
    }

    const dateBounds = this.inboxDateBounds(options.dateFrom, options.dateTo);
    if (dateBounds) {
      filter.date = dateBounds;
    }

    if (options.relationshipLabel) {
      filter.relationshipLabel = options.relationshipLabel;
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    if (options.search) {
      filter.$or = [
        { subject: { $regex: options.search, $options: 'i' } },
        { from: { $regex: options.search, $options: 'i' } },
        { fromName: { $regex: options.search, $options: 'i' } },
        { to: { $regex: options.search, $options: 'i' } },
        { body: { $regex: options.search, $options: 'i' } },
      ];
    }

    const isDraftsFolder =
      options.folderType === 'drafts' ||
      (options.folder &&
        FOLDER_NAMES.drafts.some((n) => options.folder?.includes(n)));

    if (isDraftsFolder) {
      const draftAccountIds = options.accountId
        ? [new Types.ObjectId(options.accountId)]
        : scopedAccountIds;

      const localFilter: Record<string, unknown> = {
        accountId: { $in: draftAccountIds },
        status: 'draft',
        sender: resolvedUserId,
      };

      if (options.search) {
        const searchRegex = new RegExp(options.search, 'i');
        localFilter.$and = [
          {
            $or: [
              { subject: searchRegex },
              { recipient: searchRegex },
              { body: searchRegex },
            ],
          },
        ];
      }

      if (dateBounds) {
        localFilter.updatedAt = dateBounds;
      }

      const user = await this.userModel.findById(resolvedUserId).lean().exec();
      const fromLabel = user
        ? `${user.firstName || ''} ${user.lastName || ''} <${user.email}>`.trim()
        : 'Me <local@storage>';
      const fromName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'Me';

      const { rows, total } = await this.aggregateMergedDraftsPage(
        filter,
        localFilter,
        {
          skip,
          limit: pageSize,
          fromLabel,
          fromName,
          userId: resolvedUserId.toString(),
        },
      );

      return {
        emails: rows as unknown as InboxEmail[],
        total,
      };
    }

    const [emails, total] = await Promise.all([
      this.aggregateInboxEmailPreviewRows(filter, {
        sortDate: -1,
        skip,
        limit: pageSize,
      }),
      this.inboxEmailModel.countDocuments(filter),
    ]);

    return { emails: emails as unknown as InboxEmail[], total };

  }

  /**
   * Single synced inbox message for reply-from-timeline (same access rules as {@link getInboxEmails}).
   */
  async getInboxEmailByIdForUser(
    userId: string,
    emailId: string,
    userEmail?: string, // Added for robustness against ID mismatches
  ): Promise<InboxEmail | null> {
    if (!Types.ObjectId.isValid(emailId)) return null;
    const { isAdmin, ownerOrSharedFilter } =
      await this.resolveMailboxAccessFilter(userId, userEmail);

    const accessibleAccounts = await this.accountModel
      .find({
        $or: isAdmin ? [{}] : ownerOrSharedFilter,
        isActive: true,
      })
      .select('_id')
      .lean()
      .exec();
    const accountIds = accessibleAccounts.map((a) => a._id);
    if (!accountIds.length) return null;

    const doc = await this.inboxEmailModel
      .findOne({
        _id: new Types.ObjectId(emailId),
        accountId: { $in: accountIds },
      })
      .populate('accountId', 'email displayName provider')
      .lean()
      .exec();
    return doc as InboxEmail | null;
  }

  async deleteInboxEmail(userId: string, emailId: string, userEmail?: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(emailId)) {
      throw new BadRequestException('Invalid email id');
    }

    const email = await this.getInboxEmailByIdForUser(userId, emailId, userEmail);
    if (email) {
      const accountRef = (email as any).accountId;
      const accountOid =
        accountRef && typeof accountRef === 'object' && accountRef._id
          ? new Types.ObjectId(String(accountRef._id))
          : new Types.ObjectId(String(accountRef));
      const account = await this.accountModel.findById(accountOid).exec();
      if (!account) {
        throw new NotFoundException('Mailbox account not found');
      }
      const canDelete =
        (await this.isAdminUser(userId, userEmail)) ||
        (await this.canManageMailbox(userId, account, userEmail));
      if (!canDelete) {
        throw new ForbiddenException(
          'Only the mailbox owner or an administrator can delete this message',
        );
      }
      const result = await this.inboxEmailModel.findByIdAndDelete(emailId).exec();
      return !!result;
    }

    const { isAdmin, ownerOrSharedFilter, resolvedUserId } =
      await this.resolveMailboxAccessFilter(userId, userEmail);

    const draft = await this.emailModel
      .findOne({
        _id: new Types.ObjectId(emailId),
        status: 'draft',
        sender: resolvedUserId,
      })
      .lean()
      .exec();
    if (!draft) {
      throw new NotFoundException('Email not found');
    }

    if (draft.accountId) {
      const allowed = await this.accountModel
        .findOne({
          _id: draft.accountId,
          isActive: true,
          ...(isAdmin ? {} : { $or: ownerOrSharedFilter }),
        })
        .select('_id')
        .lean()
        .exec();
      if (!allowed) {
        throw new NotFoundException('Email not found');
      }
    }

    const result = await this.emailModel
      .findOneAndDelete({
        _id: new Types.ObjectId(emailId),
        status: 'draft',
        sender: resolvedUserId,
      })
      .exec();
    return !!result;
  }

  /**
   * Fetch a single "thread" view (HubSpot-style) by participant: returns both inbound + outbound
   * messages between the connected account and the participant across Inbox + Sent folders.
   * This intentionally does not rely on provider-specific thread ids so it works for IMAP + Graph.
   */
  async getConversationEmails(
    userId: string,
    accountId: string,
    participantEmail: string,
    options: { limit?: number; userEmail?: string } = {},
  ): Promise<InboxEmail[]> {
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      options.userEmail,
    );
    if (!account) throw new Error('Account not found');

    const our = String(account.email || '').trim().toLowerCase();
    const peer = String(participantEmail || '').trim().toLowerCase();
    if (!our || !peer || !peer.includes('@')) return [];

    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ourRe = new RegExp(`(^|[^\\w@])${esc(our)}([^\\w@]|$)`, 'i');
    const peerRe = new RegExp(`(^|[^\\w@])${esc(peer)}([^\\w@]|$)`, 'i');

    const filter: Record<string, unknown> = {
      accountId: new Types.ObjectId(accountId),
      folder: { $in: [...FOLDER_NAMES.inbox, ...FOLDER_NAMES.sent] },
      $or: [
        // inbound: peer -> our
        { from: peerRe, to: ourRe },
        // outbound: our -> peer
        { from: ourRe, to: peerRe },
      ],
    };

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const rows = await this.aggregateInboxEmailPreviewRows(filter, {
      sortDate: 1,
      skip: 0,
      limit,
    });
    return rows as unknown as InboxEmail[];
  }

  /** Emails on a lead/contact/client row (primary + additional), deduped. */
  private collectEntityEmails(
    primary?: string,
    additional?: string[],
    invalid?: string[],
  ): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const blocked = new Set(
      (invalid || [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e.includes('@')),
    );
    for (const e of [primary, ...(additional || [])]) {
      const t = String(e || '').trim();
      if (!t || !t.includes('@')) continue;
      const low = t.toLowerCase();
      if (blocked.has(low)) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(t);
    }
    return out;
  }

  /** Which address on the record matched the lookup (for display / logging). */
  private matchedEmailOnRecord(
    primary: string | undefined,
    additional: string[] | undefined,
    exactRegex: RegExp,
  ): string {
    const p = (primary || '').trim();
    if (exactRegex.test(p)) return p;
    for (const a of additional || []) {
      const t = String(a || '').trim();
      if (exactRegex.test(t)) return t;
    }
    return p;
  }

  /**
   * Typeahead for inbox compose: search leads, contacts, and clients by name or email.
   * Returns every email on each matching record so the UI can add primary + additional at once.
   */
  async searchComposeRecipients(rawQuery: string): Promise<
    Array<{
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      emails: string[];
    }>
  > {
    const q = (rawQuery || '').trim();
    if (q.length < 2) return [];
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');

    const [leads, contacts, clients] = await Promise.all([
      this.leadModel
        .find({
          $or: [
            { firstName: re },
            { lastName: re },
            { email: re },
            { additionalEmails: re },
          ],
        })
        .limit(15)
        .select('firstName lastName email additionalEmails invalidEmails')
        .lean()
        .exec(),
      this.contactModel
        .find({
          $or: [
            { firstName: re },
            { lastName: re },
            { email: re },
            { additionalEmails: re },
          ],
        })
        .limit(15)
        .select('firstName lastName email additionalEmails invalidEmails')
        .lean()
        .exec(),
      this.clientModel
        .find({
          $or: [{ name: re }, { email: re }, { additionalEmails: re }],
        })
        .limit(15)
        .select('name email additionalEmails invalidEmails')
        .lean()
        .exec(),
    ]);

    const results: Array<{
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      emails: string[];
    }> = [];

    for (const l of leads) {
      results.push({
        module: 'leads',
        entityId: l._id.toString(),
        label: `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Lead',
        emails: this.collectEntityEmails(
          l.email,
          l.additionalEmails,
          (l as { invalidEmails?: string[] }).invalidEmails,
        ),
      });
    }
    for (const c of contacts) {
      results.push({
        module: 'contacts',
        entityId: c._id.toString(),
        label: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact',
        emails: this.collectEntityEmails(
          c.email,
          c.additionalEmails,
          (c as { invalidEmails?: string[] }).invalidEmails,
        ),
      });
    }
    for (const cl of clients) {
      results.push({
        module: 'clients',
        entityId: cl._id.toString(),
        label: cl.name || 'Client',
        emails: this.collectEntityEmails(
          cl.email,
          cl.additionalEmails,
          (cl as { invalidEmails?: string[] }).invalidEmails,
        ),
      });
    }

    return results.filter((r) => r.emails.length > 0);
  }

  /**
   * Prefer a single CRM record for inbound activity logging.
   * Cross-entity visibility still works via involvedEntities + findActivities rollup.
   */
  private pickPrimaryInboundTargets(
    targets: Array<{
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      email: string;
    }>,
  ): Array<{
    module: 'leads' | 'contacts' | 'clients';
    entityId: string;
    label: string;
    email: string;
  }> {
    if (targets.length <= 1) return targets;
    const order: Array<'leads' | 'contacts' | 'clients'> = [
      'leads',
      'contacts',
      'clients',
    ];
    for (const mod of order) {
      const hit = targets.find((t) => t.module === mod);
      if (hit) return [hit];
    }
    return targets.slice(0, 1);
  }

  async resolveRecipientEmail(email: string): Promise<
    Array<{
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      email: string;
    }>
  > {
    const trimmed = (email || '').trim();
    if (!trimmed || !trimmed.includes('@')) return [];
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}$`, 'i');

    const results: Array<{
      module: 'leads' | 'contacts' | 'clients';
      entityId: string;
      label: string;
      email: string;
    }> = [];

    const emailOrAdditional = {
      $or: [{ email: regex }, { additionalEmails: regex }],
    };
    const [leads, contacts, clients] = await Promise.all([
      this.leadModel.find(emailOrAdditional).limit(25).lean().exec(),
      this.contactModel.find(emailOrAdditional).limit(25).lean().exec(),
      this.clientModel.find(emailOrAdditional).limit(25).lean().exec(),
    ]);

    for (const l of leads) {
      const invalid = new Set(
        ((l as { invalidEmails?: string[] }).invalidEmails || []).map((e) =>
          String(e || '').trim().toLowerCase(),
        ),
      );
      const matched = this.matchedEmailOnRecord(l.email, l.additionalEmails, regex);
      if (invalid.has(matched.toLowerCase())) continue;
      results.push({
        module: 'leads',
        entityId: l._id.toString(),
        label: `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Lead',
        email: matched,
      });
    }
    for (const c of contacts) {
      const invalid = new Set(
        ((c as { invalidEmails?: string[] }).invalidEmails || []).map((e) =>
          String(e || '').trim().toLowerCase(),
        ),
      );
      const matched = this.matchedEmailOnRecord(c.email, c.additionalEmails, regex);
      if (invalid.has(matched.toLowerCase())) continue;
      results.push({
        module: 'contacts',
        entityId: c._id.toString(),
        label: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact',
        email: matched,
      });
    }
    for (const cl of clients) {
      const invalid = new Set(
        ((cl as { invalidEmails?: string[] }).invalidEmails || []).map((e) =>
          String(e || '').trim().toLowerCase(),
        ),
      );
      const matched = this.matchedEmailOnRecord(cl.email, cl.additionalEmails, regex);
      if (invalid.has(matched.toLowerCase())) continue;
      results.push({
        module: 'clients',
        entityId: cl._id.toString(),
        label: cl.name || 'Client',
        email: matched,
      });
    }

    return results;
  }

  /** Suggest inbox account / from-address for follow-up.
   * Prefer last send on this CRM record; fall back to last send to the recipient email.
   */
  async getSuggestedSendFromForRecipient(
    userId: string,
    recipientEmail: string,
    opts?: {
      module?: string;
      entityId?: string;
    },
  ): Promise<{ accountId: string | null; fromEmail: string | null }> {
    const mod = String(opts?.module || '')
      .trim()
      .toLowerCase();
    let entityId = String(opts?.entityId || '').trim();

    // Resolve HubSpot-style recordId → Mongo _id when needed for tracking lookup.
    if (
      entityId &&
      !Types.ObjectId.isValid(entityId) &&
      (mod === 'leads' ||
        mod === 'contacts' ||
        mod === 'organizations')
    ) {
      const doc =
        mod === 'leads'
          ? await this.leadModel
              .findOne({ recordId: entityId })
              .select('_id')
              .lean()
              .exec()
          : mod === 'contacts'
              ? await this.contactModel
                  .findOne({ recordId: entityId })
                  .select('_id')
                  .lean()
                  .exec()
              : await this.clientModel
                  .findOne({ recordId: entityId })
                  .select('_id')
                  .lean()
                  .exec();
      if (doc?._id) entityId = String(doc._id);
    }

    if (
      entityId &&
      Types.ObjectId.isValid(entityId) &&
      (mod === 'leads' ||
        mod === 'contacts' ||
        mod === 'organizations')
    ) {
      const fromRecord =
        await this.emailTrackingService.getLatestOutboundIdentityForCrmRecord(
          entityId,
          mod,
        );
      if (fromRecord?.accountId || fromRecord?.fromEmail) {
        return {
          accountId: fromRecord.accountId,
          fromEmail: fromRecord.fromEmail,
        };
      }
    }
    const row =
      await this.emailTrackingService.getLatestOutboundIdentityForRecipient(
        userId,
        recipientEmail,
      );
    if (!row) return { accountId: null, fromEmail: null };
    return row;
  }

  async sendBulkSmart(
    userId: string,
    data: {
      recipients: Array<{
        email: string;
        name?: string;
        module?: 'leads' | 'contacts' | 'organizations' | 'clients';
        entityId?: string;
      }>;
      subject?: string;
      body?: string;
      cc?: string[];
      bcc?: string[];
      enforceCrmRecipient?: boolean;
      /** Composer-selected mailbox — used when smart rotate pool is empty. */
      preferredAccountId?: string;
      mailboxSplit?: { mode?: 'round_robin' | 'random' | 'sticky_entity'; accountIds?: string[] };
      retryOnSendFail?: boolean;
      fallbackInboxAccountIds?: string[];
      aiDraftPerRecipient?: boolean;
      aiInstructions?: string;
      maxEmailsPerSenderInBatch?: number;
    },
    userEmail?: string,
  ): Promise<{
    success: boolean;
    total: number;
    sent: number;
    failed: number;
    results: Array<{
      email: string;
      name?: string;
      success: boolean;
      accountId?: string;
      error?: string;
    }>;
  }> {
    const recs = Array.isArray(data.recipients) ? data.recipients : [];
    const recipients = recs
      .map((r) => ({
        ...r,
        email: String(r?.email || '').trim(),
        module: (r?.module || 'leads') as 'leads' | 'contacts' | 'organizations' | 'clients',
      }))
      .filter((r) => r.email.includes('@'));
    if (!recipients.length) {
      throw new BadRequestException('At least one valid recipient email is required.');
    }

    const userAccounts = await this.findAccountsByUser(userId, userEmail);
    const activeAccountIds = new Set(
      (Array.isArray(userAccounts) ? userAccounts : [])
        .filter((a: any) => a?.isActive !== false)
        .map((a: any) => String(a._id)),
    );
    const preferredComposerId =
      data.preferredAccountId &&
      activeAccountIds.has(String(data.preferredAccountId))
        ? String(data.preferredAccountId)
        : null;
    const splitIds = Array.isArray(data.mailboxSplit?.accountIds)
      ? data.mailboxSplit!.accountIds.map((x) => String(x)).filter((x) => activeAccountIds.has(x))
      : [];
    const pool = [...new Set(splitIds)];
    const mode = data.mailboxSplit?.mode || 'round_robin';
    const maxPerSenderInBatch =
      Number.isFinite(Number(data.maxEmailsPerSenderInBatch)) &&
        Number(data.maxEmailsPerSenderInBatch) > 0
        ? Math.floor(Number(data.maxEmailsPerSenderInBatch))
        : 0;
    const sentCountByAccount = new Map<string, number>();
    const fallbackIds = Array.isArray(data.fallbackInboxAccountIds)
      ? [...new Set(data.fallbackInboxAccountIds.map((x) => String(x)).filter((x) => activeAccountIds.has(x)))]
      : [];

    let rr = 0;
    const activeAccountList = [...activeAccountIds];
    const pickFromPool = (email: string): string | null => {
      if (!pool.length) return null;
      if (mode === 'random') return pool[Math.floor(Math.random() * pool.length)];
      if (mode === 'sticky_entity') {
        const seed = email.toLowerCase();
        let n = 0;
        for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
        return pool[n % pool.length];
      }
      const out = pool[rr % pool.length];
      rr += 1;
      return out;
    };
    const pickFromActiveAccounts = (): string | null => {
      if (!activeAccountList.length) return null;
      if (mode === 'random') {
        return activeAccountList[
          Math.floor(Math.random() * activeAccountList.length)
        ];
      }
      const out = activeAccountList[rr % activeAccountList.length];
      rr += 1;
      return out;
    };

    const results: Array<{
      email: string;
      name?: string;
      success: boolean;
      accountId?: string;
      error?: string;
    }> = [];
    for (const r of recipients) {
      let accountId =
        (await this.getSuggestedSendFromForRecipient(userId, r.email))?.accountId ||
        null;
      if (
        accountId &&
        maxPerSenderInBatch > 0 &&
        (sentCountByAccount.get(String(accountId)) || 0) >= maxPerSenderInBatch
      ) {
        accountId = null;
      }
      if (!accountId || !activeAccountIds.has(String(accountId))) {
        const poolCandidate = pickFromPool(r.email);
        if (
          poolCandidate &&
          maxPerSenderInBatch > 0 &&
          (sentCountByAccount.get(String(poolCandidate)) || 0) >= maxPerSenderInBatch
        ) {
          const available = pool.find(
            (id) => (sentCountByAccount.get(String(id)) || 0) < maxPerSenderInBatch,
          );
          accountId = available || null;
        } else {
          accountId = poolCandidate;
        }
      }
      if (!accountId && preferredComposerId) {
        accountId = preferredComposerId;
      }
      if (!accountId) {
        const preferred = await this.getPreferredSendAccountId(userId, userEmail);
        if (
          preferred &&
          maxPerSenderInBatch > 0 &&
          (sentCountByAccount.get(String(preferred)) || 0) >= maxPerSenderInBatch
        ) {
          const anyAvailable = activeAccountList.find(
            (id) => (sentCountByAccount.get(String(id)) || 0) < maxPerSenderInBatch,
          );
          accountId = anyAvailable || null;
        } else {
          accountId = preferred;
        }
      }
      if (!accountId) {
        const fromActive = pickFromActiveAccounts();
        if (
          fromActive &&
          maxPerSenderInBatch > 0 &&
          (sentCountByAccount.get(String(fromActive)) || 0) >= maxPerSenderInBatch
        ) {
          accountId =
            activeAccountList.find(
              (id) => (sentCountByAccount.get(String(id)) || 0) < maxPerSenderInBatch,
            ) || null;
        } else {
          accountId = fromActive;
        }
      }
      if (!accountId) {
        results.push({
          email: r.email,
          name: r.name,
          success: false,
          error: 'No connected mailbox account available',
        });
        continue;
      }

      let subject = String(data.subject || '').trim();
      let body = String(data.body || '').trim();
      if (
        data.aiDraftPerRecipient &&
        (r.module === 'leads' || r.module === 'contacts') &&
        r.entityId &&
        Types.ObjectId.isValid(String(r.entityId))
      ) {
        try {
          const draft = await this.crmAiService.draftAutomatedPersonOutreachEmail(
            r.module,
            String(r.entityId),
            (data.aiInstructions || '').trim() || undefined,
          );
          subject = draft.subject;
          body = draft.bodyHtml;
        } catch (e: any) {
          this.logger.warn(`AI draft failed for ${r.email}: ${e?.message || e}`);
        }
      }
      if (!subject) subject = 'Quick follow up';
      if (!body) body = '<p>Hello, following up on my previous message.</p>';

      const attemptOrder = [String(accountId), ...fallbackIds.filter((x) => x !== String(accountId))];
      let sent = false;
      let lastError = 'Send failed';
      for (let i = 0; i < attemptOrder.length; i++) {
        const aid = attemptOrder[i];
        const res = await this.sendFromAccount(
          userId,
          aid,
          {
            to: r.email,
            subject,
            body,
            module: r.module,
            entityId: r.entityId,
            enforceCrmRecipient: data.enforceCrmRecipient !== false,
            cc: data.cc,
            bcc: data.bcc,
          },
          userEmail,
        );
        if (res.success) {
          results.push({ email: r.email, name: r.name, success: true, accountId: aid });
          sentCountByAccount.set(aid, (sentCountByAccount.get(aid) || 0) + 1);
          sent = true;
          break;
        }
        lastError = res.error || lastError;
        if (!data.retryOnSendFail) break;
      }
      if (!sent) {
        results.push({
          email: r.email,
          name: r.name,
          success: false,
          accountId: String(accountId),
          error: lastError,
        });
      }
    }

    const sent = results.filter((r) => r.success).length;
    return {
      success: sent > 0,
      total: results.length,
      sent,
      failed: results.length - sent,
      results,
    };
  }

  async getSendLimitStatus(
    userId: string,
    accountId: string,
    userEmail?: string,
  ): Promise<{
    enforceSendLimits: boolean;
    blocked: boolean;
    reason: string | null;
    counts: { lastHour: number; lastDay: number };
    limits: { perHour: number; perDay: number; overrideEnabled: boolean };
    warmup?: { active: boolean; day: number; configuredMaxPerDay: number };
    compliance?: {
      commercialMailingAddress: string;
      requireCommercialFooter: boolean;
      blockHighRiskComposerSends: boolean;
      enforceHumanOutreachChecks: boolean;
      minOutreachBodyWords: number;
      maxOutreachBodyWords: number;
      maxOutreachParagraphs: number;
      blockNonHumanOutreachSends: boolean;
    };
  }> {
    const account = await this.getAccountWithCredentials(userId, accountId, userEmail);
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const settingsDoc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('emailDeliverability')
      .lean()
      .exec();
    const cfg = normalizeDeliverabilityConfig(
      settingsDoc?.emailDeliverability as any,
    );

    const maxPerHourGlobal = Math.max(1, cfg.maxEmailsPerHourPerAccount);
    const maxPerDayConfigured = Math.max(
      maxPerHourGlobal,
      cfg.maxEmailsPerDayPerAccount,
    );
    const warmup = computeWarmupDailyCap(
      (account as { createdAt?: Date }).createdAt,
      maxPerDayConfigured,
      cfg.enableWarmupRamp,
    );
    const maxPerDayGlobal = warmup.effectiveMaxPerDay;
    const overrideEnabled = account?.sendLimitOverride?.enabled === true;
    const maxPerHour = overrideEnabled
      ? Math.max(
        1,
        Number(
          account?.sendLimitOverride?.maxEmailsPerHour ?? maxPerHourGlobal,
        ),
      )
      : maxPerHourGlobal;
    const maxPerDay = overrideEnabled
      ? Math.max(
        maxPerHour,
        Math.min(
          Number(account?.sendLimitOverride?.maxEmailsPerDay ?? maxPerDayGlobal),
          maxPerDayGlobal,
        ),
      )
      : maxPerDayGlobal;

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const accountObjectId = new Types.ObjectId(accountId);
    const [hourCount, dayCount] = await Promise.all([
      this.emailTrackingService.countByAccountSince(accountObjectId, hourAgo),
      this.emailTrackingService.countByAccountSince(accountObjectId, dayAgo),
    ]);

    const enforce = cfg.enforceSendLimits === true;
    let reason: string | null = null;
    if (enforce && hourCount >= maxPerHour) {
      reason = `Hourly send limit reached (${maxPerHour}/hour).`;
    } else if (enforce && dayCount >= maxPerDay) {
      reason = `Daily send limit reached (${maxPerDay}/day).${
        warmup.warmupActive
          ? ` Warmup day ${warmup.warmupDay + 1} (configured max ${maxPerDayConfigured}/day).`
          : ''
      }`;
    }

    return {
      enforceSendLimits: enforce,
      blocked: !!reason,
      reason,
      counts: { lastHour: hourCount, lastDay: dayCount },
      limits: {
        perHour: maxPerHour,
        perDay: maxPerDay,
        overrideEnabled,
      },
      warmup: {
        active: warmup.warmupActive,
        day: warmup.warmupDay,
        configuredMaxPerDay: maxPerDayConfigured,
      },
      compliance: {
        commercialMailingAddress: cfg.commercialMailingAddress,
        requireCommercialFooter: cfg.requireCommercialFooter,
        blockHighRiskComposerSends: cfg.blockHighRiskComposerSends,
        enforceHumanOutreachChecks: cfg.enforceHumanOutreachChecks,
        minOutreachBodyWords: cfg.minOutreachBodyWords,
        maxOutreachBodyWords: cfg.maxOutreachBodyWords,
        maxOutreachParagraphs: cfg.maxOutreachParagraphs,
        blockNonHumanOutreachSends: cfg.blockNonHumanOutreachSends,
      },
    };
  }

  private entityKnownEmails(
    primary: string | undefined,
    additional: string[] | undefined,
  ): Set<string> {
    const s = new Set<string>();
    const p = (primary || '').trim().toLowerCase();
    if (p) s.add(p);
    for (const e of additional || []) {
      const t = String(e || '')
        .trim()
        .toLowerCase();
      if (t) s.add(t);
    }
    return s;
  }

  private async validateRecipientEntity(
    to: string,
    module: string | undefined,
    entityId: string | undefined,
  ): Promise<boolean> {
    const addresses = this.normalizeCcList(to);
    if (
      !addresses.length ||
      !module ||
      !entityId ||
      !Types.ObjectId.isValid(entityId)
    )
      return false;

    const knownForLeadContactClient = async (
      mod: 'leads' | 'contacts' | 'clients',
    ): Promise<boolean> => {
      let primary: string | undefined;
      let additional: string[] | undefined;
      if (mod === 'leads') {
        const lead = await this.leadModel.findById(entityId).lean().exec();
        primary = lead?.email;
        additional = lead?.additionalEmails;
      } else if (mod === 'contacts') {
        const c = await this.contactModel.findById(entityId).lean().exec();
        primary = c?.email;
        additional = c?.additionalEmails;
      } else {
        const cl = await this.clientModel.findById(entityId).lean().exec();
        primary = cl?.email;
        additional = cl?.additionalEmails;
      }
      const known = this.entityKnownEmails(primary, additional);
      return addresses.every((addr) =>
        known.has(addr.trim().toLowerCase()),
      );
    };

    if (module === 'leads') {
      return knownForLeadContactClient('leads');
    }
    if (module === 'contacts') {
      return knownForLeadContactClient('contacts');
    }
    if (module === 'clients') {
      return knownForLeadContactClient('clients');
    }
    return false;
  }

  private normalizeCcList(cc: string[] | string | undefined): string[] {
    if (!cc) return [];
    const raw = Array.isArray(cc) ? cc : [cc];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      for (const part of String(item).split(/[,;]+/)) {
        const t = part.trim();
        if (!t.includes('@')) continue;
        const low = t.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        out.push(t);
      }
    }
    return out;
  }

  private async appendCcEmailsToRecord(
    cc: string[],
    opts: {
      module?: string;
      entityId?: string;
      toEmail: string;
      save: boolean;
    },
  ): Promise<void> {
    if (
      !opts.save ||
      !opts.module ||
      !opts.entityId ||
      !Types.ObjectId.isValid(opts.entityId)
    )
      return;
    const toLow = (opts.toEmail || '').trim().toLowerCase();
    const uniq = cc
      .map((c) => c.trim())
      .filter((e) => e.toLowerCase() !== toLow && e.includes('@'));
    if (!uniq.length) return;

    const mod = opts.module;
    if (mod === 'leads') {
      await this.leadModel.updateOne(
        { _id: new Types.ObjectId(opts.entityId) },
        { $addToSet: { additionalEmails: { $each: uniq } } },
      );
      return;
    }
    if (mod === 'contacts') {
      await this.contactModel.updateOne(
        { _id: new Types.ObjectId(opts.entityId) },
        { $addToSet: { additionalEmails: { $each: uniq } } },
      );
      return;
    }
    if (mod === 'clients') {
      await this.clientModel.updateOne(
        { _id: new Types.ObjectId(opts.entityId) },
        { $addToSet: { additionalEmails: { $each: uniq } } },
      );
      return;
    }
  }

  /**
   * Builds the cross-entity involvedEntities array for a given primary entity.
   * Mirrors the logic in CRMService.getRelatedEntitiesForRollup to avoid circular injection.
   */
  private async buildInvolvedEntities(
    primaryOid: Types.ObjectId,
    relatedType: string,
  ): Promise<{ id: Types.ObjectId; type: string }[]> {
    const involved: { id: Types.ObjectId; type: string }[] = [
      { id: primaryOid, type: relatedType },
    ];
    try {
      if (relatedType === 'Lead') {
        const lead = await this.leadModel.findById(primaryOid).select('email associatedOrganizations').lean().exec();
        if (lead) {
          if (lead.associatedOrganizations?.length) {
            (lead.associatedOrganizations as Types.ObjectId[]).forEach(orgId => involved.push({ id: orgId, type: 'Organization' }));
          }
          if ((lead as any).email) {
            const [contact, clients] = await Promise.all([
              this.contactModel.findOne({ email: (lead as any).email }).select('_id').lean().exec(),
              this.clientModel.find({ $or: [{ sourceLead: primaryOid }, { email: (lead as any).email }] }).select('_id').lean().exec(),
            ]);
            if (contact) involved.push({ id: contact._id as Types.ObjectId, type: 'Contact' });
            clients.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Client' }));
          }
        }
      } else if (relatedType === 'Contact') {
        const contact = await this.contactModel.findById(primaryOid).select('email sourceLead associatedLeads associatedOrganizations').lean().exec();
        if (contact) {
          if ((contact as any).sourceLead) involved.push({ id: (contact as any).sourceLead, type: 'Lead' });
          if ((contact as any).associatedLeads?.length) {
            ((contact as any).associatedLeads as Types.ObjectId[]).forEach(id => involved.push({ id, type: 'Lead' }));
          }
          if ((contact as any).associatedOrganizations?.length) {
            ((contact as any).associatedOrganizations as Types.ObjectId[]).forEach(id => involved.push({ id, type: 'Organization' }));
          }
          if ((contact as any).email) {
            const [leadsByEmail, clientsByEmail] = await Promise.all([
              this.leadModel.find({ email: (contact as any).email }).select('_id').lean().exec(),
              this.clientModel.find({ email: (contact as any).email }).select('_id').lean().exec(),
            ]);
            leadsByEmail.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
            clientsByEmail.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Client' }));
          }
        }
      } else if (relatedType === 'Client') {
        const client = await this.clientModel.findById(primaryOid).select('sourceLead email organization').lean().exec();
        if (client) {
          if ((client as any).sourceLead) involved.push({ id: (client as any).sourceLead, type: 'Lead' });
          if ((client as any).organization) involved.push({ id: (client as any).organization, type: 'Organization' });
          if ((client as any).email) {
            const [leadsByEmail, contactsByEmail] = await Promise.all([
              this.leadModel.find({ email: (client as any).email }).select('_id').lean().exec(),
              this.contactModel.find({ email: (client as any).email }).select('_id').lean().exec(),
            ]);
            leadsByEmail.forEach(l => involved.push({ id: l._id as Types.ObjectId, type: 'Lead' }));
            contactsByEmail.forEach(c => involved.push({ id: c._id as Types.ObjectId, type: 'Contact' }));
          }
        }
      }
    } catch (e) {
      // Non-fatal: activity is still saved, just without full cross-entity tagging
      this.logger.warn(`[buildInvolvedEntities] Failed to build for ${relatedType}:${primaryOid}: ${e?.message}`);
    }
    // Deduplicate by id+type
    return Array.from(new Map(involved.map(i => [`${i.id}_${i.type}`, i])).values());
  }

  /** Batch existence check for workflow cron / validation (ids only, no credentials). */
  async filterExistingAccountIds(accountIds: string[]): Promise<Set<string>> {
    const oids = [
      ...new Set(
        accountIds
          .map((id) => id?.trim())
          .filter((id): id is string => !!id && Types.ObjectId.isValid(id))
          .map((id) => String(id)),
      ),
    ];
    if (!oids.length) return new Set();
    const docs = await this.accountModel
      .find({ _id: { $in: oids.map((id) => new Types.ObjectId(id)) } })
      .select('_id')
      .lean()
      .exec();
    return new Set(docs.map((d) => String(d._id)));
  }

  /** Connected mailbox address for workflow / reporting (no credential check). */
  async getAccountEmailById(accountId: string): Promise<string | null> {
    if (!accountId || !Types.ObjectId.isValid(accountId)) return null;
    const doc = await this.accountModel
      .findById(new Types.ObjectId(accountId))
      .select('email')
      .lean()
      .exec();
    const email = doc?.email != null ? String(doc.email).trim() : '';
    return email || null;
  }

  /**
   * Record an outbound send on the CRM timeline (manual inbox, workflow, alternates).
   * Never throws — a failed activity write must not fail the underlying send.
   */
  async recordOutboundEmailOnTimeline(
    userId: string,
    data: {
      to: string;
      subject: string;
      module?: string;
      entityId?: string;
      cc?: string[];
      fromEmail: string;
      trackingToken?: string;
      bodyHtml?: string;
      attachments?: any[];
      inboxEmailId?: string;
      workflowMeta?: {
        followUpSequence?: boolean;
        alternateStep?: number;
        workflowId?: string;
      };
    },
  ): Promise<boolean> {
    return this.logEmailSentActivity(userId, data);
  }

  private async logEmailSentActivity(
    userId: string,
    data: {
      to: string;
      subject: string;
      module?: string;
      entityId?: string;
      cc?: string[];
      /** Actual SMTP / envelope From (connected inbox), not platform login email */
      fromEmail: string;
      /** Links activity to EmailTracking for opens/clicks in CRM UI */
      trackingToken?: string;
      /** Full HTML body as sent (for timeline "view full email") */
      bodyHtml?: string;
      attachments?: any[];
      inboxEmailId?: string;
      workflowMeta?: {
        followUpSequence?: boolean;
        alternateStep?: number;
        workflowId?: string;
      };
    },
  ): Promise<boolean> {
    if (!data.entityId || !Types.ObjectId.isValid(data.entityId)) return false;
    try {
      const ccPart =
        data.cc && data.cc.length > 0 ? ` (CC: ${data.cc.join(', ')})` : '';
      const fromAddr = (data.fromEmail || '').trim();
      const fromPart = fromAddr ? ` from ${fromAddr}` : '';
      const plain = data.bodyHtml
        ? data.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        : '';
      const relatedType: string =
        data.module === 'leads' ? 'Lead'
          : data.module === 'contacts' ? 'Contact'
            : data.module === 'clients' ? 'Client'
              : 'Organization';
      const primaryOid = new Types.ObjectId(data.entityId);
      const involvedEntities = await this.buildInvolvedEntities(
        primaryOid,
        relatedType,
      );
      const authorOid =
        userId && Types.ObjectId.isValid(String(userId))
          ? new Types.ObjectId(String(userId))
          : undefined;

      await new this.activityModel({
        type: 'Email',
        title: 'Email sent',
        content: `Email sent${fromPart} to ${data.to}${ccPart}: ${data.subject}`,
        relatedTo: primaryOid,
        relatedType,
        ...(authorOid ? { author: authorOid } : {}),
        involvedEntities,
        metadata: {
          direction: 'outbound',
          subject: data.subject,
          ...(fromAddr ? { fromEmail: fromAddr } : {}),
          toEmail: data.to,
          ...(data.cc?.length ? { cc: data.cc } : {}),
          ...(data.trackingToken ? { trackingToken: data.trackingToken } : {}),
          ...(data.bodyHtml ? { bodyHtml: data.bodyHtml, bodyPlain: plain } : {}),
          attachments: (data.attachments || []).map((a, idx) => ({
            id: `pending-${idx}-${Date.now()}`,
            filename: a.filename,
            contentType: a.contentType,
            size: a.content?.length || 0,
          })),
          ...(data.inboxEmailId ? { inboxEmailId: data.inboxEmailId } : {}),
          ...(data.workflowMeta?.followUpSequence
            ? { workflowEmailSend: true, followUpSequence: true }
            : {}),
          ...(data.workflowMeta?.alternateStep != null
            ? { alternateEngagementStep: data.workflowMeta.alternateStep }
            : {}),
          ...(data.workflowMeta?.workflowId
            ? { workflowId: data.workflowMeta.workflowId }
            : {}),
        },
      }).save();
      return true;
    } catch (e: any) {
      this.logger.warn(
        `[logEmailSentActivity] timeline write failed for ${data.entityId}: ${e?.message || e}`,
      );
      return false;
    }
  }

  private fmtRfcMessageId(id: string): string {
    const t = id.trim();
    if (t.startsWith('<')) return t;
    return `<${t}>`;
  }

  private isMicrosoftGraphAccessDenied(
    message: string | undefined,
    status: number,
  ): boolean {
    const lower = (message || '').toLowerCase();
    return (
      status === 403 ||
      lower.includes('access is denied') ||
      lower.includes('access denied')
    );
  }

  /**
   * Graph ErrorAccessDenied on create-draft often means Mail.ReadWrite was not
   * consented — reconnect the mailbox after the app requests that scope.
   */
  private formatMicrosoftGraphSendError(
    message: string | undefined,
    status: number,
    fallback: string,
  ): string {
    const raw = (message || '').trim();
    if (this.isMicrosoftGraphAccessDenied(raw, status)) {
      return (
        'Microsoft mailbox access denied. Reconnect this Outlook account in CRM Inbox ' +
        'and approve Mail.ReadWrite + Mail.Send (create-draft send requires ReadWrite).' +
        (raw ? ` (${raw})` : '')
      );
    }
    if (status === 401) {
      return 'Microsoft Graph unauthorized — reconnect the mailbox';
    }
    return raw || fallback;
  }

  /** Microsoft Graph: reply in-thread (uses stored Graph message id). */
  /**
   * Attach in-memory files to a Graph draft message before /send.
   * Used by createReply drafts (replies previously dropped attachments silently).
   */
  private async addGraphDraftAttachments(
    accessToken: string,
    draftId: string,
    attachments: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string;
    }>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    for (const a of attachments) {
      if (!a?.content?.length) continue;
      const payload: Record<string, unknown> = {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename || 'attachment',
        contentType: a.contentType || 'application/octet-stream',
        contentBytes: a.content.toString('base64'),
      };
      if (a.cid) {
        payload.isInline = true;
        payload.contentId = a.cid;
      }
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const msg = this.formatMicrosoftGraphSendError(
          errBody.error?.message,
          res.status,
          `Failed to attach ${a.filename || 'file'} (${res.status})`,
        );
        this.logger.error(`Graph draft attachment failed: ${msg}`);
        return { success: false, error: msg };
      }
    }
    return { success: true };
  }

  private async sendGraphReply(
    account: UserEmailAccountDocument,
    graphMessageId: string,
    processedBody: string,
    userId: string,
    data: {
      to: string;
      subject: string;
      module?: string;
      entityId?: string;
      cc?: string[];
      bcc?: string[];
      attachments?: Array<{
        filename: string;
        content: Buffer;
        contentType: string;
        cid?: string;
      }>;
    },
    trackingToken?: string,
    ccList: string[] = [],
    bccList: string[] = [],
    saveCcToRecord = true,
  ): Promise<{ success: boolean; error?: string; rfcMessageId?: string }> {
    try {
      const token = await this.getValidOAuthAccessToken(account);
      const authHeaders = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const fileAttachments = (data.attachments || []).filter(
        (a) => a?.content?.length,
      );

      // Prefer createReply (needs Mail.ReadWrite) for Message-ID capture + attachments.
      // Fall back to /reply (Mail.Send only) — restored for tokens that worked
      // before today's create-draft change. /reply cannot carry file attachments.
      const message: Record<string, unknown> = {
        body: { contentType: 'HTML', content: processedBody },
      };
      if (ccList.length) {
        message.ccRecipients = ccList.map((address) => ({
          emailAddress: { address },
        }));
      }
      if (bccList.length) {
        message.bccRecipients = bccList.map((address) => ({
          emailAddress: { address },
        }));
      }

      const createRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(graphMessageId)}/createReply`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ message }),
        },
      );
      if (createRes.ok) {
        const draft = (await createRes.json()) as {
          id?: string;
          internetMessageId?: string;
        };
        const draftId = draft?.id ? String(draft.id) : '';
        if (!draftId) {
          return { success: false, error: 'Graph reply draft missing id' };
        }

        if (fileAttachments.length) {
          const attached = await this.addGraphDraftAttachments(
            token,
            draftId,
            fileAttachments,
          );
          if (!attached.success) {
            // Best-effort cleanup so we don't leave a half-built reply draft.
            void fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              },
            ).catch(() => undefined);
            return attached;
          }
        }

        let rfcMessageId = this.normalizeRfcMessageId(draft.internetMessageId);
        if (!rfcMessageId) {
          try {
            const idRes = await fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}?$select=internetMessageId`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (idRes.ok) {
              const idJson = (await idRes.json()) as {
                internetMessageId?: string;
              };
              rfcMessageId = this.normalizeRfcMessageId(idJson.internetMessageId);
            }
          } catch (_) {}
        }

        const sendRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/send`,
          { method: 'POST', headers: authHeaders },
        );
        if (!sendRes.ok) {
          const errBody = (await sendRes.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const msg = this.formatMicrosoftGraphSendError(
            errBody.error?.message,
            sendRes.status,
            `Graph reply send failed (${sendRes.status})`,
          );
          this.logger.error(`Graph reply send failed: ${msg}`);
          return { success: false, error: msg };
        }

        await this.persistSentEmailAndLogActivity(userId, account, {
          ...data,
          cc: ccList,
          bcc: bccList,
          fromEmail: account.email,
          trackingToken: trackingToken ?? undefined,
          bodyHtml: processedBody,
          rfcMessageId,
          graphMessageId: draftId,
          attachments: fileAttachments,
        });
        if (ccList.length && saveCcToRecord) {
          const toFirst =
            this.normalizeCcList(data.to)[0] || (data.to || '').trim();
          await this.appendCcEmailsToRecord(ccList, {
            module: data.module,
            entityId: data.entityId,
            toEmail: toFirst,
            save: saveCcToRecord,
          });
        }
        return { success: true, ...(rfcMessageId ? { rfcMessageId } : {}) };
      }

      const createErr = (await createRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const canFallbackReply =
        this.isMicrosoftGraphAccessDenied(
          createErr.error?.message,
          createRes.status,
        ) &&
        !ccList.length &&
        !bccList.length &&
        fileAttachments.length === 0;
      if (!canFallbackReply) {
        const msg =
          fileAttachments.length > 0 &&
          this.isMicrosoftGraphAccessDenied(
            createErr.error?.message,
            createRes.status,
          )
            ? 'Cannot attach files on this Outlook reply — reconnect the mailbox with Mail.ReadWrite, or send as a new email.'
            : this.formatMicrosoftGraphSendError(
                createErr.error?.message,
                createRes.status,
                `Graph reply draft failed (${createRes.status})`,
              );
        this.logger.error(`Graph createReply failed: ${msg}`);
        return { success: false, error: msg };
      }

      this.logger.warn(
        'Graph createReply denied (Mail.ReadWrite); falling back to /reply',
      );
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(graphMessageId)}/reply`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ comment: processedBody }),
        },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const msg = this.formatMicrosoftGraphSendError(
          errBody.error?.message,
          res.status,
          `Graph reply failed (${res.status})`,
        );
        this.logger.error(`Graph reply failed: ${msg}`);
        return { success: false, error: msg };
      }

      await this.persistSentEmailAndLogActivity(userId, account, {
        ...data,
        cc: ccList,
        bcc: bccList,
        fromEmail: account.email,
        trackingToken: trackingToken ?? undefined,
        bodyHtml: processedBody,
      });
      return { success: true };
    } catch (e: any) {
      this.logger.error(`Graph reply failed: ${e?.message}`);
      return { success: false, error: e?.message || 'Reply failed' };
    }
  }

  async convertLocalImagesToCidAttachments(
    html: string,
    existingAttachments: any[] = [],
  ): Promise<{ body: string; attachments: any[] }> {
    let body = html;
    const attachments = [...existingAttachments];

    const imgRegex = /src=["'](?:https?:\/\/[^/]+)?\/uploads\/([^"'\s>]+)["']/gi;
    let match;
    const seenFiles = new Set();

    while ((match = imgRegex.exec(html)) !== null) {
      const filepath = match[1];
      if (!filepath || seenFiles.has(filepath)) continue;
      seenFiles.add(filepath);

      const upload = await this.uploadModel.findOne({ filename: filepath }).exec();
      if (upload) {
        const cid = `img-${Date.now()}-${Math.round(Math.random() * 1e6)}@mathionix.local`;

        const diskPath = join(UPLOADS_DIR, upload.filename);
        let dataBuffer: Buffer;
        try {
          dataBuffer = readFileSync(diskPath);
        } catch {
          // File missing on disk — leave the original <img src> untouched rather than
          // rewriting it to a cid with no matching attachment.
          continue;
        }

        const escapedPath = filepath.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const replaceRegex = new RegExp(`(?:https?:\\/\\/[^/]+)?\\/uploads\\/${escapedPath}`, 'gi');
        body = body.replace(replaceRegex, `cid:${cid}`);

        attachments.push({
          filename: upload.originalName || filepath.split('/').pop() || 'image.webp',
          content: dataBuffer,
          contentType: upload.mimeType,
          cid: cid,
        });
      }
    }

    return { body, attachments };
  }

  private async persistInboxEmailTrackingAfterSend(
    trackingToken: string | null | undefined,
    userId: string,
    accountId: string,
    data: {
      to: string;
      subject: string;
      module?: string;
      entityId?: string;
      templateId?: string;
    },
    fromEmail: string,
    rfcMessageId?: string,
  ): Promise<void> {
    if (!trackingToken) return;
    await this.emailTrackingService.createTracking({
      trackingToken,
      userId,
      accountId,
      recipient: data.to,
      subject: data.subject,
      module: data.module,
      entityId: data.entityId,
      templateId: data.templateId,
      fromEmail,
      rfcMessageId,
    });
  }

  async sendFromAccount(
    userId: string,
    accountId: string,
    data: {
      to: string;
      subject: string;
      body: string;
      module?: string;
      entityId?: string;
      replyToInboxEmailId?: string;
      enforceCrmRecipient?: boolean;
      cc?: string[];
      bcc?: string[];
      saveCcEmailsToRecord?: boolean;
      /** Workflow / template sends — powers template effectiveness reporting */
      templateId?: string;
      /** Bypass user authorization for system automations (e.g., workflows triggering emails from specific accounts) */
      systemBypassAuth?: boolean;
      /** Follow-up / workflow sends — tags timeline Email rows for filtering */
      workflowMeta?: {
        followUpSequence?: boolean;
        alternateStep?: number;
        workflowId?: string;
      };
      /** In-memory attachment buffers — forwarded to nodemailer/Graph, never stored on disk or DB */
      attachments?: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }>;
    },
    userEmail?: string,
  ): Promise<{ success: boolean; error?: string; trackingToken?: string }> {
    // Convert local database uploads to inline CID attachments
    const cidRes = await this.convertLocalImagesToCidAttachments(data.body, data.attachments || []);
    data.body = cidRes.body;
    data.attachments = cidRes.attachments;
    const ccList = this.normalizeCcList(data.cc);
    const toList = this.normalizeCcList(data.to);
    const bccList = this.normalizeCcList(data.bcc);
    const saveCc = data.saveCcEmailsToRecord !== false;
    const recipientsToCheck = [...new Set([...toList, ...ccList, ...bccList])];
    const invalidRecipients: string[] = [];
    for (const addr of recipientsToCheck) {
      if (await this.isSuppressedRecipientEmail(addr)) {
        invalidRecipients.push(addr);
      }
    }
    if (invalidRecipients.length > 0) {
      return {
        success: false,
        error: `Cannot send email. Recipient is marked invalid due to prior delivery failure: ${invalidRecipients.join(', ')}`,
      };
    }

    if (data.enforceCrmRecipient) {
      if (
        !data.module ||
        !data.entityId ||
        !Types.ObjectId.isValid(data.entityId)
      ) {
        return {
          success: false,
          error: 'Select a CRM record to log this email on.',
        };
      }
      const ok = await this.validateRecipientEntity(
        data.to,
        data.module,
        data.entityId,
      );
      if (!ok) {
        return {
          success: false,
          error:
            'Recipient must match the selected Lead, Contact, or Client contact email.',
        };
      }
    }

    let account: UserEmailAccountDocument | null = null;
    if (data.systemBypassAuth) {
      account = await this.accountModel.findById(new Types.ObjectId(accountId)).exec();
    } else {
      account = await this.getAccountWithCredentials(
        userId,
        accountId,
        userEmail,
      );
    }
    if (!account) return { success: false, error: 'Account not found' };
    await this.assertSendWithinDeliverabilityLimits(accountId);

    const settingsDoc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('emailDeliverability')
      .lean()
      .exec();
    const deliverabilityCfg = normalizeDeliverabilityConfig(
      settingsDoc?.emailDeliverability as any,
    );
    const emailTrackingEnabled = deliverabilityCfg.emailTrackingEnabled;

    const isConversationReply = !!data.replyToInboxEmailId;
    if (
      !isConversationReply &&
      deliverabilityCfg.enforceHumanOutreachChecks
    ) {
      const humanCheck = validateHumanOutreachForSend(data.body, {
        enabled: true,
        minBodyWords: deliverabilityCfg.minOutreachBodyWords,
        maxBodyWords: deliverabilityCfg.maxOutreachBodyWords,
        maxParagraphs: deliverabilityCfg.maxOutreachParagraphs,
        blockOnFail: deliverabilityCfg.blockNonHumanOutreachSends,
      });
      if (!humanCheck.ok) {
        return { success: false, error: humanCheck.error };
      }
    }

    let replyHeaders: Record<string, string> | undefined;
    if (data.replyToInboxEmailId) {
      const inboxDoc = await this.inboxEmailModel
        .findOne({
          _id: new Types.ObjectId(data.replyToInboxEmailId),
          // Use accountId (not userId) so shared-mailbox employees can reply.
          // Access to this account was already validated by getAccountWithCredentials above.
          accountId: account._id,
        })
        .lean()
        .exec();
      if (!inboxDoc)
        return { success: false, error: 'Original message not found' };
      if (inboxDoc.accountId.toString() !== accountId) {
        return {
          success: false,
          error: 'Open this message from the same mailbox you send from.',
        };
      }
      const meta = (inboxDoc.meta || {}) as Record<string, unknown>;
      if (meta.graph === true && meta.graphMessageId) {
        const { body: processedBody, trackingToken } =
          this.emailTrackingService.applyTrackingIfEnabled(
            data.body,
            emailTrackingEnabled,
          );
        const gr = await this.sendGraphReply(
          account,
          String(meta.graphMessageId),
          processedBody,
          userId,
          data,
          trackingToken ?? undefined,
          ccList,
          bccList,
          saveCc,
        );
        if (gr.success) {
          if (trackingToken) {
            await this.persistInboxEmailTrackingAfterSend(
              trackingToken,
              userId,
              accountId,
              data,
              account.email,
              gr.rfcMessageId,
            );
          }
          return { success: true, ...(trackingToken ? { trackingToken } : {}) };
        }
        return gr;
      }
      const rfc = meta.rfcMessageId ? String(meta.rfcMessageId) : '';
      if (rfc) {
        const ref = meta.references;
        const refStr = Array.isArray(ref)
          ? ref.join(' ')
          : ref
            ? String(ref)
            : '';
        const idFmt = this.fmtRfcMessageId(rfc.replace(/[<>]/g, ''));
        replyHeaders = {
          'In-Reply-To': idFmt,
          References: refStr ? `${refStr} ${idFmt}`.trim() : idFmt,
        };
      }
    }

    const listMailbox = resolveCrmListUnsubscribeMailbox(
      process.env.UNSUBSCRIBE_EMAIL,
      account.email,
    );
    const primaryRecipient =
      toList[0] || this.normalizeCcList(data.to)[0] || (data.to || '').trim();
    const jwtSecret = this.config.get<string>('JWT_SECRET') || 'supersecret';
    const listHeaders =
      !isConversationReply && listMailbox
        ? buildListUnsubscribeHeaders(
          listMailbox,
          primaryRecipient,
          jwtSecret,
        )
        : null;
    const complianceFooterOpts = {
      oneClickUrl: listHeaders?.oneClickUrl,
      commercialMailingAddress:
        deliverabilityCfg.requireCommercialFooter &&
        deliverabilityCfg.commercialMailingAddress
          ? deliverabilityCfg.commercialMailingAddress
          : undefined,
      footerStyle: deliverabilityCfg.optOutFooterStyle,
    };
    const bodyForTracking =
      !isConversationReply && listMailbox
        ? appendCrmEmailComplianceFooter(
          data.body,
          listMailbox,
          complianceFooterOpts,
        )
        : data.body;

    const { body: processedBody, trackingToken } =
      this.emailTrackingService.applyTrackingIfEnabled(
        bodyForTracking,
        emailTrackingEnabled,
      );

    const useGraphNewSend =
      account.authType === 'oauth' &&
      account.provider === 'outlook' &&
      account.microsoftGraphMail &&
      !replyHeaders;

    if (useGraphNewSend) {
      const r = await this.sendFromAccountMicrosoftGraph(
        account,
        data,
        processedBody,
        userId,
        ccList,
        bccList,
        !isConversationReply ? listHeaders : null,
        trackingToken ?? undefined,
      );
      if (r.success && ccList.length && saveCc) {
        const toFirst =
          this.normalizeCcList(data.to)[0] || (data.to || '').trim();
        await this.appendCcEmailsToRecord(ccList, {
          module: data.module,
          entityId: data.entityId,
          toEmail: toFirst,
          save: saveCc,
        });
      }
      if (!r.success) {
        await this.flagRecipientsFromSendError(
          [...toList, ...ccList, ...bccList],
          r.error || 'Send failed',
        );
      }
      if (r.success && trackingToken) {
        await this.persistInboxEmailTrackingAfterSend(
          trackingToken,
          userId,
          accountId,
          data,
          account.email,
          r.rfcMessageId,
        );
      }
      return r.success
        ? { ...r, ...(trackingToken ? { trackingToken } : {}) }
        : r;
    }

    let transporter: nodemailer.Transporter;
    if (account.authType === 'oauth') {
      const accessToken = await this.getValidOAuthAccessToken(account);
      if (account.provider === 'gmail') {
        transporter = nodemailer.createTransport({
          host: account.smtpHost,
          port: account.smtpPort,
          secure: account.smtpSecure,
          auth: {
            type: 'OAuth2',
            user: account.smtpUser,
            clientId: this.getGoogleClientId(),
            clientSecret: this.getGoogleClientSecret(),
            refreshToken: account.oauthRefreshToken,
            accessToken,
          },
        });
      } else if (account.provider === 'outlook') {
        transporter = nodemailer.createTransport({
          host: account.smtpHost,
          port: account.smtpPort,
          secure: account.smtpSecure,
          auth: {
            type: 'OAuth2',
            user: account.smtpUser,
            clientId: this.getMicrosoftClientId(),
            clientSecret: this.getMicrosoftClientSecret(),
            refreshToken: account.oauthRefreshToken,
            accessToken,
          },
        });
      } else {
        return {
          success: false,
          error: 'OAuth send is not supported for this provider',
        };
      }
    } else {
      transporter = nodemailer.createTransport(
        buildSmtpTransportOptions({
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort,
          smtpSecure: account.smtpSecure,
          smtpUser: account.smtpUser || account.email,
          smtpPassword: account.smtpPassword,
        }),
      );
    }

    try {
      const messageRef = trackingToken || randomBytes(8).toString('hex');
      const messageId = `<${messageRef}-${Date.now()}@${account.email.split('@')[1] || 'crm'}>`;
      let textFallback: string;
      if (isConversationReply) {
        textFallback =
          processedBody
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || data.subject;
      } else if (listMailbox) {
        const inner = data.body
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .trim();
        textFallback = appendCrmEmailComplianceTextPlain(
          inner || data.subject,
          listMailbox,
          complianceFooterOpts,
        );
      } else {
        textFallback =
          processedBody
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || data.subject;
      }
      const addListHeaders = !isConversationReply && !!listHeaders;
      const inlineAttachments = (data.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        cid: a.cid,
      }));
      await transporter.sendMail({
        from: `"${account.displayName || account.email}" <${account.email}>`,
        to: data.to,
        ...(ccList.length ? { cc: ccList } : {}),
        ...(bccList.length ? { bcc: bccList } : {}),
        subject: data.subject,
        html: processedBody,
        text: textFallback || data.subject,
        ...(inlineAttachments.length ? { attachments: inlineAttachments } : {}),
        headers: {
          'Message-ID': messageId,
          'X-Mailer': '2Bigha CRM',
          Precedence: 'auto',
          ...(replyHeaders || {}),
          ...(addListHeaders &&
            listHeaders && {
            'List-Unsubscribe': listHeaders.listUnsubscribe,
            ...(listHeaders.listUnsubscribePost
              ? { 'List-Unsubscribe-Post': listHeaders.listUnsubscribePost }
              : {}),
          }),
        },
        ...(addListHeaders &&
          listMailbox && {
          list: {
            unsubscribe: {
              url: listHeaders?.oneClickUrl || `mailto:${listMailbox}`,
              comment: 'Unsubscribe',
            },
          },
        }),
      });

      const rfcMessageId = this.normalizeRfcMessageId(messageId);
      await this.persistSentEmailAndLogActivity(userId, account, {
        ...data,
        cc: ccList,
        bcc: bccList,
        fromEmail: account.email,
        trackingToken: trackingToken ?? undefined,
        bodyHtml: processedBody,
        workflowMeta: data.workflowMeta,
        rfcMessageId,
        replyToInboxEmailId: data.replyToInboxEmailId,
        inReplyTo: replyHeaders?.['In-Reply-To'],
        references: replyHeaders?.References,
        attachments: data.attachments,
      }, { syncSentFolder: false });
      if (ccList.length && saveCc) {
        const toFirst =
          this.normalizeCcList(data.to)[0] || (data.to || '').trim();
        await this.appendCcEmailsToRecord(ccList, {
          module: data.module,
          entityId: data.entityId,
          toEmail: toFirst,
          save: saveCc,
        });
      }
      if (trackingToken) {
        await this.persistInboxEmailTrackingAfterSend(
          trackingToken,
          userId,
          accountId,
          data,
          account.email,
          rfcMessageId,
        );
      }
      return { success: true, ...(trackingToken ? { trackingToken } : {}) };
    } catch (e: any) {
      const errMsg = formatSmtpAuthError(e, account.provider) || 'Send failed';
      this.logger.error(`Send failed: ${errMsg}`);
      await this.flagRecipientsFromSendError(
        [...toList, ...ccList, ...bccList],
        errMsg,
      );
      return { success: false, error: errMsg };
    }
  }

  /** Send via Microsoft Graph — works when Exchange SMTP AUTH is disabled for the tenant */
  private async sendFromAccountMicrosoftGraph(
    account: UserEmailAccountDocument,
    data: {
      to: string;
      subject: string;
      body: string;
      module?: string;
      entityId?: string;
      attachments?: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }>;
      workflowMeta?: {
        followUpSequence?: boolean;
        alternateStep?: number;
        workflowId?: string;
      };
    },
    processedBody: string,
    userId: string,
    ccList: string[],
    bccList: string[],
    listHeaders: {
      listUnsubscribe: string;
      listUnsubscribePost?: string;
      oneClickUrl?: string;
    } | null,
    trackingToken?: string,
  ): Promise<{ success: boolean; error?: string; rfcMessageId?: string }> {
    try {
      const token = await this.getValidOAuthAccessToken(account);
      const toList = this.normalizeCcList(data.to);
      if (!toList.length) {
        return { success: false, error: 'At least one recipient is required' };
      }
      const message: Record<string, unknown> = {
        subject: data.subject,
        body: { contentType: 'HTML', content: processedBody },
        toRecipients: toList.map((address) => ({
          emailAddress: { address },
        })),
      };
      // Graph sendMail only allows x-* names in internetMessageHeaders.
      // List-Unsubscribe must use PidTagListUnsubscribe (0x1045); List-Unsubscribe-Post
      // is not supported without MIME — the HTML footer still exposes one-click opt-out.
      if (listHeaders) {
        message.singleValueExtendedProperties = [
          {
            id: 'String 0x1045',
            value: listHeaders.listUnsubscribe,
          },
        ];
      }
      if (trackingToken) {
        message.internetMessageHeaders = [
          { name: 'x-crm-tracking-token', value: trackingToken },
        ];
      }
      if (ccList.length) {
        message.ccRecipients = ccList.map((address) => ({
          emailAddress: { address },
        }));
      }
      if (bccList.length) {
        message.bccRecipients = bccList.map((address) => ({
          emailAddress: { address },
        }));
      }
      const fileAttachments = (data.attachments || []).filter(
        (a) => a?.content?.length,
      );
      // Prefer create-draft + attach + send (Mail.ReadWrite) so we can capture Message-ID
      // and reliably add PDFs/files (inline create sometimes drops/fails large attachments).
      // Fall back to /sendMail (Mail.Send only) — this is what worked before today's
      // commit changed the send path and broke existing OAuth tokens.
      const createRes = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      const draft = (await createRes.json().catch(() => ({}))) as {
        id?: string;
        internetMessageId?: string;
        error?: { message?: string };
      };

      if (createRes.ok && draft?.id) {
        const draftId = String(draft.id);

        if (fileAttachments.length) {
          const attached = await this.addGraphDraftAttachments(
            token,
            draftId,
            fileAttachments,
          );
          if (!attached.success) {
            void fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              },
            ).catch(() => undefined);
            return attached;
          }
        }

        let rfcMessageId = this.normalizeRfcMessageId(draft.internetMessageId);
        if (!rfcMessageId) {
          try {
            const idRes = await fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}?$select=internetMessageId`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (idRes.ok) {
              const idJson = (await idRes.json()) as { internetMessageId?: string };
              rfcMessageId = this.normalizeRfcMessageId(idJson.internetMessageId);
            }
          } catch (err: unknown) {
            this.logger.warn(
              `Graph internetMessageId lookup failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        }

        const sendRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/send`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!sendRes.ok) {
          const errBody = (await sendRes.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          const msg = this.formatMicrosoftGraphSendError(
            errBody.error?.message,
            sendRes.status,
            `Graph send failed (${sendRes.status})`,
          );
          this.logger.error(`Graph send failed: ${msg}`);
          return { success: false, error: msg };
        }

        await this.persistSentEmailAndLogActivity(userId, account, {
          ...data,
          cc: ccList,
          bcc: bccList,
          fromEmail: account.email,
          trackingToken: trackingToken ?? undefined,
          bodyHtml: processedBody,
          workflowMeta: data.workflowMeta,
          attachments: fileAttachments,
          rfcMessageId,
          graphMessageId: draftId,
        });

        return { success: true, ...(rfcMessageId ? { rfcMessageId } : {}) };
      }

      if (
        !this.isMicrosoftGraphAccessDenied(draft?.error?.message, createRes.status)
      ) {
        const msg = this.formatMicrosoftGraphSendError(
          draft?.error?.message,
          createRes.status,
          `Graph create message failed (${createRes.status})`,
        );
        this.logger.error(`Graph create message failed: ${msg}`);
        return { success: false, error: msg };
      }

      if (fileAttachments.length > 0) {
        return {
          success: false,
          error:
            'Cannot attach files with this Outlook mailbox permission. Reconnect the mailbox with Mail.ReadWrite, or send without attachments.',
        };
      }

      this.logger.warn(
        'Graph create message denied (Mail.ReadWrite); falling back to /sendMail',
      );
      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          saveToSentItems: true,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const msg = this.formatMicrosoftGraphSendError(
          errBody.error?.message,
          res.status,
          `Graph send failed (${res.status})`,
        );
        this.logger.error(`Graph sendMail failed: ${msg}`);
        return { success: false, error: msg };
      }

      await this.persistSentEmailAndLogActivity(userId, account, {
        ...data,
        cc: ccList,
        bcc: bccList,
        fromEmail: account.email,
        trackingToken: trackingToken ?? undefined,
        bodyHtml: processedBody,
        workflowMeta: data.workflowMeta,
        attachments: fileAttachments,
      });

      return { success: true };
    } catch (e: any) {
      this.logger.error(`Graph send failed: ${e?.message}`);
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  getProviderConfigs(): typeof PROVIDER_CONFIGS {
    return { ...PROVIDER_CONFIGS };
  }

  async createQuickLead(userId: string, email: string, name?: string) {
    const trimmed = (email || '').trim();
    if (!trimmed || !trimmed.includes('@'))
      throw new BadRequestException('Invalid email');

    const parts = (name || '').trim().split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || 'Lead';

    const lead = await new this.leadModel({
      firstName,
      lastName,
      email: trimmed,
      status: 'New',
      source: 'Inbox Send',
      createdBy: new Types.ObjectId(userId),
    }).save();

    return {
      module: 'leads',
      entityId: lead._id.toString(),
      label: `${lead.firstName} ${lead.lastName}`.trim(),
      email: lead.email,
    };
  }

  private async markReadOnProvider(
    account: UserEmailAccountDocument,
    email: Pick<InboxEmail, 'messageId' | 'folder' | 'meta'>,
  ): Promise<void> {
    if (
      account.authType === 'oauth' &&
      account.provider === 'outlook' &&
      account.microsoftGraphMail
    ) {
      const token = await this.getValidOAuthAccessToken(account);
      const msgId =
        String((email.meta as { graphMessageId?: string })?.graphMessageId || '') ||
        String(email.messageId || '');
      if (!msgId) return;
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isRead: true }),
        },
      );
      if (!res.ok) {
        throw new Error(`Graph mark-read failed (${res.status})`);
      }
      return;
    }

    if (!String(account.imapHost || '').trim()) return;
    const client = await this.openImapClient(account);
    try {
      await client.mailboxOpen(email.folder || 'INBOX');
      const uid = Number(email.messageId);
      if (Number.isFinite(uid) && uid > 0) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    } finally {
      await client.logout();
    }
  }

  async markAsRead(
    userId: string,
    emailId: string,
    userEmail?: string,
  ): Promise<boolean> {
    const email = await this.getInboxEmailByIdForUser(userId, emailId, userEmail);
    if (!email) return false;

    const accountRef = (email as { accountId?: { _id?: { toString(): string } } | string })
      .accountId;
    const accountId =
      typeof accountRef === 'object' && accountRef && '_id' in accountRef
        ? String(accountRef._id)
        : String(accountRef || '');
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) return false;

    await this.inboxEmailModel.findByIdAndUpdate(emailId, {
      $set: { isRead: true },
    });

    try {
      await this.markReadOnProvider(account, email);
    } catch (err) {
      this.logger.warn(
        `Provider mark-read failed for ${emailId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return true;
  }

  async updateRelationshipLabel(
    userId: string,
    emailId: string,
    label: 'freelancer' | 'agency' | 'both' | null,
    userEmail?: string,
  ): Promise<boolean> {
    const email = await this.getInboxEmailByIdForUser(userId, emailId, userEmail);
    if (!email) return false;

    const accountRef = (email as { accountId?: { _id?: { toString(): string } } | string })
      .accountId;
    const accountId =
      typeof accountRef === 'object' && accountRef && '_id' in accountRef
        ? String(accountRef._id)
        : String(accountRef || '');
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) return false;

    const allowed = new Set(['freelancer', 'agency', 'both']);
    if (label && !allowed.has(label)) return false;

    await this.inboxEmailModel.findByIdAndUpdate(emailId, {
      $set: { relationshipLabel: label ?? undefined },
    });
    return true;
  }

  async updateClassificationOverride(
    userId: string,
    emailId: string,
    category: string,
    scope: 'email' | 'sender' | 'domain' = 'sender',
    userEmail?: string,
  ): Promise<boolean> {
    const emailDoc = await this.getInboxEmailByIdForUser(userId, emailId, userEmail);
    if (!emailDoc) return false;

    const accountRef = (emailDoc as { accountId?: { _id?: { toString(): string } } | string })
      .accountId;
    const accountId =
      typeof accountRef === 'object' && accountRef && '_id' in accountRef
        ? String(accountRef._id)
        : String(accountRef || '');
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) return false;

    await this.inboxEmailModel.findByIdAndUpdate(emailId, {
      $set: {
        categoryOverride: category,
        category,
      },
    });

    // If scope is sender or domain, create/update a rule
    if (scope === 'sender' || scope === 'domain') {
      const fromAddr = (emailDoc.from || '').toLowerCase().trim();
      if (fromAddr.includes('@')) {
        const domain = fromAddr.split('@')[1];
        const pattern =
          scope === 'sender'
            ? fromAddr
            : this.classificationService.normalizeDomainPattern(domain);

        await this.inboxRuleModel.findOneAndUpdate(
          { userId: new Types.ObjectId(userId), pattern, type: scope },
          {
            $set: {
              category,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true },
        );

        this.classificationService.invalidateCache(userId);
      }
    }

    return true;
  }

  async updateEmailAccountSharing(
    userId: string,
    accountId: string,
    sharedWithUserIds: string[],
  ): Promise<UserEmailAccount | null> {
    const isAdmin = await this.isAdminUser(userId);
    const query: any = { _id: new Types.ObjectId(accountId) };
    if (!isAdmin) {
      query.userId = new Types.ObjectId(userId);
    }

    const account = await this.accountModel.findOne(query);
    if (!account) throw new NotFoundException('Account not found');

    account.sharedWithUserIds = sharedWithUserIds.map(
      (id) => new Types.ObjectId(id),
    );
    return account.save();
  }

  /**
   * Fetch an attachment from the email provider on-demand and return a stream.
   * No file bytes are stored on the server or DB — files live on the provider.
   * Security: validates userId has access to the given accountId and emailId.
   * A short in-memory cache avoids re-downloading when the UI loads a thumb then opens the file.
   */
  async streamAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
    userEmail?: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
  }> {
    // 1. Validate email exists and fetch account info
    const email = await this.getInboxEmailByIdForUser(userId, emailId, userEmail);
    if (!email) throw new NotFoundException('Email not found');

    const accountRef = (email as { accountId?: { _id?: { toString(): string } } | string })
      .accountId;
    const accountId =
      typeof accountRef === 'object' && accountRef && '_id' in accountRef
        ? String(accountRef._id)
        : String(accountRef || '');

    // 2. Validate user has access to this account (owner or shared)
    const account = await this.getAccountWithCredentials(
      userId,
      accountId,
      userEmail,
    );
    if (!account) throw new NotFoundException('Account not found or access denied');

    // 3. Find the attachment metadata from meta.attachments stored during sync
    const metaAttachments: Array<{
      id: string;
      filename: string;
      contentType: string;
      size: number;
      cid?: string;
    }> = (email.meta as any)?.attachments || [];
    const normalizeCid = (value: string) =>
      String(value || '')
        .replace(/^cid:/i, '')
        .replace(/^<|>$/g, '')
        .trim()
        .toLowerCase();
    const attMeta =
      metaAttachments.find((a) => a.id === attachmentId) ||
      metaAttachments.find(
        (a) => a.cid && normalizeCid(a.cid) === normalizeCid(attachmentId),
      );
    const filename = attMeta?.filename || 'attachment';
    // A wrong/missing content type breaks inline rendering even when the bytes are fine.
    const contentType =
      attMeta?.contentType && attMeta.contentType !== 'application/octet-stream'
        ? attMeta.contentType
        : this.guessAttachmentContentType(filename);
    // Callers may reference an inline image by cid; providers only know their own id.
    const providerAttachmentId = attMeta?.id || attachmentId;
    const cacheKey = `${String(emailId)}:${attachmentId}`;

    const cached = this.attachmentByteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        stream: Readable.from(cached.buf),
        filename: cached.filename,
        contentType: cached.contentType,
      };
    }

    const remember = (buf: Buffer) => {
      if (!buf?.length || buf.length > 12 * 1024 * 1024) return;
      if (this.attachmentByteCache.size >= this.attachmentCacheMaxEntries) {
        const oldest = this.attachmentByteCache.keys().next().value;
        if (oldest) this.attachmentByteCache.delete(oldest);
      }
      this.attachmentByteCache.set(cacheKey, {
        buf,
        filename,
        contentType,
        expiresAt: Date.now() + this.attachmentCacheTtlMs,
      });
    };

    let inflight = this.attachmentByteInflight.get(cacheKey);
    if (!inflight) {
      inflight = (async (): Promise<Buffer> => {
        // --- Microsoft Graph (Outlook OAuth) ---
        if (
          account.authType === 'oauth' &&
          account.provider === 'outlook' &&
          account.microsoftGraphMail &&
          !providerAttachmentId.startsWith('imap-')
        ) {
          const token = await this.getValidOAuthAccessToken(account);
          const graphMessageId = (email.meta as any)?.graphMessageId || email.messageId;
          const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(graphMessageId)}/attachments/${encodeURIComponent(providerAttachmentId)}/$value`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) {
            throw new Error(`Graph attachment download failed: ${res.status} ${res.statusText}`);
          }
          const ab = await res.arrayBuffer();
          return Buffer.from(ab);
        }

        // --- Gmail API ---
        if (account.authType === 'oauth' && account.provider === 'gmail' && !providerAttachmentId.startsWith('imap-')) {
          const token = await this.getValidOAuthAccessToken(account);
          const gmailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(email.messageId)}/attachments/${encodeURIComponent(providerAttachmentId)}`;
          const res = await fetch(gmailUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) {
            throw new Error(`Gmail attachment download failed: ${res.status} ${res.statusText}`);
          }
          const json = (await res.json()) as { data?: string };
          if (!json.data) throw new Error('Empty attachment data from Gmail API');
          return Buffer.from(json.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        }

        // --- Generic IMAP fallback (password-based or non-graph OAuth) ---
        const client = await this.openImapClient(account);
        try {
          await client.mailboxOpen(email.folder);
          const uid = email.messageId;
          const attIndex = providerAttachmentId.startsWith('imap-')
            ? parseInt(providerAttachmentId.split('-')[2] || '0', 10)
            : 0;
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg || !msg.source) {
            throw new Error('IMAP fetch returned null or missing source');
          }
          await client.logout();
          const parsed = await simpleParser(msg.source);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const att = parsed.attachments?.[attIndex] as any;
          if (!att) throw new Error('Attachment not found in message');
          const body = att.content;
          if (Buffer.isBuffer(body)) return body;
          if (body && typeof (body as Buffer).length === 'number') {
            return Buffer.from(body as Uint8Array);
          }
          return Buffer.alloc(0);
        } catch (err) {
          try {
            await client.logout();
          } catch (_) { }
          throw err;
        }
      })().finally(() => {
        this.attachmentByteInflight.delete(cacheKey);
      });
      this.attachmentByteInflight.set(cacheKey, inflight);
    }

    const pass = new PassThrough();
    void inflight
      .then((buf) => {
        remember(buf);
        pass.end(buf);
      })
      .catch((err: unknown) => {
        pass.destroy(err instanceof Error ? err : new Error(String(err)));
      });

    return {
      stream: pass,
      filename,
      contentType,
    };
  }
}
