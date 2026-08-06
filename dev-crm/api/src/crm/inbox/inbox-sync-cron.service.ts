import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import { InboxEmail, InboxEmailDocument } from '../schemas/inbox-email.schema';
import { InboxAccountsService } from './inbox-accounts.service';
import { InboxClassificationService } from './inbox-classification.service';

@Injectable()
export class InboxSyncCronService {
  private readonly logger = new Logger(InboxSyncCronService.name);
  private isRunning = false;
  private readonly maxAccountsPerTick = 10;

  constructor(
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private readonly accountModel: Model<UserEmailAccountDocument>,
    @InjectModel(InboxEmail.name, 'crmConnection')
    private readonly inboxEmailModel: Model<InboxEmailDocument>,
    private readonly inboxAccountsService: InboxAccountsService,
    private readonly classificationService: InboxClassificationService,
  ) {}

  private withJitter(baseMs: number, pct: number): number {
    const spread = Math.max(1, Math.floor(baseMs * pct));
    const delta = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
    return Math.max(10_000, baseMs + delta);
  }

  private isRateLimitedError(err: unknown): boolean {
    const m =
      err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
      m.includes('429') ||
      m.includes('rate limit') ||
      m.includes('too many requests') ||
      m.includes('throttl')
    );
  }

  private parseRetryAfterMs(err: unknown): number | null {
    const message =
      err instanceof Error ? err.message : String(err || '');
    const secondsMatch = message.match(/retry-?after[^0-9]*(\d{1,5})/i);
    if (secondsMatch?.[1]) {
      const sec = Number(secondsMatch[1]);
      if (Number.isFinite(sec) && sec > 0) return sec * 1000;
    }
    return null;
  }

  private nextAllowedMs(account: {
    syncState?: { nextAllowedSyncAt?: Date | string };
  }): number {
    const raw = account?.syncState?.nextAllowedSyncAt;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  private lastSuccessMs(account: {
    syncState?: { lastSyncSuccessAt?: Date | string };
  }): number {
    const raw = account?.syncState?.lastSyncSuccessAt;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  @Interval('crm-inbox-background-sync', 30_000)
  async syncActiveInboxAccounts() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const now = Date.now();
      const activeAccounts = await this.accountModel
        .find({ isActive: true })
        .select('_id userId syncState')
        .lean()
        .exec();

      // Fair queue: oldest-due first, then least-recently-succeeded, so busy
      // mailboxes cannot starve others when the tick caps at maxAccountsPerTick.
      const dueAccounts = activeAccounts
        .filter((account) => this.nextAllowedMs(account) <= now)
        .sort((a, b) => {
          const dueDiff = this.nextAllowedMs(a) - this.nextAllowedMs(b);
          if (dueDiff !== 0) return dueDiff;
          return this.lastSuccessMs(a) - this.lastSuccessMs(b);
        })
        .slice(0, this.maxAccountsPerTick);

      for (const account of dueAccounts) {
        const accountId = String(account._id);
        const ownerUserId = String(account.userId);
        const prevFailures = Math.max(
          0,
          Number(account?.syncState?.consecutiveFailures || 0),
        );
        const prevIdle = Math.max(
          0,
          Number(account?.syncState?.consecutiveIdleSyncs || 0),
        );
        const startedAt = new Date();
        await this.accountModel.updateOne(
          { _id: account._id },
          { $set: { 'syncState.lastSyncAttemptAt': startedAt } },
        );
        try {
          const inboxResult = await this.inboxAccountsService.syncInbox(
            ownerUserId,
            accountId,
            'INBOX',
            100,
          );
          if (inboxResult.lockSkipped) {
            // Short backoff so a lock-held account does not monopolize due slots.
            const nextAllowedSyncAt = new Date(
              Date.now() + this.withJitter(20_000, 0.25),
            );
            await this.accountModel.updateOne(
              { _id: account._id },
              {
                $set: {
                  'syncState.lastSyncAttemptAt': startedAt,
                  'syncState.nextAllowedSyncAt': nextAllowedSyncAt,
                  'syncState.lastError': 'Sync skipped — mailbox lock held',
                },
              },
            );
            continue;
          }
          const synced = inboxResult.synced;
          if (prevIdle % 4 === 0) {
            const fullAccount =
              await this.inboxAccountsService.getAccountWithCredentials(
                ownerUserId,
                accountId,
              );
            const sentFolder = fullAccount
              ? this.inboxAccountsService.resolveSentFolderForAccount(
                  fullAccount,
                )
              : this.inboxAccountsService.resolveSyncFolderPath('sent');
            try {
              const sentResult = await this.inboxAccountsService.syncInbox(
                ownerUserId,
                accountId,
                sentFolder,
                30,
              );
              if (sentResult.lockSkipped) {
                this.logger.debug(
                  `Skipped sent-folder sync for ${accountId} — lock held`,
                );
              }
            } catch (sentErr: unknown) {
              this.logger.warn(
                `Background sent-folder sync failed for account ${accountId}: ${
                  sentErr instanceof Error ? sentErr.message : String(sentErr)
                }`,
              );
            }
          }
          const idleStreak = synced > 0 ? 0 : prevIdle + 1;
          const baseIntervalMs =
            synced > 0
              ? 45_000
              : Math.min(10 * 60_000, 90_000 + idleStreak * 45_000);
          const nextAllowedSyncAt = new Date(
            Date.now() + this.withJitter(baseIntervalMs, 0.15),
          );
          await this.accountModel.updateOne(
            { _id: account._id },
            {
              $set: {
                'syncState.lastSyncAttemptAt': startedAt,
                'syncState.lastSyncSuccessAt': new Date(),
                'syncState.nextAllowedSyncAt': nextAllowedSyncAt,
                'syncState.consecutiveFailures': 0,
                'syncState.consecutiveIdleSyncs': idleStreak,
                'syncState.lastSyncResultCount': synced,
                'syncState.lastError': '',
              },
            },
          );
        } catch (err: unknown) {
          const failed = prevFailures + 1;
          const retryAfterMs = this.parseRetryAfterMs(err);
          const baseBackoffMs = retryAfterMs
            ? Math.max(60_000, retryAfterMs)
            : this.isRateLimitedError(err)
            ? Math.min(60 * 60_000, 5 * 60_000 * failed)
            : Math.min(30 * 60_000, 30_000 * 2 ** Math.min(failed, 6));
          const nextAllowedSyncAt = new Date(
            Date.now() + this.withJitter(baseBackoffMs, 0.2),
          );
          await this.accountModel.updateOne(
            { _id: account._id },
            {
              $set: {
                'syncState.lastSyncAttemptAt': startedAt,
                'syncState.nextAllowedSyncAt': nextAllowedSyncAt,
                'syncState.consecutiveFailures': failed,
                'syncState.lastError':
                  err instanceof Error ? err.message : String(err),
                'syncState.lastErrorAt': new Date(),
              },
            },
          );
          this.logger.warn(
            `Background inbox sync failed for account ${accountId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  @Interval('crm-inbox-retroactive-classification', 5 * 60_000)
  async backfillClassifications() {
    try {
      // Find emails without category, limit batch to avoid overhead
      const emails = await this.inboxEmailModel
        .find({
          $or: [
            { classificationVersion: { $exists: false } },
            { classificationVersion: { $lt: 2 } },
          ],
        })
        .limit(100)
        .exec();

      if (emails.length === 0) return;

      this.logger.log(`Backfilling classification for ${emails.length} emails...`);

      for (const email of emails) {
        try {
          const classification = await this.classificationService.classify(
            {
              from: email.from,
              subject: email.subject,
              body: email.body,
              bodyHtml: email.bodyHtml,
              categoryOverride: email.categoryOverride,
              meta: {
                headers: (email.meta as any)?.headers || {},
                isReplyToUser: !!(email.meta as any)?.inReplyTo,
              }
            },
            email.userId?.toString() || ''
          );

          if (email.categoryOverride) continue;

          await this.inboxEmailModel.updateOne(
            { _id: email._id },
            {
              $set: {
                category: classification.category,
                score: classification.score,
                confidence: classification.confidence,
                classificationVersion: classification.version,
                classificationReasons: classification.reasons,
              }
            }
          );
        } catch (err: unknown) {
          this.logger.warn(
            `Classification backfill failed for ${email._id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Classification backfill tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
