import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Email, EmailDocument } from '../schemas/email.schema';
import {
  EmailTracking,
  EmailTrackingDocument,
} from '../schemas/email-tracking.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';

/** Matches portal `CrmEmailEngagementStats` (crmEmailEngagementStats.ts). */
export type CrmEmailEngagementStatsDto = {
  latestActivityIso: string | null;
  engagement: { sent: boolean; opened: boolean };
  lastOutboundSentAtMs: number | null;
  lastOutboundSendOpened: boolean;
  latestAnyOpenAtMs: number | null;
  hasInboundThreadReply: boolean;
};

const MAX_BATCH = 500;

function emptyStats(): CrmEmailEngagementStatsDto {
  return {
    latestActivityIso: null,
    engagement: { sent: false, opened: false },
    lastOutboundSentAtMs: null,
    lastOutboundSendOpened: false,
    latestAnyOpenAtMs: null,
    hasInboundThreadReply: false,
  };
}

function parseTimeMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? null : t;
}

function summarizeCrmEmailRows(emails: any[]): {
  latest: string | null;
  engagement: { sent: boolean; opened: boolean };
} {
  if (!Array.isArray(emails) || emails.length === 0) {
    return { latest: null, engagement: { sent: false, opened: false } };
  }
  const latest = emails.reduce((best: string | null, row: any) => {
    const candidate =
      row?.updatedAt ||
      row?.createdAt ||
      row?.meta?.sentAt ||
      row?.meta?.deliveredAt ||
      null;
    if (!candidate) return best;
    const ts = new Date(candidate).getTime();
    if (Number.isNaN(ts)) return best;
    if (!best) return new Date(candidate).toISOString();
    return ts > new Date(best).getTime() ? new Date(candidate).toISOString() : best;
  }, null);

  const outboundSent = emails.filter((row: any) => {
    const st = String(row?.status || '').toLowerCase();
    return st === 'sent' || st === 'opened' || st === 'clicked';
  });
  const opened = outboundSent.some((row: any) => {
    const st = String(row?.status || '').toLowerCase();
    if (st === 'opened' || st === 'clicked') return true;
    return Number(row?.openCount || row?.meta?.openCount || 0) > 0;
  });

  return {
    latest,
    engagement: {
      sent: outboundSent.length > 0,
      opened: outboundSent.length > 0 && opened,
    },
  };
}

function deriveEngagement(
  emails: any[],
  tracking: any[],
  hasInboundThreadReply: boolean,
): CrmEmailEngagementStatsDto {
  const list = Array.isArray(emails) ? emails : [];
  const trk = Array.isArray(tracking) ? tracking : [];

  const { latest: latestFromEmails, engagement: fromEmails } =
    summarizeCrmEmailRows(list);

  const sends: { atMs: number; opened: boolean }[] = [];

  for (const row of list) {
    const st = String(row?.status || '').toLowerCase();
    if (st === 'draft' || st === 'failed') continue;
    if (st !== 'sent' && st !== 'opened' && st !== 'clicked') continue;
    const atMs =
      parseTimeMs(row?.meta?.sentAt) ??
      parseTimeMs(row?.createdAt) ??
      parseTimeMs(row?.updatedAt);
    if (atMs == null) continue;
    const opened =
      st === 'opened' ||
      st === 'clicked' ||
      Number(row?.openCount || row?.meta?.openCount || 0) > 0;
    sends.push({ atMs, opened });
  }

  for (const t of trk) {
    const atMs =
      parseTimeMs(t?.createdAt) ?? parseTimeMs((t as { updatedAt?: string }).updatedAt);
    if (atMs == null) continue;
    const opened =
      Number(t?.openCount || 0) > 0 ||
      Boolean(t?.lastOpenedAt && String(t.lastOpenedAt).trim()) ||
      (Array.isArray(t?.clicks) && t.clicks.length > 0);
    sends.push({ atMs, opened });
  }

  let latestActivityMs: number | null = latestFromEmails
    ? new Date(latestFromEmails).getTime()
    : null;
  if (latestActivityMs != null && Number.isNaN(latestActivityMs)) latestActivityMs = null;

  for (const t of trk) {
    const m =
      parseTimeMs(t?.createdAt) ?? parseTimeMs((t as { updatedAt?: string }).updatedAt);
    if (m != null && (!latestActivityMs || m > latestActivityMs)) latestActivityMs = m;
  }

  let latestAnyOpenAtMs: number | null = null;
  for (const t of trk) {
    const lo = parseTimeMs(t?.lastOpenedAt);
    if (lo != null && (!latestAnyOpenAtMs || lo > latestAnyOpenAtMs)) latestAnyOpenAtMs = lo;
    const clicks = Array.isArray(t?.clicks) ? t.clicks : [];
    for (const c of clicks) {
      const cm = parseTimeMs((c as { clickedAt?: string })?.clickedAt);
      if (cm != null && (!latestAnyOpenAtMs || cm > latestAnyOpenAtMs)) {
        latestAnyOpenAtMs = cm;
      }
    }
  }
  for (const row of list) {
    const st = String(row?.status || '').toLowerCase();
    if (st !== 'opened' && st !== 'clicked') continue;
    const om =
      parseTimeMs(row?.meta?.openedAt) ??
      parseTimeMs(row?.meta?.firstOpenAt) ??
      parseTimeMs(row?.updatedAt);
    if (om != null && (!latestAnyOpenAtMs || om > latestAnyOpenAtMs)) latestAnyOpenAtMs = om;
  }

  const anyTrackedSend = trk.length > 0;
  const anyTrackedOpen = trk.some(
    (t: any) =>
      Number(t?.openCount || 0) > 0 ||
      (Array.isArray(t?.clicks) && t.clicks.length > 0),
  );
  const engagement = {
    sent: fromEmails.sent || anyTrackedSend,
    opened: fromEmails.opened || anyTrackedOpen,
  };

  if (sends.length === 0) {
    return {
      latestActivityIso:
        latestActivityMs != null ? new Date(latestActivityMs).toISOString() : null,
      engagement,
      lastOutboundSentAtMs: null,
      lastOutboundSendOpened: false,
      latestAnyOpenAtMs,
      hasInboundThreadReply,
    };
  }

  const lastOutboundSentAtMs = Math.max(...sends.map((s) => s.atMs));
  const lastOutboundSendOpened = sends
    .filter((s) => s.atMs === lastOutboundSentAtMs)
    .some((s) => s.opened);

  return {
    latestActivityIso:
      latestActivityMs != null ? new Date(latestActivityMs).toISOString() : null,
    engagement,
    lastOutboundSentAtMs,
    lastOutboundSendOpened,
    latestAnyOpenAtMs,
    hasInboundThreadReply,
  };
}

