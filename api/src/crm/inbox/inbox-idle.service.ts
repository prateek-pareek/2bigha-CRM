import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { ImapFlow } from 'imapflow';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';
import { InboxAccountsService } from './inbox-accounts.service';

type IdleEntry = {
  accountId: string;
  userId: string;
  client: ImapFlow;
  alive: boolean;
  lastSyncAtMs: number;
};

@Injectable()
export class InboxIdleService implements OnModuleDestroy {
  private readonly logger = new Logger(InboxIdleService.name);
  private readonly listeners = new Map<string, IdleEntry>();
  private reconciling = false;

  private readonly maxIdleConnections = Math.max(
    1,
    Number(process.env.CRM_IMAP_IDLE_MAX_CONNECTIONS || 25),
  );

  private readonly minSyncGapMs = 10_000;
  private readonly idleEnabled =
    String(process.env.CRM_IMAP_IDLE_ENABLED || 'true').toLowerCase() !==
    'false';

  constructor(
    @InjectModel(UserEmailAccount.name, 'crmConnection')
    private readonly accountModel: Model<UserEmailAccountDocument>,
    private readonly inboxAccountsService: InboxAccountsService,
  ) {}

  private canUseImapIdle(account: {
    isActive?: boolean;
    imapHost?: string;
    provider?: string;
    microsoftGraphMail?: boolean;
    preferImapIdle?: boolean;
  }): boolean {
    if (!this.idleEnabled) return false;
    if (!account?.isActive) return false;
    if (account.preferImapIdle === false) return false;
    if (!String(account.imapHost || '').trim()) return false;
    if (account.provider === 'outlook' && account.microsoftGraphMail) return false;
    return true;
  }

  isListenerActive(accountId: string): boolean {
    return this.listeners.has(accountId);
  }

  getRealtimeModeForAccount(accountId: string): 'imap_idle' | 'polling' {
    return this.isListenerActive(accountId) ? 'imap_idle' : 'polling';
  }

  private async buildImapClient(
    account: UserEmailAccountDocument,
  ): Promise<ImapFlow> {
    const auth =
      account.authType === 'oauth'
        ? {
            user: account.imapUser,
            accessToken: await this.inboxAccountsService.getValidOAuthAccessToken(
              account,
            ),
          }
        : { user: account.imapUser, pass: account.imapPassword };

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth,
      logger: false,
    });
    const accountId = String(account._id);
    client.on('error', (err: Error) => {
      this.logger.warn(`IMAP client error (${accountId}): ${err.message}`);
      const entry = this.listeners.get(accountId);
      if (entry) entry.alive = false;
    });
    await client.connect();
    await client.mailboxOpen('INBOX');
    return client;
  }

  private async stopListener(accountId: string): Promise<void> {
    const e = this.listeners.get(accountId);
    if (!e) return;
    e.alive = false;
    this.listeners.delete(accountId);
    try {
      await e.client.logout();
    } catch (_) {}
  }

  private async triggerSync(entry: IdleEntry): Promise<void> {
    const now = Date.now();
    if (now - entry.lastSyncAtMs < this.minSyncGapMs) return;
    entry.lastSyncAtMs = now;
    try {
      await this.inboxAccountsService.syncInbox(
        entry.userId,
        entry.accountId,
        'INBOX',
        30,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `IMAP IDLE sync failed for ${entry.accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async runIdleLoop(entry: IdleEntry): Promise<void> {
    while (entry.alive) {
      try {
        await entry.client.idle();
        if (!entry.alive) break;
        await this.triggerSync(entry);
      } catch (err: unknown) {
        this.logger.warn(
          `IMAP IDLE loop error for ${entry.accountId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        break;
      }
    }
    await this.stopListener(entry.accountId);
  }

  private async startListener(
    account: {
      _id: Types.ObjectId;
      userId: Types.ObjectId;
    },
  ): Promise<void> {
    const accountId = String(account._id);
    if (this.listeners.has(accountId)) return;
    const fullAccount = await this.inboxAccountsService.getAccountWithCredentials(
      String(account.userId),
      accountId,
    );
    if (!fullAccount || !this.canUseImapIdle(fullAccount)) return;
    try {
      const client = await this.buildImapClient(fullAccount);
      const entry: IdleEntry = {
        accountId,
        userId: String(account.userId),
        client,
        alive: true,
        lastSyncAtMs: 0,
      };
      this.listeners.set(accountId, entry);
      void this.runIdleLoop(entry);
      this.logger.log(`IMAP IDLE started for ${accountId}`);
    } catch (err: unknown) {
      this.logger.warn(
        `IMAP IDLE start failed for ${accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  @Interval('crm-imap-idle-reconcile', 60_000)
  async reconcileIdleListeners(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const rows = await this.accountModel
        .find({ isActive: true })
        .select(
          '_id userId provider microsoftGraphMail imapHost isDefault updatedAt preferImapIdle',
        )
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean()
        .exec();

      const eligible = rows.filter((r) => this.canUseImapIdle(r));
      const targetIds = new Set(
        eligible.slice(0, this.maxIdleConnections).map((a) => String(a._id)),
      );

      for (const accountId of this.listeners.keys()) {
        if (!targetIds.has(accountId)) {
          await this.stopListener(accountId);
        }
      }

      for (const a of eligible.slice(0, this.maxIdleConnections)) {
        await this.startListener({
          _id: a._id,
          userId: a.userId,
        });
      }
    } finally {
      this.reconciling = false;
    }
  }

  async onModuleDestroy() {
    const ids = [...this.listeners.keys()];
    for (const id of ids) {
      await this.stopListener(id);
    }
  }
}
