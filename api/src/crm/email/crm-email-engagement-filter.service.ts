import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Email, EmailDocument } from '../schemas/email.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  CrmEmailEngagementBatchService,
  CrmEmailEngagementStatsDto,
} from './crm-email-engagement-batch.service';

export type CrmEmailEngagementListFilter = {
  lastActivity?:
    | 'all'
    | 'today'
    | 'last7'
    | 'last30'
    | 'last90'
    | 'no-activity';
  emailOpenMode?:
    | 'all'
    | 'opened'
    | 'opened-in-days'
    | 'last-sent-unopened-days'
    | 'no-open-since-days';
  emailOpenDays?: number;
  emailReply?: 'all' | 'replied' | 'not-replied';
  emailSent?: 'all' | 'not-sent' | 'sent';
};

const MODULE_MAP = {
  leads: { mod: 'leads', relatedType: 'Lead' },
  contacts: { mod: 'contacts', relatedType: 'Contact' },
  organizations: { mod: 'organizations', relatedType: 'Organization' },
} as const;

export type CrmEmailFilterModule = keyof typeof MODULE_MAP;

export function parseCrmEmailEngagementQuery(query: {
  lastActivity?: string;
  emailOpenMode?: string;
  emailOpenDays?: string;
  emailReply?: string;
  emailSent?: string;
}): CrmEmailEngagementListFilter | null {
  const lastActivity = query.lastActivity?.trim() as
    | CrmEmailEngagementListFilter['lastActivity']
    | undefined;
  const emailOpenMode = query.emailOpenMode?.trim() as
    | CrmEmailEngagementListFilter['emailOpenMode']
    | undefined;
  const emailReply = query.emailReply?.trim() as
    | CrmEmailEngagementListFilter['emailReply']
    | undefined;
  const emailSent = query.emailSent?.trim() as
    | CrmEmailEngagementListFilter['emailSent']
    | undefined;
  const days = Number(query.emailOpenDays);
  const emailOpenDays = Number.isFinite(days) && days > 0 ? days : 7;

  const filter: CrmEmailEngagementListFilter = {
    lastActivity: lastActivity || 'all',
    emailOpenMode: emailOpenMode || 'all',
    emailOpenDays,
    emailReply: emailReply || 'all',
    emailSent: emailSent || 'all',
  };

  return hasActiveEmailEngagementFilter(filter) ? filter : null;
}

export function hasActiveEmailEngagementFilter(
  filter: CrmEmailEngagementListFilter | null | undefined,
): boolean {
  if (!filter) return false;
  return (
    (filter.lastActivity != null && filter.lastActivity !== 'all') ||
    (filter.emailOpenMode != null && filter.emailOpenMode !== 'all') ||
    (filter.emailReply != null && filter.emailReply !== 'all') ||
    (filter.emailSent != null && filter.emailSent !== 'all')
  );
}

function hasPositiveEmailEngagementFilters(
  filter: CrmEmailEngagementListFilter,
): boolean {
  return (
    (filter.lastActivity != null &&
      filter.lastActivity !== 'all' &&
      filter.lastActivity !== 'no-activity') ||
    (filter.emailOpenMode != null && filter.emailOpenMode !== 'all') ||
    (filter.emailReply != null && filter.emailReply !== 'all') ||
    filter.emailSent === 'sent'
  );
}

function matchesEmailEngagementStats(
  stats: CrmEmailEngagementStatsDto,
  filter: CrmEmailEngagementListFilter,
): boolean {
  const now = Date.now();
  const startOfToday = new Date(new Date().toDateString()).getTime();
  const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000;

  const last = stats.latestActivityIso;
  const lastTs = last ? new Date(last).getTime() : NaN;

  if (filter.lastActivity === 'no-activity') {
    if (last) return false;
  } else if (filter.lastActivity && filter.lastActivity !== 'all') {
    if (!last || Number.isNaN(lastTs)) return false;
    if (filter.lastActivity === 'today' && lastTs < startOfToday) return false;
    if (filter.lastActivity === 'last7' && lastTs < daysAgo(7)) return false;
    if (filter.lastActivity === 'last30' && lastTs < daysAgo(30)) return false;
    if (filter.lastActivity === 'last90' && lastTs < daysAgo(90)) return false;
  }

  const clampedDays = Math.max(1, Math.min(365, filter.emailOpenDays ?? 7));
  const dayMs = clampedDays * 24 * 60 * 60 * 1000;

  if (filter.emailOpenMode === 'opened') {
    if (!stats.engagement.opened && stats.latestAnyOpenAtMs == null) return false;
  }
  if (filter.emailOpenMode === 'opened-in-days') {
    if (stats.latestAnyOpenAtMs == null) return false;
    if (stats.latestAnyOpenAtMs < now - dayMs) return false;
  }
  if (filter.emailOpenMode === 'last-sent-unopened-days') {
    if (stats.lastOutboundSentAtMs == null) return false;
    if (stats.lastOutboundSendOpened) return false;
    if (now - stats.lastOutboundSentAtMs < dayMs) return false;
  }
  if (filter.emailOpenMode === 'no-open-since-days') {
    if (stats.lastOutboundSentAtMs == null) return false;
    const openCutoff = now - dayMs;
    if (
      stats.latestAnyOpenAtMs != null &&
      stats.latestAnyOpenAtMs >= openCutoff
    ) {
      return false;
    }
  }

  if (filter.emailReply === 'replied') {
    if (!stats.hasInboundThreadReply) return false;
  }
  if (filter.emailReply === 'not-replied') {
    if (stats.hasInboundThreadReply) return false;
  }

  if (filter.emailSent === 'sent' && !stats.engagement.sent) return false;
  if (filter.emailSent === 'not-sent' && stats.engagement.sent) return false;

  return true;
}

