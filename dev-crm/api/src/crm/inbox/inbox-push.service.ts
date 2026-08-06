import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import { InboxAccountsService } from './inbox-accounts.service';

@Injectable()
export class InboxPushService {
  private readonly logger = new Logger(InboxPushService.name);
  private renewing = false;

  constructor(
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private readonly accountModel: Model<UserEmailAccountDocument>,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
    private readonly config: ConfigService,
  ) {}

  private getApiPublicBase(): string {
    const raw =
      this.config.get<string>('CRM_OAUTH_PUBLIC_URL') ||
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('TRACKING_BASE_URL') ||
      this.config.get<string>('API_URL') ||
      this.config.get<string>('NEXT_PUBLIC_API_URL') ||
      'http://localhost:4000';
    let base = String(raw).trim().replace(/\/$/, '');
    if (/\/api$/i.test(base)) base = base.replace(/\/api$/i, '');
    return base;
  }

  private graphWebhookUrl(): string {
    return `${this.getApiPublicBase()}/api/crm/inbox-push/microsoft/webhook`;
  }

  private getGmailTopicName(): string | undefined {
    return this.config.get<string>('CRM_GMAIL_PUBSUB_TOPIC')?.trim();
  }

  async registerPushForAccount(accountId: string): Promise<void> {
    if (!Types.ObjectId.isValid(accountId)) return;
    const account = await this.accountModel.findById(accountId).exec();
    if (!account || account.authType !== 'oauth' || !account.isActive) return;

    if (
      account.provider === 'outlook' &&
      account.microsoftGraphMail
    ) {
      await this.ensureMicrosoftSubscription(account);
      return;
    }
    if (account.provider === 'gmail') {
      await this.ensureGmailWatch(account);
    }
  }

