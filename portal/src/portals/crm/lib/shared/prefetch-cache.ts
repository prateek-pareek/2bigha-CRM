import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from '@/lib/crm/config';
import { buildCrmListSearchParams } from "@/lib/crm/list-query";
import { isAdmin } from '@/lib/suite/auth';

/** Align with api-hrms Redis CRM list/reporting TTL (~90s). */
export const CRM_PREFETCH_TTL_MS = 90_000;

/** Revalidate in the background when cache is older than this (keeps UI snappy but fresh). */
export const CRM_PREFETCH_REVALIDATE_MS = 45_000;

type CacheEntry<T> = { data: T; fetchedAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function crmCacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CRM_PREFETCH_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function crmCachePeek<T>(key: string): { data: T; ageMs: number } | null {
  const entry = store.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  if (ageMs > CRM_PREFETCH_TTL_MS) {
    store.delete(key);
    return null;
  }
  return { data: entry.data as T, ageMs };
}

export function crmCacheSet<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

export function crmCacheShouldRevalidate(ageMs: number): boolean {
  return ageMs >= CRM_PREFETCH_REVALIDATE_MS;
}

export function crmCacheInvalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function notifyCrmDataChanged(detail?: { scope?: string }): void {
  if (typeof window === "undefined") return;
  const scope = detail?.scope;
  if (scope) crmCacheInvalidate(scope);
  else crmCacheInvalidate();
  window.dispatchEvent(new CustomEvent("crm-data-changed", { detail }));
}

export const crmCacheKeys = {
  pipelines: (type: "leads" | "deals") => `pipelines:${type}`,
  attention: (owner: string) => `attention:${owner || "All"}`,
  workspace: (owner: string, window: string, sections: string) =>
    `workspace:v5:${owner}:${window}:${sections}`,
  leadsList: (
    pipelineId: string,
    opts?: { page?: number; pageSize?: number; search?: string; full?: boolean },
  ) => {
    const base = pipelineId || "__all__";
    if (opts?.full) return `leads:${base}|full`;
    return `leads:${base}|p=${opts?.page ?? 1}|ps=${opts?.pageSize ?? 25}|q=${opts?.search ?? ""}`;
  },
  contactsList: (opts?: {
    page?: number;
    pageSize?: number;
    search?: string;
    filtersStr?: string;
    emailEngStr?: string;
    mine?: boolean;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const f = opts?.filtersStr ? `|f=${opts.filtersStr}` : "";
    const e = opts?.emailEngStr ? `|e=${opts.emailEngStr}` : "";
    const m = opts?.mine ? "|m=1" : "";
    const sb = `|sb=${opts?.sortBy ?? "createdAt"}`;
    const so = `|so=${opts?.sortOrder ?? "desc"}`;
    return `contacts:p=${opts?.page ?? 1}|ps=${opts?.pageSize ?? 25}|q=${opts?.search ?? ""}${f}${e}${m}${sb}${so}`;
  },
  dealsList: (
    pipelineId: string,
    opts?: { page?: number; pageSize?: number; unassigned?: boolean },
  ) =>
    `deals:${pipelineId || "__all__"}|p=${opts?.page ?? 1}|ps=${opts?.pageSize ?? 25}|ua=${opts?.unassigned ? 1 : 0}`,
};

export function runWhenIdle(work: () => void, timeoutMs = 1200): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  const cic = (window as Window & { cancelIdleCallback?: (id: number) => void })
    .cancelIdleCallback;
  if (ric && cic) {
    const handle = ric(work, { timeout: timeoutMs });
    return () => cic(handle);
  }
  const handle = window.setTimeout(work, 600);
  return () => window.clearTimeout(handle);
}


export function canViewAllCrmWorkspaces(user?: { role?: unknown }): boolean {
  return isAdmin(user as Parameters<typeof isAdmin>[0]);
}

export function defaultWorkspaceOwner(
  user?: { _id?: string; role?: unknown } | null,
): string {
  if (!user) return "All";
  return canViewAllCrmWorkspaces(user) ? "All" : String(user._id || "All");
}

export function resolveActivePipelineId(
  type: "leads" | "deals" | "platform_opportunities",
  pipelines: Array<{ _id: string; isDefault?: boolean }>,
  user?: {
    assignedLeadsPipeline?: string;
    assignedDealsPipeline?: string;
  } | null,
): { pipelineId: string; isDefault: boolean } {
  if (!pipelines.length) return { pipelineId: "", isDefault: false };
  const assigned =
    type === "leads" ? user?.assignedLeadsPipeline : user?.assignedDealsPipeline;
  if (assigned && pipelines.some((p) => String(p._id) === String(assigned))) {
    const row = pipelines.find((p) => String(p._id) === String(assigned));
    return { pipelineId: String(assigned), isDefault: !!row?.isDefault };
  }
  const storageKey =
    type === "leads"
      ? "crm_active_pipeline_leads"
      : type === "deals"
        ? "crm_active_pipeline_deals"
        : "crm_active_pipeline_platform_opportunities";
  const saved =
    typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
  if (saved && pipelines.some((p) => String(p._id) === saved)) {
    const row = pipelines.find((p) => String(p._id) === saved);
    return { pipelineId: saved, isDefault: !!row?.isDefault };
  }
  const fallback = pipelines.find((p) => p.isDefault) || pipelines[0];
  return { pipelineId: String(fallback._id), isDefault: !!fallback.isDefault };
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type WarmCrmOptions = {
  hasAccess: (permission: string) => boolean;
  user?: {
    _id?: string;
    role?: unknown;
    assignedLeadsPipeline?: string;
    assignedDealsPipeline?: string;
  } | null;
  skipWorkspace?: boolean;
  skipAttention?: boolean;
  skipLeads?: boolean;
  skipContacts?: boolean;
  skipDeals?: boolean;
};

/**
 * Warm pipelines, sales workspace summary, and first-page list data for common CRM routes.
 * Safe to call multiple times — skips keys that are still fresh.
 */
export async function warmCrmEssentials(options: WarmCrmOptions): Promise<void> {
  const token = getCrmAuthToken();
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  const { hasAccess, user } = options;
  const tasks: Array<Promise<void>> = [];

  const warmPipelines = async (type: "leads" | "deals") => {
    const key = crmCacheKeys.pipelines(type);
    if (crmCachePeek(key)) return;
    const data = await fetchJson<unknown[]>(
      `${CRM_API_URL}/crm/pipelines?type=${type}`,
      headers,
    );
    if (Array.isArray(data)) crmCacheSet(key, data);
  };

  if (hasAccess("leads:read")) {
    tasks.push(warmPipelines("leads"));
  }
  if (hasAccess("deals:read")) {
    tasks.push(warmPipelines("deals"));
  }

  if (!options.skipWorkspace && hasAccess("deals:read")) {
    tasks.push(
      (async () => {
        const owner = defaultWorkspaceOwner(user);
        const window = "last_30_days";
        const sections = hasAccess("leads:read")
          ? "deals,tasks,activity,leads"
          : "deals,tasks,activity";
        const key = crmCacheKeys.workspace(owner, window, sections);
        if (crmCachePeek(key)) return;
        const q = new URLSearchParams({ window, sections });
        if (owner && owner !== "All") q.set("owner", owner);
        const data = await fetchJson<Record<string, unknown>>(
          `${CRM_API_URL}/crm/workspace?${q}`,
          headers,
        );
        if (data && typeof data === "object") crmCacheSet(key, data);
      })(),
    );
  }

  const canUseAttention =
    hasAccess("deals:read") || hasAccess("leads:read") || hasAccess("contacts:read");
  if (!options.skipAttention && canUseAttention) {
    tasks.push(
      (async () => {
        const owner = defaultWorkspaceOwner(user);
        const key = crmCacheKeys.attention(owner);
        if (crmCachePeek(key)) return;
        const q = new URLSearchParams();
        if (owner && owner !== "All") q.set("owner", owner);
        const data = await fetchJson<Record<string, unknown>>(
          `${CRM_API_URL}/crm/reports/attention?${q}`,
          headers,
        );
        if (data && typeof data === "object") crmCacheSet(key, data);
      })(),
    );
  }

  if (!options.skipLeads && hasAccess("leads:read")) {
    tasks.push(
      (async () => {
        const pipelines =
          crmCacheGet<Array<{ _id: string; isDefault?: boolean }>>(
            crmCacheKeys.pipelines("leads"),
          ) ??
          (await fetchJson<Array<{ _id: string; isDefault?: boolean }>>(
            `${CRM_API_URL}/crm/pipelines?type=leads`,
            headers,
          ));
        if (!Array.isArray(pipelines) || !pipelines.length) return;
        if (!crmCacheGet(crmCacheKeys.pipelines("leads"))) {
          crmCacheSet(crmCacheKeys.pipelines("leads"), pipelines);
        }
        const { pipelineId } = resolveActivePipelineId("leads", pipelines, user);
        if (!pipelineId) return;
        const listKey = crmCacheKeys.leadsList(pipelineId, {
          page: 1,
          pageSize: 25,
          search: "",
          full: false,
        });
        if (crmCachePeek(listKey)) return;
        const params = buildCrmListSearchParams({
          page: 1,
          pageSize: 25,
          extra: { pipeline: pipelineId },
        });
        const payload = await fetchJson<{ data?: unknown[]; total?: number } | unknown[]>(
          `${CRM_API_URL}/crm/leads?${params.toString()}`,
          headers,
        );
        if (payload) crmCacheSet(listKey, payload);
      })(),
    );
  }

  if (!options.skipContacts && hasAccess("contacts:read")) {
    tasks.push(
      (async () => {
        const listKey = crmCacheKeys.contactsList({ page: 1, pageSize: 25, search: "" });
        if (crmCachePeek(listKey)) return;
        const params = buildCrmListSearchParams({ page: 1, pageSize: 25 });
        const payload = await fetchJson<{ data?: unknown[]; total?: number } | unknown[]>(
          `${CRM_API_URL}/crm/contacts?${params.toString()}`,
          headers,
        );
        if (payload) crmCacheSet(listKey, payload);
      })(),
    );
  }

  if (!options.skipDeals && hasAccess("deals:read")) {
    tasks.push(
      (async () => {
        const pipelines =
          crmCacheGet<Array<{ _id: string; isDefault?: boolean }>>(
            crmCacheKeys.pipelines("deals"),
          ) ??
          (await fetchJson<Array<{ _id: string; isDefault?: boolean }>>(
            `${CRM_API_URL}/crm/pipelines?type=deals`,
            headers,
          ));
        if (!Array.isArray(pipelines) || !pipelines.length) return;
        if (!crmCacheGet(crmCacheKeys.pipelines("deals"))) {
          crmCacheSet(crmCacheKeys.pipelines("deals"), pipelines);
        }
        const { pipelineId, isDefault } = resolveActivePipelineId("deals", pipelines, user);
        if (!pipelineId) return;
        const listKey = crmCacheKeys.dealsList(pipelineId, {
          page: 1,
          pageSize: 25,
          unassigned: isDefault,
        });
        if (crmCachePeek(listKey)) return;
        const params = buildCrmListSearchParams({
          page: 1,
          pageSize: 25,
          extra: {
            pipeline: pipelineId,
            unassigned: isDefault ? "1" : undefined,
          },
        });
        const payload = await fetchJson<{ data?: unknown[]; total?: number } | unknown[]>(
          `${CRM_API_URL}/crm/deals?${params.toString()}`,
          headers,
        );
        if (payload) crmCacheSet(listKey, payload);
        const otherIds = pipelines
          .map((p) => String(p._id))
          .filter((id) => id && id !== pipelineId)
          .slice(0, 2);
        await Promise.allSettled(
          otherIds.map(async (pid) => {
            const siblingKey = crmCacheKeys.dealsList(pid, {
              page: 1,
              pageSize: 25,
              unassigned: false,
            });
            if (crmCachePeek(siblingKey)) return;
            const siblingDefault = !!pipelines.find((p) => String(p._id) === pid)?.isDefault;
            const siblingParams = buildCrmListSearchParams({
              page: 1,
              pageSize: 25,
              extra: {
                pipeline: pid,
                unassigned: siblingDefault ? "1" : undefined,
              },
            });
            const siblingPayload = await fetchJson<
              { data?: unknown[]; total?: number } | unknown[]
            >(`${CRM_API_URL}/crm/deals?${siblingParams.toString()}`, headers);
            if (siblingPayload) crmCacheSet(siblingKey, siblingPayload);
          }),
        );
      })(),
    );
  }

  await Promise.allSettled(tasks);
}