@Injectable()
export class CrmEmailEngagementFilterService {
  constructor(
    @InjectModel(Email.name, 'crmConnection')
    private readonly emailModel: Model<EmailDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private readonly trackingModel: Model<EmailTrackingDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly batchService: CrmEmailEngagementBatchService,
  ) {}

  /**
   * Restrict a list query to entities matching email engagement filters.
   * Returns null when no email filters are active.
   * For `no-activity`, uses $nin on ids that have any email activity.
   */
  async applyEmailEngagementToFilter(
    baseFilter: Record<string, unknown>,
    module: CrmEmailFilterModule,
    emailFilter: CrmEmailEngagementListFilter | null,
  ): Promise<Record<string, unknown>> {
    if (!hasActiveEmailEngagementFilter(emailFilter)) {
      return baseFilter;
    }

    const { mod } = MODULE_MAP[module];

    let filter: Record<string, unknown> = baseFilter;

    if (emailFilter!.emailSent === 'not-sent') {
      const idsWithSends = await this.collectIdsWithOutboundSends(mod);
      if (idsWithSends.length) {
        filter = {
          $and: [filter, { _id: { $nin: idsWithSends } }],
        };
      }
      if (!hasPositiveEmailEngagementFilters(emailFilter!)) {
        return filter;
      }
    }

    if (emailFilter!.lastActivity === 'no-activity') {
      // Align with list column / batch stats: only exclude ids that have a
      // real latestActivityIso (not merely an empty/draft email row).
      const idsWithActivity = await this.collectIdsWithLatestActivity(module);
      if (idsWithActivity.length) {
        filter = {
          $and: [filter, { _id: { $nin: idsWithActivity } }],
        };
      }
      if (!hasPositiveEmailEngagementFilters(emailFilter!)) {
        return filter;
      }
    }

    const matchingIds = await this.collectMatchingEntityIds(
      module,
      emailFilter!,
    );
    if (!matchingIds.length) {
      return { $and: [filter, { _id: { $in: [] } }] };
    }
    return {
      $and: [filter, { _id: { $in: matchingIds } }],
    };
  }

  private async collectIdsWithOutboundSends(
    mod: string,
  ): Promise<Types.ObjectId[]> {
    const [fromEmails, fromTracking, fromOrgLinked] = await Promise.all([
      this.emailModel.distinct('entityId', {
        module:
          mod === 'organizations'
            ? { $in: ['organizations', 'organization'] }
            : mod,
        status: { $in: ['sent', 'opened', 'clicked'] },
      }),
      this.trackingModel.distinct('entityId', {
        module:
          mod === 'organizations'
            ? { $in: ['organizations', 'organization'] }
            : mod,
      }),
      mod === 'organizations'
        ? this.collectOrganizationLinkedEmailEntityIds({
            status: { $in: ['sent', 'opened', 'clicked'] },
          })
        : Promise.resolve([] as Types.ObjectId[]),
    ]);

    const seen = new Set<string>();
    const out: Types.ObjectId[] = [];
    const add = (raw: unknown) => {
      const s = String(raw ?? '');
      if (!Types.ObjectId.isValid(s) || seen.has(s)) return;
      seen.add(s);
      out.push(new Types.ObjectId(s));
    };
    for (const id of fromEmails) add(id);
    for (const id of fromTracking) add(id);
    for (const id of fromOrgLinked) add(id);
    return out;
  }

  /**
   * Company list "Last Email Activity" uses `/communications/emails/entity/:id`
   * (any module). Include those entityIds when they belong to an organization.
   */
  private async collectOrganizationLinkedEmailEntityIds(
    extraMatch: Record<string, unknown> = {},
  ): Promise<Types.ObjectId[]> {
    const rows = await this.emailModel
      .aggregate<{ _id: Types.ObjectId }>([
        {
          $match: {
            entityId: { $exists: true, $ne: null },
            ...extraMatch,
          },
        },
        { $group: { _id: '$entityId' } },
        {
          $lookup: {
            from: 'organizations',
            localField: '_id',
            foreignField: '_id',
            as: 'org',
          },
        },
        { $match: { 'org.0': { $exists: true } } },
        { $limit: 5000 },
        { $project: { _id: 1 } },
      ])
      .exec();
    return rows
      .map((r) => r._id)
      .filter((id) => id && Types.ObjectId.isValid(String(id)));
  }