@Injectable()
export class CrmEmailEngagementBatchService {
  constructor(
    @InjectModel(Email.name, 'crmConnection')
    private readonly emailModel: Model<EmailDocument>,
    @InjectModel(EmailTracking.name, 'crmConnection')
    private readonly trackingModel: Model<EmailTrackingDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
  ) {}

  /**
   * One round-trip for CRM communications + tracking + inbound thread-reply flags,
   * matching the portal’s per-entity trio of GETs (deriveCrmEmailEngagementStats).
   */
  async getBatchForModule(
    rawIds: unknown,
    module: 'leads' | 'contacts' | 'organizations',
  ): Promise<{ byId: Record<string, CrmEmailEngagementStatsDto> }> {
    const idsIn = Array.isArray(rawIds) ? rawIds : [];
    const mod =
      module === 'contacts'
        ? 'contacts'
        : module === 'organizations'
          ? 'organizations'
          : 'leads';
    const relatedType =
      module === 'contacts'
        ? 'Contact'
        : module === 'organizations'
          ? 'Organization'
          : 'Lead';

    const seen = new Set<string>();
    const oids: Types.ObjectId[] = [];
    for (const x of idsIn) {
      const s = typeof x === 'string' ? x.trim() : '';
      if (!Types.ObjectId.isValid(s) || seen.has(s)) continue;
      seen.add(s);
      oids.push(new Types.ObjectId(s));
      if (oids.length >= MAX_BATCH) break;
    }

    if (!oids.length) {
      return { byId: {} };
    }

    const [emailDocs, trackingDocs, replyIdsRaw] = await Promise.all([
      this.emailModel
        .find({ entityId: { $in: oids } })
        .select('status createdAt updatedAt meta entityId')
        .lean()
        .exec(),
      this.trackingModel
        .find({ entityId: { $in: oids }, module: mod })
        .select('createdAt updatedAt openCount lastOpenedAt entityId')
        .lean()
        .exec(),
      this.activityModel.distinct('relatedTo', {
        type: 'Email',
        relatedTo: { $in: oids },
        relatedType,
        'metadata.direction': 'inbound',
        'metadata.matchReason': 'in_reply_to',
      }),
    ]);

    const replySet = new Set(
      (replyIdsRaw as unknown[]).map((v) => String(v)),
    );

    const emailsBy = new Map<string, any[]>();
    for (const row of emailDocs as any[]) {
      const id = String(row?.entityId ?? '');
      if (!id) continue;
      const arr = emailsBy.get(id);
      if (arr) arr.push(row);
      else emailsBy.set(id, [row]);
    }

    const trackingBy = new Map<string, any[]>();
    for (const row of trackingDocs as any[]) {
      const id = String(row?.entityId ?? '');
      if (!id) continue;
      const arr = trackingBy.get(id);
      if (arr) arr.push(row);
      else trackingBy.set(id, [row]);
    }

    const byId: Record<string, CrmEmailEngagementStatsDto> = {};
    for (const oid of oids) {
      const idStr = String(oid);
      byId[idStr] = deriveEngagement(
        emailsBy.get(idStr) || [],
        trackingBy.get(idStr) || [],
        replySet.has(idStr),
      );
    }

    return { byId };
  }
}
