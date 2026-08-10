/** Per-entity email stats for CRM list/kanban badges and open/stale filters (communications + tracking + inbox activities). */

export type CrmEmailEngagementStats = {
  latestActivityIso: string | null;
  engagement: { sent: boolean; opened: boolean };
  /** Most recent outbound send time (ms). */
  lastOutboundSentAtMs: number | null;
  /** Whether the chronologically latest outbound send has any recorded open. */
  lastOutboundSendOpened: boolean;
  /** Most recent recipient open time across tracked sends + CRM email rows (ms), or null if never opened. */
  latestAnyOpenAtMs: number | null;
  /** True if a synced inbox message was matched as In-Reply-To to our CRM send. */
  hasInboundThreadReply: boolean;
};

/** CRM `Email` rows (GET `/communications/emails/entity/:id`). */
function summarizeCrmEmailRows(emails: any[]): {
  latest: string | null;
  engagement: { sent: boolean; opened: boolean };
} {
  if (!Array.isArray(emails) || emails.length === 0) {
    return { latest: null, engagement: { sent: false, opened: false } };
  }
  const latest = emails.reduce((best: string | null, row: any) => {
    const candidate =
      row?.updatedAt || row?.createdAt || row?.meta?.sentAt || row?.meta?.deliveredAt || null;
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
    engagement: { sent: outboundSent.length > 0, opened: outboundSent.length > 0 && opened },
  };
}

function parseTimeMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Inbox-synced CRM activities: reply in thread to a tracked outbound send (see inbox-accounts.service). */
function hasInboundThreadReplyFromActivities(activities: any[]): boolean {
  if (!Array.isArray(activities)) return false;
  return activities.some(
    (a) =>
      String(a?.type || '') === 'Email' &&
      String(a?.metadata?.direction || '').toLowerCase() === 'inbound' &&
      a?.metadata?.matchReason === 'in_reply_to',
  );
}

export function deriveCrmEmailEngagementStats(
  emails: any[],
  tracking: any[],
  activities: any[],
): CrmEmailEngagementStats {
  const list = Array.isArray(emails) ? emails : [];
  const trk = Array.isArray(tracking) ? tracking : [];

  const { latest: latestFromEmails, engagement: fromEmails } = summarizeCrmEmailRows(list);

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
      parseTimeMs(t?.createdAt) ?? parseTimeMs((t as { updatedAt?: string })?.updatedAt);
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
    const m = parseTimeMs(t?.createdAt) ?? parseTimeMs((t as { updatedAt?: string })?.updatedAt);
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
  const hasInboundThreadReply = hasInboundThreadReplyFromActivities(activities);

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

export const emptyCrmEmailEngagementStats = (): CrmEmailEngagementStats => ({
  latestActivityIso: null,
  engagement: { sent: false, opened: false },
  lastOutboundSentAtMs: null,
  lastOutboundSendOpened: false,
  latestAnyOpenAtMs: null,
  hasInboundThreadReply: false,
});

/** True when no tracked or CRM outbound email has been sent to this entity. */
export function hasOutboundEmailSent(
  stats: CrmEmailEngagementStats | undefined,
): boolean {
  return Boolean(stats?.engagement?.sent);
}