  private async collectIdsWithAnyActivity(
    mod: string,
    relatedType: string,
  ): Promise<Types.ObjectId[]> {
    const [fromEmails, fromTracking, fromReplies, fromOrgLinked] =
      await Promise.all([
        this.emailModel.distinct('entityId', {
          module:
            mod === 'organizations'
              ? { $in: ['organizations', 'organization'] }
              : mod,
        }),
        this.trackingModel.distinct('entityId', {
          module:
            mod === 'organizations'
              ? { $in: ['organizations', 'organization'] }
              : mod,
        }),
        this.activityModel.distinct('relatedTo', {
          type: 'Email',
          relatedType,
          'metadata.direction': 'inbound',
          'metadata.matchReason': 'in_reply_to',
        }),
        mod === 'organizations'
          ? this.collectOrganizationLinkedEmailEntityIds()
          : Promise.resolve([] as Types.ObjectId[]),
      ]);

    const seen = new Set<string>();
    const out: Types.ObjectId[] = [];
    const add = (raw: unknown) => {
      const s = String(raw ?? '');
      if (!Types.ObjectId.isValid(s) || seen.has(s)) return;
      seen.add(s);
      out.push(new Types.ObjectId(s));
    };
    for (const id of fromEmails) add(id);
    for (const id of fromTracking) add(id);
    for (const id of fromReplies) add(id);
    for (const id of fromOrgLinked) add(id);
    return out;
  }

  /**
   * Entity ids that have a non-null latestActivityIso (same signal as the
   * contacts/leads "Last Email Activity" column).
   */
  private async collectIdsWithLatestActivity(
    module: CrmEmailFilterModule,
  ): Promise<Types.ObjectId[]> {
    const { mod, relatedType } = MODULE_MAP[module];
    const candidates = await this.collectIdsWithAnyActivity(mod, relatedType);
    if (!candidates.length) return [];

    const withLatest: Types.ObjectId[] = [];
    const chunkSize = 500;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const idStrs = chunk.map((id) => String(id));
      const { byId } = await this.batchService.getBatchForModule(idStrs, module);
      for (const id of idStrs) {
        if (byId[id]?.latestActivityIso) {
          withLatest.push(new Types.ObjectId(id));
        }
      }
    }
    return withLatest;
  }

  private async collectMatchingEntityIds(
    module: CrmEmailFilterModule,
    emailFilter: CrmEmailEngagementListFilter,
  ): Promise<Types.ObjectId[]> {
    const { mod, relatedType } = MODULE_MAP[module];
    const candidates = await this.collectIdsWithAnyActivity(mod, relatedType);
    if (!candidates.length) return [];

    const matching: Types.ObjectId[] = [];
    const chunkSize = 500;

    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const idStrs = chunk.map((id) => String(id));
      const { byId } = await this.batchService.getBatchForModule(idStrs, module);
      for (const id of idStrs) {
        const stats = byId[id] ?? {
          latestActivityIso: null,
          engagement: { sent: false, opened: false },
          lastOutboundSentAtMs: null,
          lastOutboundSendOpened: false,
          latestAnyOpenAtMs: null,
          hasInboundThreadReply: false,
        };
        if (matchesEmailEngagementStats(stats, emailFilter)) {
          matching.push(new Types.ObjectId(id));
        }
      }
    }

    return matching;
  }

  /**
   * Sort entity ObjectIds by latest email engagement (sent / open / reply).
   * Records with no activity sort last when descending, first when ascending.
   */
  async sortEntityIdsByLastEmailActivity(
    ids: Types.ObjectId[],
    module: CrmEmailFilterModule,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<Types.ObjectId[]> {
    if (!ids.length) return [];

    const lastAt = new Map<string, number>();
    const chunkSize = 500;
    const idStrs = ids.map((id) => String(id));

    for (let i = 0; i < idStrs.length; i += chunkSize) {
      const chunk = idStrs.slice(i, i + chunkSize);
      const { byId } = await this.batchService.getBatchForModule(chunk, module);
      for (const id of chunk) {
        const iso = byId[id]?.latestActivityIso;
        const ms = iso ? new Date(iso).getTime() : NaN;
        lastAt.set(id, Number.isFinite(ms) ? ms : 0);
      }
    }

    const desc = sortOrder !== 'asc';
    return [...ids].sort((a, b) => {
      const ta = lastAt.get(String(a)) ?? 0;
      const tb = lastAt.get(String(b)) ?? 0;
      if (ta !== tb) return desc ? tb - ta : ta - tb;
      return String(b).localeCompare(String(a));
    });
  }
}
