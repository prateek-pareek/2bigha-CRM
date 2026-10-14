import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";

/**
 * Shape of GET /crm/reports/performance — one live, role-scoped payload behind the
 * Agent Performance and Team & Organizations reports (FRD §14). Every number comes
 * from CRM data (leads, IVR call logs, WhatsApp, activities/tasks, listings, 2bigha PM payments).
 */
export type MetricRow = {
  leadsCreated: number;
  leadsConverted: number;
  leadsQualified: number;
  leadsLost: number;
  leadsContacted: number;
  subscribedLeads: number;
  calls: number;
  outgoingCalls: number;
  incomingCalls: number;
  connectedCalls: number;
  missedCalls: number;
  notConnectedCalls: number;
  talkTimeSec: number;
  activities: number;
  activityBreakdown: Record<string, number>;
  tasksCreated: number;
  tasksCompleted: number;
  followUpsDue: number;
  followUpsDone: number;
  followUpsOverdue: number;
  respondedLeads: number;
  pendingResponseLeads: number;
  whatsappSent: number;
  whatsappDelivered: number;
  whatsappRead: number;
  whatsappFailed: number;
  whatsappReplies: number;
  properties: number;
  farms: number;
  pmListings: number;
  listingsApproved: number;
  listingsPending: number;
  listingsRejected: number;
  subscriptionSales: number;
  revenue: number;
  // derived
  conversionRate: number;
  contactRate: number;
  connectRate: number;
  missedRate: number;
  avgCallDurationSec: number;
  taskCompletionRate: number;
  /** null = nothing was due in the period */
  followUpAdherence: number | null;
  /** null = no lead in the period has been contacted yet */
  avgResponseMins: number | null;
  whatsappReadRate: number;
  whatsappDeliveryRate: number;
  whatsappAvgReplyMins: number | null;
  listingsTotal: number;
};

export type AgentTargets = { leadsTarget: number; callsTarget: number; propertiesTarget: number };

export type AgentReportRow = MetricRow & {
  agentId: string;
  crmUserId: string | null;
  name: string;
  email: string | null;
  teamId: string;
  teamName: string;
  target: AgentTargets | null;
};

export type TeamReportRow = MetricRow & {
  teamId: string;
  teamName: string;
  teamLead: string;
  teamSize: number;
  memberIds: string[];
  totalCalls: number;
  totalLeads: number;
  totalActivities: number;
  totalProperties: number;
  messagesOutbound: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  completedCalls: number;
  avgCallDuration: number;
  connectedRate: number;
  targets: { leads: number; calls: number; listings: number };
};

export type ReportTier = "org" | "team" | "agent";

export type PerformanceReport = {
  window: string;
  windowLabel: string;
  range: { from: string; to: string; compareLabel: string };
  generatedAt: string;
  scope: { tier: ReportTier; selfId: string | null; filtered: boolean };
  totals: MetricRow;
  previousTotals: {
    leadsCreated: number;
    leadsConverted: number;
    calls: number;
    connectedCalls: number;
    activities: number;
    whatsappSent: number;
    listings: number;
  };
  unattributed: MetricRow | null;
  targets: Record<"leads" | "calls" | "listings", { actual: number; target: number }>;
  agents: AgentReportRow[];
  teams: TeamReportRow[];
  trend: Array<{
    date: string;
    leadsCreated: number;
    leadsConverted: number;
    calls: number;
    connectedCalls: number;
    incomingCalls: number;
    outgoingCalls: number;
    missedCalls: number;
    activities: number;
    whatsappSent: number;
    whatsappRead: number;
    listings: number;
  }>;
  teamTrend: { teams: string[]; data: Array<Record<string, string | number>> };
  statusFunnel: Array<{ status: string; count: number }>;
  sources: Array<{ source: string; totalLeads: number; converted: number; conversionRate: number }>;
  intents: Array<{ intentLabel: string; totalWithIntent: number; converted: number; conversionRate: number }>;
  engagement: {
    whatsapp: {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      pending: number;
      inbound: number;
      uniqueContacts: number;
      readRate: number;
      deliveryRate: number;
      avgReplyMins: number | null;
    };
    ivr: {
      total: number;
      incoming: number;
      outgoing: number;
      connected: number;
      missed: number;
      notConnected: number;
      connectRate: number;
      missedRate: number;
      talkTimeSec: number;
      avgCallDurationSec: number;
    };
  };
};