  /** Tear down Graph / Gmail push when a mailbox is removed. */
  async unregisterPushForAccount(
    account: UserEmailAccountDocument,
  ): Promise<void> {
    if (!account || account.authType !== 'oauth') return;

    if (
      account.provider === 'outlook' &&
      account.microsoftGraphMail &&
      account.pushState?.graphSubscriptionId
    ) {
      try {
        const token =
          await this.inboxAccountsService.getValidOAuthAccessToken(account);
        const subId = String(account.pushState.graphSubscriptionId).trim();
        await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch (err: unknown) {
        this.logger.warn(
          `Graph push unregister failed for ${account.email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return;
    }

    if (account.provider === 'gmail') {
      try {
        const token =
          await this.inboxAccountsService.getValidOAuthAccessToken(account);
        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Gmail watch stop failed for ${account.email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async ensureMicrosoftSubscription(
    account: UserEmailAccountDocument,
  ): Promise<void> {
    const token = await this.inboxAccountsService.getValidOAuthAccessToken(account);
    const oldSubId = String(account.pushState?.graphSubscriptionId || '').trim();
    if (oldSubId) {
      try {
        await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(oldSubId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch (err: unknown) {
        this.logger.warn(
          `Failed to delete old Graph subscription ${oldSubId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const clientState = randomBytes(16).toString('hex');
    const expiration = new Date(Date.now() + 60 * 60 * 1000);
    const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changeType: 'created,updated',
        notificationUrl: this.graphWebhookUrl(),
        resource: 'me/mailFolders(\'inbox\')/messages',
        expirationDateTime: expiration.toISOString(),
        clientState,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || !json?.id) {
      throw new Error(
        `Microsoft push subscription failed: ${json?.error?.message || res.status}`,
      );
    }
    account.pushState = {
      ...(account.pushState || {}),
      provider: 'outlook',
      graphSubscriptionId: String(json.id),
      graphSubscriptionExpiresAt: new Date(String(json.expirationDateTime)),
      graphClientState: clientState,
      lastPushError: '',
    };
    await account.save();
  }

  private async ensureGmailWatch(account: UserEmailAccountDocument): Promise<void> {
    const topicName = this.getGmailTopicName();
    if (!topicName) return;
    const token = await this.inboxAccountsService.getValidOAuthAccessToken(account);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      throw new Error(
        `Gmail watch setup failed: ${json?.error?.message || res.status}`,
      );
    }
    const expirationMs = Number(json.expiration || 0);
    account.pushState = {
      ...(account.pushState || {}),
      provider: 'gmail',
      gmailWatchExpirationAt: expirationMs ? new Date(expirationMs) : undefined,
      gmailHistoryId: json.historyId ? String(json.historyId) : '',
      lastPushError: '',
    };
    await account.save();
  }

  handleMicrosoftValidation(validationToken?: string): string {
    return String(validationToken || '');
  }

  async handleMicrosoftNotification(payload: any): Promise<void> {
    const rows = Array.isArray(payload?.value) ? payload.value : [];
    for (const n of rows) {
      const subId = String(n?.subscriptionId || '').trim();
      if (!subId) continue;
      const account = await this.accountModel
        .findOne({ 'pushState.graphSubscriptionId': subId, isActive: true })
        .exec();
      if (!account) continue;
      const expectedClientState = String(account.pushState?.graphClientState || '');
      if (!expectedClientState || n?.clientState !== expectedClientState) {
        continue;
      }
      try {
        const syncResult = await this.inboxAccountsService.syncInbox(
          String(account.userId),
          String(account._id),
          'INBOX',
          50,
        );
        if (syncResult.lockSkipped) {
          account.pushState = {
            ...(account.pushState || {}),
            lastPushError: 'Sync skipped — mailbox lock held',
            lastPushErrorAt: new Date(),
          };
        } else {
          account.pushState = {
            ...(account.pushState || {}),
            lastPushReceivedAt: new Date(),
            lastPushError: '',
          };
        }
      } catch (err: unknown) {
        account.pushState = {
          ...(account.pushState || {}),
          lastPushError: err instanceof Error ? err.message : String(err),
          lastPushErrorAt: new Date(),
        };
      }
      await account.save();
    }
  }

  async handleGmailNotification(payload: any): Promise<void> {
    const encoded = payload?.message?.data;
    if (!encoded) return;
    let data: { emailAddress?: string } = {};
    try {
      data = JSON.parse(Buffer.from(String(encoded), 'base64').toString('utf8'));
    } catch {
      return;
    }
    const email = String(data.emailAddress || '').trim();
    if (!email) return;
    const account = await this.accountModel
      .findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), provider: 'gmail', isActive: true })
      .exec();
    if (!account) return;
    try {
      const syncResult = await this.inboxAccountsService.syncInbox(
        String(account.userId),
        String(account._id),
        'INBOX',
        50,
      );
      if (syncResult.lockSkipped) {
        account.pushState = {
          ...(account.pushState || {}),
          lastPushError: 'Sync skipped — mailbox lock held',
          lastPushErrorAt: new Date(),
        };
      } else {
        account.pushState = {
          ...(account.pushState || {}),
          lastPushReceivedAt: new Date(),
          lastPushError: '',
        };
      }
    } catch (err: unknown) {
      account.pushState = {
        ...(account.pushState || {}),
        lastPushError: err instanceof Error ? err.message : String(err),
        lastPushErrorAt: new Date(),
      };
    }
    await account.save();
  }

  @Interval('crm-inbox-push-renew', 10 * 60_000)
  async renewExpiringPushSubscriptions(): Promise<void> {
    if (this.renewing) return;
    this.renewing = true;
    try {
      const soon = new Date(Date.now() + 30 * 60_000);
      const pushRenewalConditions: Record<string, unknown>[] = [
        {
          provider: 'outlook',
          microsoftGraphMail: true,
          $or: [
            { 'pushState.graphSubscriptionExpiresAt': { $lte: soon } },
            { 'pushState.graphSubscriptionExpiresAt': { $exists: false } },
          ],
        },
      ];
      // Without a configured Pub/Sub topic Gmail intentionally falls back to IMAP/polling.
      // Do not retry watch setup every ten minutes in that mode.
      if (this.getGmailTopicName()) {
        pushRenewalConditions.push({
          provider: 'gmail',
          $or: [
            { 'pushState.gmailWatchExpirationAt': { $lte: soon } },
            { 'pushState.gmailWatchExpirationAt': { $exists: false } },
          ],
        });
      }
      const accounts = await this.accountModel
        .find({
          isActive: true,
          authType: 'oauth',
          $or: pushRenewalConditions,
        })
        .select('_id')
        .lean()
        .exec();
      for (const account of accounts) {
        try {
          await this.registerPushForAccount(String(account._id));
        } catch (err: unknown) {
          this.logger.warn(
            `Push renew failed for account ${String(account._id)}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } finally {
      this.renewing = false;
    }
  }
}
