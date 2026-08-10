import { CRM_API_URL } from '@/lib/crm/config';
import {
  deriveCrmEmailEngagementStats,
  emptyCrmEmailEngagementStats,
  type CrmEmailEngagementStats,
} from '@/lib/crm/crmEmailEngagementStats';
import { mapPool } from '@/lib/crm/shared/mapPool';

const PARALLEL_FALLBACK_CONCURRENCY = 12;
const BATCH_MAX_IDS = 500;

async function fetchOneBatchChunk(
  token: string,
  ids: string[],
  module: 'leads' | 'contacts',
): Promise<Record<string, CrmEmailEngagementStats>> {
  if (!ids.length) return {};
  const path =
    module === 'contacts'
      ? 'crm/contacts/email-engagement-batch'
      : 'crm/leads/email-engagement-batch';
  const res = await fetch(`${CRM_API_URL}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    return parallelEmailEngagementFetch(token, ids, module);
  }
  const data = (await res.json()) as { byId?: Record<string, CrmEmailEngagementStats> };
  const byId =
    data?.byId && typeof data.byId === 'object' ? data.byId : {};
  const out: Record<string, CrmEmailEngagementStats> = {};
  for (const id of ids) {
    out[id] = byId[id] ?? emptyCrmEmailEngagementStats();
  }
  return out;
}

async function parallelEmailEngagementFetch(
  token: string,
  ids: string[],
  module: 'leads' | 'contacts',
): Promise<Record<string, CrmEmailEngagementStats>> {
  const relatedType = module === 'contacts' ? 'Contact' : 'Lead';
  const entries = await mapPool(ids, PARALLEL_FALLBACK_CONCURRENCY, async (entityId) => {
    try {
      const [res, trackRes, actRes] = await Promise.all([
        fetch(`${CRM_API_URL}/communications/emails/entity/${entityId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `${CRM_API_URL}/crm/track/entity/${encodeURIComponent(entityId)}?module=${module}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        fetch(
          `${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(entityId)}&type=Email&relatedType=${relatedType}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);
      const emails = res.ok ? await res.json() : [];
      const list = Array.isArray(emails) ? emails : [];
      const trackingRaw = trackRes.ok ? await trackRes.json() : [];
      const tracking = Array.isArray(trackingRaw) ? trackingRaw : [];
      const activitiesRaw = actRes.ok ? await actRes.json() : [];
      const activities = Array.isArray(activitiesRaw) ? activitiesRaw : [];
      const stats = deriveCrmEmailEngagementStats(list, tracking, activities);
      return [entityId, stats] as const;
    } catch {
      return [entityId, emptyCrmEmailEngagementStats()] as const;
    }
  });
  return Object.fromEntries(entries);
}

/**
 * One POST per chunk for many entities; falls back to the legacy 3×N parallel pattern if the batch route fails.
 */
export async function fetchEmailEngagementBatch(
  token: string,
  ids: string[],
  module: 'leads' | 'contacts',
): Promise<Record<string, CrmEmailEngagementStats>> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    const s = typeof id === 'string' ? id.trim() : '';
    if (!s || seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  if (!unique.length) return {};

  const out: Record<string, CrmEmailEngagementStats> = {};
  try {
    for (let i = 0; i < unique.length; i += BATCH_MAX_IDS) {
      const chunk = unique.slice(i, i + BATCH_MAX_IDS);
      const part = await fetchOneBatchChunk(token, chunk, module);
      Object.assign(out, part);
    }
    return out;
  } catch {
    return parallelEmailEngagementFetch(token, unique, module);
  }
}
