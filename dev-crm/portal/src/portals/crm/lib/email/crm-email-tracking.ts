/**
 * Server shape: api GET /crm/track/entity/:entityId?module=...
 */
import { CRM_API_URL } from '@/lib/crm/config';

export type CrmEmailTrackingRow = {
  _id: string;
  trackingToken: string;
  recipient: string;
  /** Envelope From (connected inbox), when stored on tracking */
  fromEmail?: string;
  subject?: string;
  openCount?: number;
  lastOpenedAt?: string;
  clicks?: Array<{ url: string; clickedAt: string }>;
  emailId?: string;
  createdAt?: string;
  /** Set when merged from a linked lead/deal/company/contact on contact view */
  _recordContext?: string;
};

export function buildEmailTrackingLookup(rows: CrmEmailTrackingRow[] | undefined) {
  const byEmailId: Record<string, CrmEmailTrackingRow> = {};
  const byToken: Record<string, CrmEmailTrackingRow> = {};
  if (!Array.isArray(rows)) return { byEmailId, byToken };
  for (const r of rows) {
    if (r.emailId) byEmailId[String(r.emailId)] = r;
    if (r.trackingToken) byToken[r.trackingToken] = r;
  }
  return { byEmailId, byToken };
}

/** True when the recipient engaged via pixel open and/or tracked link click. */
export function isCrmEmailEngaged(
  row: Pick<CrmEmailTrackingRow, "openCount" | "clicks"> | undefined,
): boolean {
  if (!row) return false;
  return (row.openCount ?? 0) > 0 || (row.clicks?.length ?? 0) > 0;
}

function formatEngagementWhen(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

/** Human-readable open/view badge for timeline and engagement panels. */
export function formatCrmEmailOpenBadge(row: CrmEmailTrackingRow): {
  label: string;
  lastAt: string | null;
} {
  const opens = row.openCount ?? 0;
  const clicks = row.clicks?.length ?? 0;
  const lastOpen = formatEngagementWhen(row.lastOpenedAt);
  if (opens > 0) {
    return {
      label: `${opens} open${opens === 1 ? "" : "s"}`,
      lastAt: lastOpen,
    };
  }
  if (clicks > 0) {
    const lastClickIso = row.clicks?.[clicks - 1]?.clickedAt;
    return {
      label: "Viewed (link click)",
      lastAt: formatEngagementWhen(lastClickIso) ?? lastOpen,
    };
  }
  return { label: "Not opened", lastAt: null };
}

export type CrmEmailTrackingConfig = {
  publicBaseUrl: string;
  localOnly: boolean;
};

export async function fetchCrmEmailTrackingConfig(
  token: string,
): Promise<CrmEmailTrackingConfig | null> {
  try {
    const res = await fetch(`${CRM_API_URL}/crm/track/config`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CrmEmailTrackingConfig;
  } catch {
    return null;
  }
}

export async function fetchCrmEmailTrackingForEntity(
  entityId: string,
  module: string,
  token: string,
): Promise<CrmEmailTrackingRow[]> {
  if (!entityId) return [];
  const q = new URLSearchParams({
    module: module || "leads",
    _: String(Date.now()),
  });
  try {
    const res = await fetch(
      `${CRM_API_URL}/crm/track/entity/${encodeURIComponent(entityId)}?${q}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchCrmEmailTrackingForContact(
  contactId: string,
  token: string,
): Promise<CrmEmailTrackingRow[]> {
  if (!contactId) return [];
  const q = new URLSearchParams({ _: String(Date.now()) });
  try {
    const res = await fetch(
      `${CRM_API_URL}/crm/track/contact/${encodeURIComponent(contactId)}?${q}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
