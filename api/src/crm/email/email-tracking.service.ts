import { Inject, Injectable, Logger, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import { LeadScoringService } from '../core/lead-scoring.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { WorkflowsService } from '../automation/workflows.service';
import { LeadEngagementAutomationService } from '../automation/lead-engagement-automation.service';
import { DealEngagementAutomationService } from '../automation/deal-engagement-automation.service';
import { getTrackingPublicBase } from '../shared/crm-deliverability.util';
import {
  isDuplicateOpenBurst,
  isWithinEmailOpenGracePeriod,
} from '../shared/email-tracking-bot.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';

@Injectable()
export class EmailTrackingService implements OnModuleInit {
  private readonly logger = new Logger(EmailTrackingService.name);
  private warnedLocalTrackingBase = false;

  constructor(
    @InjectModel(EmailTracking.name, 'crmConnection')
    private trackingModel: Model<EmailTrackingDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    private readonly leadScoringService: LeadScoringService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    private readonly leadEngagementAutomation: LeadEngagementAutomationService,
    private readonly dealEngagementAutomation: DealEngagementAutomationService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
  ) {}

  onModuleInit(): void {
    const { publicBaseUrl, localOnly } = this.getTrackingConfig();
    if (localOnly && !this.warnedLocalTrackingBase) {
      this.warnedLocalTrackingBase = true;
      this.logger.warn(
        `CRM open-tracking pixels use ${publicBaseUrl} — external mail clients cannot load localhost. Set TRACKING_BASE_URL (or PUBLIC_API_URL) to your public API origin so opens record correctly.`,
      );
    }
  }

  /** Generate a unique tracking token */
  generateToken(): string {
    return randomBytes(24).toString('hex');
  }

  /** Get tracking pixel URL */
  getOpenTrackingUrl(token: string): string {
    return `${getTrackingPublicBase()}/api/crm/track/open/${token}`;
  }

  /** Get link redirect URL for click tracking */
  getClickTrackingUrl(token: string, destinationUrl: string): string {
    const encoded = Buffer.from(destinationUrl, 'utf8').toString('base64url');
    return `${getTrackingPublicBase()}/api/crm/track/click/${token}?u=${encoded}`;
  }

  getTrackingConfig(): { publicBaseUrl: string; localOnly: boolean } {
    const publicBaseUrl = getTrackingPublicBase();
    const localOnly = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(
      publicBaseUrl,
    );
    return { publicBaseUrl, localOnly };
  }

  /** Inject tracking pixel and wrap links when enabled; otherwise return body unchanged. */
  applyTrackingIfEnabled(
    htmlBody: string,
    enabled: boolean,
  ): { body: string; trackingToken: string | null } {
    if (!enabled) {
      return { body: htmlBody, trackingToken: null };
    }
    const { localOnly } = this.getTrackingConfig();
    if (localOnly && !this.warnedLocalTrackingBase) {
      this.warnedLocalTrackingBase = true;
      this.logger.warn(
        'CRM email tracking is enabled but the pixel base URL is localhost — opens from real inboxes will not be recorded until TRACKING_BASE_URL points to a public API.',
      );
    }
    const trackingToken = this.generateToken();
    return {
      body: this.processBodyForTracking(htmlBody, trackingToken),
      trackingToken,
    };
  }

  /** Inject tracking pixel and wrap links in HTML body */
  processBodyForTracking(htmlBody: string, token: string): string {
    if (!htmlBody || typeof htmlBody !== 'string') return htmlBody;

    const openUrl = this.getOpenTrackingUrl(token);
    const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

    // Append pixel before closing </body> or at end of content
    let processed = htmlBody;
    if (processed.includes('</body>')) {
      processed = processed.replace('</body>', `${pixel}</body>`);
    } else {
      processed = processed + pixel;
    }

    // Wrap http/https links with click tracking (avoid tracking our own pixel and unsubscribe)
    const linkRegex = /<a\s+([^>]*?)href=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
    processed = processed.replace(linkRegex, (match, before, url, after) => {
      if (
        url.includes('/track/') ||
        url.includes('unsubscribe') ||
        url.includes('mailto:')
      ) {
        return match;
      }
      const trackUrl = this.getClickTrackingUrl(token, url);
      return `<a ${before}href="${trackUrl}"${after}>`;
    });

    return processed;
  }

  /** Create tracking record when sending */
  async createTracking(data: {
    trackingToken: string;
    userId: string;
    accountId?: string;
    emailId?: string;
    recipient: string;
    subject: string;
    module?: string;
    entityId?: string;
    templateId?: string;
    fromEmail?: string;
    rfcMessageId?: string;
  }): Promise<EmailTrackingDocument> {
    const rfcMessageId = data.rfcMessageId
      ? String(data.rfcMessageId).replace(/[<>]/g, '').trim() || undefined
      : undefined;
    const doc = new this.trackingModel({
      trackingToken: data.trackingToken,
      userId: new Types.ObjectId(data.userId),
      accountId: data.accountId
        ? new Types.ObjectId(data.accountId)
        : undefined,
      emailId: data.emailId ? new Types.ObjectId(data.emailId) : undefined,
      recipient: data.recipient,
      subject: data.subject,
      module: data.module,
      entityId: data.entityId ? new Types.ObjectId(data.entityId) : undefined,
      templateId:
        data.templateId && Types.ObjectId.isValid(data.templateId)
          ? new Types.ObjectId(data.templateId)
          : undefined,
      fromEmail: data.fromEmail,
      ...(rfcMessageId ? { rfcMessageId } : {}),
      openCount: 0,
      clicks: [],
    });
    return doc.save();
  }

  /** Attach provider Message-ID after Graph/IMAP Sent reconciliation. */
  async attachRfcMessageId(
    trackingToken: string,
    rfcMessageId?: string | null,
  ): Promise<void> {
    const token = String(trackingToken || '').trim();
    const normalized = String(rfcMessageId || '')
      .replace(/[<>]/g, '')
      .trim();
    if (!token || !normalized) return;
    await this.trackingModel
      .updateOne(
        { trackingToken: token },
        { $set: { rfcMessageId: normalized } },
      )
      .exec();
  }

  async findByToken(token: string): Promise<EmailTrackingDocument | null> {
    return this.trackingModel.findOne({ trackingToken: token }).exec();
  }

  async findByRfcMessageId(
    rfcMessageId?: string | null,
  ): Promise<EmailTrackingDocument | null> {
    const normalized = String(rfcMessageId || '')
      .replace(/[<>]/g, '')
      .trim();
    if (!normalized) return null;
    return this.trackingModel.findOne({ rfcMessageId: normalized }).exec();
  }

  /**
   * Latest tracked outbound send for a CRM record (workflow "wait for open" fallback when
   * in-memory token was not threaded through a delay/jitter hop).
   */
  async findLatestTrackingTokenForEntity(
    entityId: string,
    since: Date,
    preferOpened = false,
  ): Promise<string | null> {
    if (!Types.ObjectId.isValid(entityId)) return null;
    let doc = null;
    if (preferOpened) {
      doc = await this.trackingModel
        .findOne({
          entityId: new Types.ObjectId(entityId),
          createdAt: { $gte: since },
          $or: [{ lastOpenedAt: { $ne: null } }, { openCount: { $gt: 0 } }],
        })
        .sort({ createdAt: -1 })
        .select('trackingToken')
        .lean()
        .exec();
    }
    if (!doc) {
      doc = await this.trackingModel
        .findOne({
          entityId: new Types.ObjectId(entityId),
          createdAt: { $gte: since },
        })
        .sort({ createdAt: -1 })
        .select('trackingToken')
        .lean()
        .exec();
    }
    return doc?.trackingToken ?? null;
  }

  /**
   * Outbound SMTP sends use Message-ID `<{trackingToken}-{timestamp}@host>` (48 hex chars).
   * Graph/Outlook sends use provider-assigned Message-IDs stored on EmailTracking.rfcMessageId.
   * Match In-Reply-To / References headers to link a reply to the original CRM send.
   */
  async findTrackingFromInReplyHeaders(
    headerBlob: string,
  ): Promise<EmailTrackingDocument | null> {
    const blob = headerBlob || '';
    const m =
      blob.match(/<([0-9a-f]{48})-/i) || blob.match(/\b([0-9a-f]{48})-\d+/i);
    if (m?.[1]) {
      const byToken = await this.findByToken(m[1]);
      if (byToken) return byToken;
    }

    const ids = new Set<string>();
    for (const match of blob.matchAll(/<([^>\s]+@[^>\s]+)>/gi)) {
      const id = String(match[1] || '')
        .replace(/[<>]/g, '')
        .trim()
        .toLowerCase();
      if (id) ids.add(id);
    }
    for (const match of blob.matchAll(/\b([^\s<>]+@[^\s<>]+)\b/gi)) {
      const id = String(match[1] || '')
        .replace(/[<>]/g, '')
        .trim()
        .toLowerCase();
      if (id.includes('@') && id.length > 5) ids.add(id);
    }
    for (const id of ids) {
      const byRfc = await this.findByRfcMessageId(id);
      if (byRfc) return byRfc;
    }
    return null;
  }

  async findByEmailId(emailId: string): Promise<EmailTrackingDocument | null> {
    if (!emailId.match(/^[0-9a-fA-F]{24}$/)) return null;
    return this.trackingModel
      .findOne({ emailId: new Types.ObjectId(emailId) })
      .exec();
  }

  async countByAccountSince(
    accountId: Types.ObjectId,
    since: Date,
  ): Promise<number> {
    return this.trackingModel.countDocuments({
      accountId,
      createdAt: { $gte: since },
    });
  }

  /**
   * Latest tracked CRM send to this recipient by this user — for “use same mailbox” follow-up hints.
   */
  /**
   * Aggregate tracked sends linked to a CRM record (inbox / composer sends with module+entityId).
   */
  async summarizeEngagementForCrmRecord(
    entityId: string,
    module: 'leads' | 'deals' | 'contacts' | 'organizations',
  ): Promise<{ anySend: boolean; anyOpened: boolean }> {
    if (!Types.ObjectId.isValid(entityId)) {
      return { anySend: false, anyOpened: false };
    }
    const oid = new Types.ObjectId(entityId);
    const rows = await this.trackingModel
      .find({ entityId: oid, module: module || 'leads' })
      .select('openCount')
      .lean()
      .exec();
    if (!rows.length) return { anySend: false, anyOpened: false };
    const anyOpened = rows.some(
      (r) =>
        (Number((r as { openCount?: number }).openCount) || 0) > 0 ||
        (Array.isArray((r as { clicks?: unknown[] }).clicks) &&
          (r as { clicks: unknown[] }).clicks.length > 0),
    );
    return { anySend: true, anyOpened };
  }

  /** Latest tracked send linked to a CRM record (lead/contact/deal/org). */
  async getLatestOutboundIdentityForCrmRecord(
    entityId: string,
    module: 'leads' | 'deals' | 'contacts' | 'organizations',
    preferOpened = false,
  ): Promise<{ accountId: string | null; fromEmail: string | null } | null> {
    if (!Types.ObjectId.isValid(entityId)) return null;
    let doc = null;
    if (preferOpened) {
      doc = await this.trackingModel
        .findOne({
          entityId: new Types.ObjectId(entityId),
          module: module || 'leads',
          $or: [{ lastOpenedAt: { $ne: null } }, { openCount: { $gt: 0 } }],
        })
        .sort({ createdAt: -1 })
        .select('accountId fromEmail')
        .lean()
        .exec();
    }
    if (!doc) {
      doc = await this.trackingModel
        .findOne({
          entityId: new Types.ObjectId(entityId),
          module: module || 'leads',
        })
        .sort({ createdAt: -1 })
        .select('accountId fromEmail')
        .lean()
        .exec();
    }
    if (!doc) return null;
    return {
      accountId: doc.accountId ? String(doc.accountId) : null,
      fromEmail: doc.fromEmail ? String(doc.fromEmail).trim() : null,
    };
  }

  async getLatestOutboundIdentityForRecipient(
    userId: string,
    recipientEmail: string,
  ): Promise<{ accountId: string | null; fromEmail: string | null } | null> {
    const trimmed = (recipientEmail || '').trim();
    if (!trimmed.includes('@') || !Types.ObjectId.isValid(userId)) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const recipientRegex = new RegExp(`^${escaped}$`, 'i');
    const doc = await this.trackingModel
      .findOne({
        userId: new Types.ObjectId(userId),
        recipient: recipientRegex,
      })
      .sort({ createdAt: -1 })
      .select('accountId fromEmail')
      .lean()
      .exec();
    if (!doc) return null;
    return {
      accountId: doc.accountId ? String(doc.accountId) : null,
      fromEmail: doc.fromEmail ? String(doc.fromEmail).trim() : null,
    };
  }

  /** Record an open (pixel load) — ignores grace-period scanner hits and duplicate proxy bursts. */
  async recordOpen(token: string): Promise<boolean> {
    const existing = await this.trackingModel
      .findOne({ trackingToken: token })
      .select('createdAt lastOpenedAt')
      .lean()
      .exec();
    if (!existing) return false;

    const nowMs = Date.now();
    if (
      isWithinEmailOpenGracePeriod(
        (existing as { createdAt?: Date }).createdAt,
        nowMs,
      )
    ) {
      this.logger.debug(
        `Ignored open for ${token}: within post-send grace period (likely scanner prefetch)`,
      );
      return false;
    }
    if (
      isDuplicateOpenBurst(
        (existing as { lastOpenedAt?: Date }).lastOpenedAt,
        nowMs,
      )
    ) {
      return true;
    }

    const result = await this.trackingModel.findOneAndUpdate(
      { trackingToken: token },
      {
        $inc: { openCount: 1 },
        $set: { lastOpenedAt: new Date() },
      },
      { new: true },
    );
    if (result?.trackingToken) {
      void this.workflowsService
        .nudgeEmailWaitJobsForTrackingToken(result.trackingToken)
        .catch((err: unknown) =>
          this.logger.warn(
            `nudge emailWait after open failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }
    if (
      result &&
      result.entityId &&
      result.module &&
      result.userId &&
      Number(result.openCount) === 1
    ) {
      const hadPriorClicks =
        Array.isArray(result.clicks) && result.clicks.length > 0;
      if (!hadPriorClicks) {
        this.workflowsService.onTrackedEmailFirstOpen({
          module: String(result.module),
          entityId: result.entityId,
          senderUserId: result.userId,
        });
        const mod = String(result.module).toLowerCase();
        if (mod === 'leads') {
          void this.leadEngagementAutomation.onLeadEmailOpened(
            String(result.entityId),
          );
        } else if (mod === 'deals') {
          void this.dealEngagementAutomation.onDealEmailOpened(
            String(result.entityId),
          );
        }
      }
    }
    if (result?.userId) {
      const userId = String(result.userId);
      const recipient = (result.recipient || '').trim();
      const subject = (result.subject || '').trim() || '(No subject)';
      const metadata = {
        trackingToken: result.trackingToken,
        recipient: result.recipient,
        subject: result.subject,
        module: result.module,
        entityId: result.entityId ? String(result.entityId) : undefined,
        accountId: result.accountId ? String(result.accountId) : undefined,
        openedAt: new Date().toISOString(),
        ...(result.module && result.entityId
          ? {
              link: this.crmRecordPathFromModule(
                String(result.module),
                String(result.entityId),
              ),
            }
          : {}),
      };
      const title = 'Email opened';
      const message = recipient
        ? `${recipient} opened: ${subject}`
        : `A tracked email was opened: ${subject}`;
      const isFirstOpen = Number(result.openCount) === 1;

      let notifyUserIds = [userId];
      if (isFirstOpen) {
        try {
          notifyUserIds =
            await this.inboxAccountsService.resolveEngagementNotificationRecipientIds(
              {
                senderUserId: userId,
                accountId: result.accountId
                  ? String(result.accountId)
                  : undefined,
                module: result.module ? String(result.module) : undefined,
                entityId: result.entityId
                  ? String(result.entityId)
                  : undefined,
              },
            );
          if (!notifyUserIds.length) notifyUserIds = [userId];
        } catch (err: unknown) {
          this.logger.warn(
            `resolve open notification recipients failed: ${err instanceof Error ? err.message : err}`,
          );
          notifyUserIds = [userId];
        }
      }

      // First open: persist + toast via notifications.create (same path as reply alerts).
      // Later opens: realtime toast to sender only (avoid bell spam).
      if (isFirstOpen) {
        for (const rid of notifyUserIds) {
          void this.notificationsService
            .create({
              recipient: rid,
              type: 'CRM_EMAIL_OPENED',
              title,
              message,
              metadata,
            })
            .catch((err: unknown) =>
              this.logger.warn(
                `Persist open notification failed: ${err instanceof Error ? err.message : err}`,
              ),
            );
        }
      } else {
        this.realtimeGateway.sendNotification(userId, {
          type: 'CRM_EMAIL_OPENED',
          title,
          message,
          metadata,
        });
      }

      for (const rid of isFirstOpen ? notifyUserIds : [userId]) {
        this.realtimeGateway.sendToUser(rid, 'crm:inbox:refresh', {
          type: 'CRM_EMAIL_OPENED',
          trackingToken: result.trackingToken,
          openedAt: new Date().toISOString(),
        });
      }
    }
    if (
      result?.module === 'leads' &&
      result.entityId &&
      Types.ObjectId.isValid(String(result.entityId))
    ) {
      void this.leadScoringService
        .refreshLeadScore(String(result.entityId))
        .catch((err: unknown) =>
          this.logger.warn(
            `Lead score refresh after open failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }
    return !!result;
  }

  /**
   * Record a click and return the destination URL.
   * When skipEngagement is true (bot / SEG probe), still return the destination so
   * security scanners succeed, but do not mark the email opened/clicked.
   */
  async recordClick(
    token: string,
    encodedUrl: string,
    options?: { skipEngagement?: boolean },
  ): Promise<string | null> {
    let destinationUrl: string;
    try {
      destinationUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
    } catch {
      this.logger.warn(`Invalid encoded URL for token ${token}`);
      return null;
    }

    const existing = await this.trackingModel
      .findOne({ trackingToken: token })
      .lean()
      .exec();
    if (!existing) return null;

    if (options?.skipEngagement) {
      this.logger.debug(
        `Ignored click engagement for ${token}: automated scanner UA`,
      );
      return destinationUrl;
    }

    const now = new Date();
    const hadOpens = Number(existing.openCount) > 0;
    const hadClicks =
      Array.isArray(existing.clicks) && existing.clicks.length > 0;
    const isFirstEngagement = !hadOpens && !hadClicks;

    const update: Record<string, unknown> = {
      $push: {
        clicks: {
          url: destinationUrl,
          clickedAt: now,
        },
      },
    };
    if (!existing.lastOpenedAt) {
      update.$set = { lastOpenedAt: now };
    }

    const result = await this.trackingModel.findOneAndUpdate(
      { trackingToken: token },
      update,
      { new: true },
    );

    if (result?.trackingToken) {
      void this.workflowsService
        .nudgeEmailWaitJobsForTrackingToken(result.trackingToken)
        .catch((err: unknown) =>
          this.logger.warn(
            `nudge emailWait after click failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    if (
      isFirstEngagement &&
      result?.entityId &&
      result.module &&
      result.userId
    ) {
      this.workflowsService.onTrackedEmailFirstOpen({
        module: String(result.module),
        entityId: result.entityId,
        senderUserId: result.userId,
      });
      const mod = String(result.module).toLowerCase();
      if (mod === 'leads') {
        void this.leadEngagementAutomation.onLeadEmailOpened(
          String(result.entityId),
        );
      } else if (mod === 'deals') {
        void this.dealEngagementAutomation.onDealEmailOpened(
          String(result.entityId),
        );
      }
    }

    if (result?.userId) {
      const userId = String(result.userId);
      const recipient = (result.recipient || '').trim();
      const subject = (result.subject || '').trim() || '(No subject)';
      const clickCount = Array.isArray(result.clicks) ? result.clicks.length : 0;
      const metadata = {
        trackingToken: result.trackingToken,
        recipient: result.recipient,
        subject: result.subject,
        module: result.module,
        entityId: result.entityId ? String(result.entityId) : undefined,
        accountId: result.accountId ? String(result.accountId) : undefined,
        clickedAt: now.toISOString(),
        url: destinationUrl,
        ...(result.module && result.entityId
          ? {
              link: this.crmRecordPathFromModule(
                String(result.module),
                String(result.entityId),
              ),
            }
          : {}),
      };
      const title = 'Link clicked';
      const message = recipient
        ? `${recipient} clicked a link in: ${subject}`
        : `A tracked link was clicked: ${subject}`;
      const isFirstClick = clickCount === 1;

      let notifyUserIds = [userId];
      if (isFirstClick) {
        try {
          notifyUserIds =
            await this.inboxAccountsService.resolveEngagementNotificationRecipientIds(
              {
                senderUserId: userId,
                accountId: result.accountId
                  ? String(result.accountId)
                  : undefined,
                module: result.module ? String(result.module) : undefined,
                entityId: result.entityId
                  ? String(result.entityId)
                  : undefined,
              },
            );
          if (!notifyUserIds.length) notifyUserIds = [userId];
        } catch (err: unknown) {
          this.logger.warn(
            `resolve click notification recipients failed: ${err instanceof Error ? err.message : err}`,
          );
          notifyUserIds = [userId];
        }
      }

      if (isFirstClick) {
        for (const rid of notifyUserIds) {
          void this.notificationsService
            .create({
              recipient: rid,
              type: 'CRM_EMAIL_CLICKED',
              title,
              message,
              metadata,
            })
            .catch((err: unknown) =>
              this.logger.warn(
                `Persist click notification failed: ${err instanceof Error ? err.message : err}`,
              ),
            );
        }
      } else {
        this.realtimeGateway.sendNotification(userId, {
          type: 'CRM_EMAIL_CLICKED',
          title,
          message,
          metadata,
        });
      }

      for (const rid of isFirstClick ? notifyUserIds : [userId]) {
        this.realtimeGateway.sendToUser(rid, 'crm:inbox:refresh', {
          type: 'CRM_EMAIL_CLICKED',
          trackingToken: result.trackingToken,
          clickedAt: now.toISOString(),
          entityId: result.entityId ? String(result.entityId) : undefined,
          module: result.module,
        });
      }
    }

    if (
      result?.module === 'leads' &&
      result.entityId &&
      Types.ObjectId.isValid(String(result.entityId))
    ) {
      void this.leadScoringService
        .refreshLeadScore(String(result.entityId))
        .catch((err: unknown) =>
          this.logger.warn(
            `Lead score refresh after click failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return result ? destinationUrl : null;
  }

  private mergeTrackingDeduped(
    a: EmailTracking[],
    b: EmailTracking[],
  ): EmailTracking[] {
    const seen = new Set<string>();
    const out: EmailTracking[] = [];
    for (const r of [...a, ...b]) {
      const t = (r as { trackingToken?: string }).trackingToken;
      if (t) {
        if (seen.has(t)) continue;
        seen.add(t);
      }
      out.push(r);
    }
    out.sort((a, b) => {
      const ta = new Date((a as { createdAt?: Date }).createdAt || 0).getTime();
      const tb = new Date((b as { createdAt?: Date }).createdAt || 0).getTime();
      return tb - ta;
    });
    return out;
  }

  private async rawTrackingRows(
    entityId: string,
    module: string,
  ): Promise<EmailTracking[]> {
    if (!entityId?.match(/^[0-9a-fA-F]{24}$/)) return [];
    return this.trackingModel
      .find({
        entityId: new Types.ObjectId(entityId),
        module: module || 'leads',
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Tracking rows for an entity. For deals and clients, also includes email tracking
   * logged on the linked source lead (same person / conversion history).
   */
  async getTrackingByEntity(
    entityId: string,
    module: string,
  ): Promise<EmailTracking[]> {
    const mod = (module || 'leads').toLowerCase();
    const base = await this.rawTrackingRows(entityId, module);

    if (!entityId?.match(/^[0-9a-fA-F]{24}$/)) return base;

    if (mod === 'deals') {
      const deal = await this.dealModel
        .findById(entityId)
        .select('lead')
        .lean()
        .exec();
      const leadId = (deal as { lead?: Types.ObjectId } | null)?.lead;
      if (leadId) {
        const fromLead = await this.rawTrackingRows(String(leadId), 'leads');
        return this.mergeTrackingDeduped(base, fromLead);
      }
    }
    if (mod === 'clients') {
      const client = await this.clientModel
        .findById(entityId)
        .select('sourceLead')
        .lean()
        .exec();
      const leadId = (client as { sourceLead?: Types.ObjectId } | null)
        ?.sourceLead;
      if (leadId) {
        const fromLead = await this.rawTrackingRows(String(leadId), 'leads');
        return this.mergeTrackingDeduped(base, fromLead);
      }
    }
    return base;
  }

  /**
   * Contact view: own sends + sends logged on associated leads, deals, companies, and other contacts.
   * Deduped by trackingToken; optional _recordContext marks rows from linked records.
   */
  async getAggregatedTrackingForContact(
    contactId: string,
  ): Promise<Array<EmailTracking & { _recordContext?: string }>> {
    if (!contactId?.match(/^[0-9a-fA-F]{24}$/)) return [];

    const contact = await this.contactModel
      .findById(contactId)
      .select(
        'associatedLeads associatedDeals associatedOrganizations associatedContacts sourceLead',
      )
      .lean()
      .exec();
    if (!contact) return [];

    type Row = EmailTracking & { _recordContext?: string };
    const seen = new Set<string>();
    const merged: Row[] = [];

    const pushRows = async (
      entityId: string,
      module: string,
      context?: string,
    ) => {
      const rows = await this.getTrackingByEntity(entityId, module);
      for (const r of rows) {
        const t = (r as { trackingToken?: string }).trackingToken;
        if (t && seen.has(t)) continue;
        if (t) seen.add(t);
        merged.push(
          context ? { ...(r as Row), _recordContext: context } : (r as Row),
        );
      }
    };

    await pushRows(contactId, 'contacts');

    const leads =
      (contact as { associatedLeads?: Types.ObjectId[] }).associatedLeads || [];
    for (const lid of leads) {
      await pushRows(String(lid), 'leads', 'Lead');
    }

    const srcLead = (contact as { sourceLead?: Types.ObjectId }).sourceLead;
    if (srcLead) {
      const sid = String(srcLead);
      const already = leads.some((l) => String(l) === sid);
      if (!already) {
        await pushRows(sid, 'leads', 'Lead');
      }
    }

    const deals =
      (contact as { associatedDeals?: Types.ObjectId[] }).associatedDeals || [];
    for (const did of deals) {
      await pushRows(String(did), 'deals', 'Deal');
    }

    const orgs =
      (contact as { associatedOrganizations?: Types.ObjectId[] })
        .associatedOrganizations || [];
    for (const oid of orgs) {
      await pushRows(String(oid), 'organizations', 'Company');
    }

    const others =
      (contact as { associatedContacts?: Types.ObjectId[] })
        .associatedContacts || [];
    for (const cid of others) {
      if (String(cid) === contactId) continue;
      await pushRows(String(cid), 'contacts', 'Contact');
    }

    merged.sort((a, b) => {
      const ta = new Date((a as { createdAt?: Date }).createdAt || 0).getTime();
      const tb = new Date((b as { createdAt?: Date }).createdAt || 0).getTime();
      return tb - ta;
    });

    return merged;
  }

  private crmRecordPathFromModule(
    module: string,
    entityId: string,
  ): string | undefined {
    const id = String(entityId || '').trim();
    if (!Types.ObjectId.isValid(id)) return undefined;
    const m = String(module || '').toLowerCase();
    if (m === 'leads') return `/crm/leads/${id}`;
    if (m === 'deals') return `/crm/deals/${id}`;
    if (m === 'contacts') return `/crm/contacts/${id}`;
    if (m === 'clients') return `/crm/clients/${id}`;
    if (m === 'organizations') return `/crm/organizations/${id}`;
    return undefined;
  }
}
