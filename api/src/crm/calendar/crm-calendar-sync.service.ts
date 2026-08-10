import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import {
  UserEmailAccount,
  UserEmailAccountDocument,
} from '../schemas/user-email-account.schema';

export type ExternalCalendarEvent = {
  _id: string;
  title: string;
  content?: string;
  metadata: {
    dueDate: string;
    isCalendarEvent: boolean;
    externalSource: 'google' | 'outlook';
    externalId?: string;
  };
  status?: string;
};

type CalendarProvider = 'google' | 'outlook';

@Injectable()
export class CrmCalendarSyncService {
  private readonly logger = new Logger(CrmCalendarSyncService.name);

  constructor(
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
  ) {}

  private providerKey(account: UserEmailAccount): CalendarProvider | null {
    const p = String(account.provider || '').toLowerCase();
    if (p === 'gmail') return 'google';
    if (p === 'outlook') return 'outlook';
    return null;
  }

  private async loadSyncableAccounts(
    userId: string,
    email?: string,
  ): Promise<UserEmailAccount[]> {
    return this.inboxAccountsService.findCalendarOAuthAccountsForUser(
      userId,
      email,
    );
  }

  async getConnectionStatus(
    userId: string,
    email?: string,
  ): Promise<{
    google: boolean;
    outlook: boolean;
    needsReconnect: { google: boolean; outlook: boolean };
  }> {
    const accounts = await this.loadSyncableAccounts(userId, email);
    const listed = await this.inboxAccountsService.findAccountsByUser(
      userId,
      email,
    );
    const hasOAuthListing = (provider: 'gmail' | 'outlook') =>
      listed.some(
        (a) =>
          a.isActive !== false &&
          a.authType === 'oauth' &&
          String(a.provider || '').toLowerCase() === provider,
      );

    return {
      google: accounts.some((a) => this.providerKey(a) === 'google'),
      outlook: accounts.some((a) => this.providerKey(a) === 'outlook'),
      needsReconnect: {
        google: hasOAuthListing('gmail') && !accounts.some((a) => this.providerKey(a) === 'google'),
        outlook:
          hasOAuthListing('outlook') &&
          !accounts.some((a) => this.providerKey(a) === 'outlook'),
      },
    };
  }

  async syncExternalEvents(
    userId: string,
    email?: string,
    start?: string,
    end?: string,
  ): Promise<{
    events: ExternalCalendarEvent[];
    connections: { google: boolean; outlook: boolean };
    needsReconnect: { google: boolean; outlook: boolean };
    errors: Array<{ provider: CalendarProvider; message: string }>;
  }> {
    const rangeStart = start
      ? new Date(start)
      : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const rangeEnd = end
      ? new Date(end)
      : new Date(new Date().setMonth(new Date().getMonth() + 3));

    const accounts = await this.loadSyncableAccounts(userId, email);
    const events: ExternalCalendarEvent[] = [];
    const errorsByProvider = new Map<CalendarProvider, string>();

    for (const account of accounts) {
      const provider = this.providerKey(account);
      if (!provider) continue;
      try {
        if (provider === 'google') {
          events.push(
            ...(await this.fetchGoogleEvents(account, rangeStart, rangeEnd)),
          );
        } else {
          events.push(
            ...(await this.fetchOutlookEvents(account, rangeStart, rangeEnd)),
          );
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Calendar sync failed';
        if (!errorsByProvider.has(provider)) {
          errorsByProvider.set(provider, message);
        }
        this.logger.warn(
          `Calendar sync failed for ${provider} (${account.email}): ${message}`,
        );
      }
    }

    const status = await this.getConnectionStatus(userId, email);
    const errors = Array.from(errorsByProvider.entries()).map(
      ([provider, message]) => ({ provider, message }),
    );

    if (
      !errors.length &&
      !accounts.length &&
      (status.needsReconnect.google || status.needsReconnect.outlook)
    ) {
      if (status.needsReconnect.google) {
        errors.push({
          provider: 'google',
          message:
            'Google calendar is not connected or needs reconnect — use Connect Google Calendar.',
        });
      }
      if (status.needsReconnect.outlook) {
        errors.push({
          provider: 'outlook',
          message:
            'Outlook calendar is not connected or needs reconnect — use Connect Outlook Calendar.',
        });
      }
    }

    return {
      events,
      connections: {
        google: status.google,
        outlook: status.outlook,
      },
      needsReconnect: status.needsReconnect,
      errors,
    };
  }

  private async fetchGoogleEvents(
    account: UserEmailAccount,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ExternalCalendarEvent[]> {
    const accessToken =
      await this.inboxAccountsService.getValidOAuthAccessToken(
        account as UserEmailAccountDocument,
      );
    const params = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await res.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string };
        status?: string;
      }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        json.error?.message ||
          'Google Calendar access denied — reconnect with calendar permission',
      );
    }
    return (json.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => {
        const dueDate = item.start?.dateTime
          ? new Date(item.start.dateTime).toISOString()
          : item.start?.date
            ? new Date(`${item.start.date}T09:00:00`).toISOString()
            : new Date().toISOString();
        return {
          _id: `google-${item.id || dueDate}`,
          title: item.summary || '(No title)',
          content: item.description,
          metadata: {
            dueDate,
            isCalendarEvent: true,
            externalSource: 'google' as const,
            externalId: item.id,
          },
          status: 'Synced',
        };
      });
  }

  private async fetchOutlookEvents(
    account: UserEmailAccount,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ExternalCalendarEvent[]> {
    const accessToken =
      await this.inboxAccountsService.getValidOAuthAccessToken(
        account as UserEmailAccountDocument,
      );
    const params = new URLSearchParams({
      startDateTime: rangeStart.toISOString(),
      endDateTime: rangeEnd.toISOString(),
      $top: '250',
      $orderby: 'start/dateTime',
    });
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await res.json()) as {
      value?: Array<{
        id?: string;
        subject?: string;
        bodyPreview?: string;
        start?: { dateTime?: string; timeZone?: string };
        isCancelled?: boolean;
      }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        json.error?.message ||
          'Outlook Calendar access denied — reconnect with calendar permission',
      );
    }
    return (json.value || [])
      .filter((item) => !item.isCancelled)
      .map((item) => {
        const raw = item.start?.dateTime || new Date().toISOString();
        const dueDate = new Date(
          raw.endsWith('Z') ? raw : `${raw}Z`,
        ).toISOString();
        return {
          _id: `outlook-${item.id || dueDate}`,
          title: item.subject || '(No title)',
          content: item.bodyPreview,
          metadata: {
            dueDate,
            isCalendarEvent: true,
            externalSource: 'outlook' as const,
            externalId: item.id,
          },
          status: 'Synced',
        };
      });
  }
}