export type TwoBighaInventory = {
  connected: boolean;
  restricted?: boolean;
  properties: { total: number; byStatus: Record<string, number> } | null;
  farms: { total: number; byStatus: Record<string, number> } | null;
};

export const SCOPE_LABEL: Record<ReportTier, string> = {
  org: "Organization-wide",
  team: "My team",
  agent: "My performance",
};

function authHeaders(): Record<string, string> {
  const t = getCrmAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** `custom` date ranges are sent as `YYYY-MM-DD,YYYY-MM-DD`. */
export function windowParam(f: { dateRange: string; customDateStart?: string; customDateEnd?: string }): string {
  return f.dateRange === "custom" && f.customDateStart && f.customDateEnd
    ? `${f.customDateStart},${f.customDateEnd}`
    : f.dateRange;
}

export async function fetchPerformanceReport(params: {
  window: string;
  agents?: string[];
  teams?: string[];
  /** Bypass the API's 30s cache (manual refresh, after editing targets). */
  fresh?: boolean;
  signal?: AbortSignal;
}): Promise<PerformanceReport> {
  const q = new URLSearchParams({ window: params.window });
  if (params.agents?.length) q.set("agents", params.agents.join(","));
  if (params.teams?.length) q.set("teams", params.teams.join(","));
  if (params.fresh) q.set("fresh", "1");
  const res = await fetch(`${CRM_API_URL}/crm/reports/performance?${q.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`Report request failed (${res.status})`);
  return res.json();
}

export async function fetchTwoBighaInventory(signal?: AbortSignal): Promise<TwoBighaInventory | null> {
  try {
    const res = await fetch(`${CRM_API_URL}/crm/reports/twobigha-inventory`, {
      headers: authHeaders(),
      cache: "no-store",
      signal,
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** % change vs previous period; null when there is no baseline. */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatINR(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

const SUMMABLE: Array<keyof MetricRow> = [
  "leadsCreated", "leadsConverted", "leadsQualified", "leadsLost", "leadsContacted", "subscribedLeads",
  "calls", "outgoingCalls", "incomingCalls", "connectedCalls", "missedCalls", "notConnectedCalls", "talkTimeSec",
  "activities", "tasksCreated", "tasksCompleted", "followUpsDue", "followUpsDone", "followUpsOverdue",
  "respondedLeads", "pendingResponseLeads", "whatsappSent", "whatsappDelivered", "whatsappRead", "whatsappFailed",
  "whatsappReplies", "properties", "farms", "pmListings", "listingsApproved", "listingsPending", "listingsRejected",
  "subscriptionSales", "revenue",
];

const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** Totals for a subset of rows (rates recomputed from the summed counts, averages weighted). */
export function summarize(rows: MetricRow[]): MetricRow {
  const t: any = { activityBreakdown: {} };
  for (const k of SUMMABLE) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  for (const r of rows) {
    for (const [type, n] of Object.entries(r.activityBreakdown || {})) {
      t.activityBreakdown[type] = (t.activityBreakdown[type] || 0) + n;
    }
  }
  const respMins = rows.reduce((s, r) => s + (r.avgResponseMins ?? 0) * (r.respondedLeads || 0), 0);
  const replyMins = rows.reduce((s, r) => s + (r.whatsappAvgReplyMins ?? 0) * (r.whatsappReplies || 0), 0);
  return {
    ...t,
    conversionRate: rate(t.leadsConverted, t.leadsCreated),
    contactRate: rate(t.leadsContacted, t.leadsCreated),
    connectRate: rate(t.connectedCalls, t.calls),
    missedRate: rate(t.missedCalls, t.incomingCalls || t.calls),
    avgCallDurationSec: t.connectedCalls > 0 ? Math.round(t.talkTimeSec / t.connectedCalls) : 0,
    taskCompletionRate: rate(t.tasksCompleted, t.tasksCreated),
    followUpAdherence: t.followUpsDue > 0 ? rate(t.followUpsDone, t.followUpsDue) : null,
    avgResponseMins: t.respondedLeads > 0 ? Math.round(respMins / t.respondedLeads) : null,
    whatsappReadRate: rate(t.whatsappRead, t.whatsappSent),
    whatsappDeliveryRate: rate(t.whatsappDelivered, t.whatsappSent),
    whatsappAvgReplyMins: t.whatsappReplies > 0 ? Math.round(replyMins / t.whatsappReplies) : null,
    listingsTotal: t.properties + t.farms + t.pmListings,
  } as MetricRow;
}
