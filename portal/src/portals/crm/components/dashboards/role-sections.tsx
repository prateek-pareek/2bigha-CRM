"use client";

/**
 * Sections shared by the Admin / Team Lead / Agent dashboards. Every value comes
 * from the live `/crm/dashboard/*` payload (role-dashboard.service.ts) — these
 * components only lay it out, so the three dashboards always read the same way.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { formatDateWindowLabel } from "@/lib/crm/shared/date-range-window";
import {
  Panel,
  StatCell,
  StatCellGrid,
  SegmentBar,
  TargetProgress,
  fmt,
  timeAgo,
} from "@/components/crm/dashboards/wireframe";

const AUTO_REFRESH_MS = 30_000;

export function dashboardHeaders(): HeadersInit {
  const token = getCrmAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch a dashboard payload; re-fetches silently every 30s (and when the tab
 * regains focus) so numbers stay live without flashing the skeleton.
 */
export function useRoleDashboard(path: string | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const fetchData = useCallback(
    (silent: boolean) => {
      if (!path) {
        setData(null);
        setLoading(false);
        return;
      }
      const id = ++seq.current;
      if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      fetch(`${CRM_API_URL}${path}`, { headers: dashboardHeaders() })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null);
            throw new Error(body?.message || `Dashboard request failed (${r.status})`);
          }
          return r.json();
        })
        .then((res) => {
          if (id !== seq.current) return;
          setData(res || {});
          setError(null);
        })
        .catch((err) => {
          if (id !== seq.current) return;
          // A failed background refresh keeps the last good numbers on screen.
          if (!silent) setError(err?.message || "Failed to load");
        })
        .finally(() => {
          if (id !== seq.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [path],
  );

  useEffect(() => {
    fetchData(false);
    if (!path) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchData(true);
    }, AUTO_REFRESH_MS);
    const onFocus = () => fetchData(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchData, path]);

  return {
    data,
    loading,
    refreshing,
    error,
    reload: () => fetchData(false),
    refresh: () => fetchData(true),
  };
}

/** Fetch a small JSON list once (pickers). */
export function useDashboardList<T>(path: string | null): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    if (!path) return;
    let active = true;
    fetch(`${CRM_API_URL}${path}`, { headers: dashboardHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => active && setRows(Array.isArray(res) ? res : []))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [path]);
  return rows;
}

export function periodLabel(window?: string): string {
  if (!window) return "This period";
  return formatDateWindowLabel(window);
}

/** "Live · updated 2m ago" + data-source chips + manual refresh. */
export function LiveStatusBar({
  data,
  refreshing,
  onRefresh,
}: {
  data: any;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const sources = data?.sources || {};
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Live · updated {timeAgo(data?.computedAt)}
      </span>
      <SourceChip ok label="CRM" />
      <SourceChip ok label="IVR" />
      <SourceChip ok label="WhatsApp" />
      <SourceChip ok={!!sources.twobighaListings} label="2bigha listings" />
      <SourceChip ok={!!sources.twobighaSubscriptions} label="2bigha subscriptions" />
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-card-foreground hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
        Refresh
      </button>
    </div>
  );
}

function SourceChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={ok ? `${label}: connected` : `${label}: unavailable — showing CRM data only`}
      className={`rounded-full px-2 py-0.5 font-medium ${
        ok
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      }`}
    >
      {label}
    </span>
  );
}

export function LeadMetricsPanel({
  leads,
  title,
  window,
  showUnassigned = false,
}: {
  leads: any;
  title: string;
  window?: string;
  showUnassigned?: boolean;
}) {
  const l = leads || {};
  return (
    <Panel title={title} subtitle="Pipeline status covers every lead in scope; new leads follow the period filter">
      <StatCellGrid>
        <StatCell label="Total Leads" value={fmt(l.total)} sub="all time" />
        <StatCell label={`New · ${periodLabel(window)}`} value={fmt(l.period)} />
        <StatCell label="Today's Leads" value={fmt(l.today)} />
        <StatCell
          label={showUnassigned ? "Assigned" : "Assigned to me"}
          value={fmt(l.assigned)}
          sub={showUnassigned ? `${fmt(l.unassigned)} unassigned` : "by others"}
        />
        <StatCell label="Converted" value={fmt(l.converted)} sub={`${l.conversionPct || 0}% of total`} tone="good" />
        <StatCell label="Contacted" value={fmt(l.contacted)} sub={`${l.contactedPct || 0}%`} tone="good" />
        <StatCell label="Not Contacted" value={fmt(l.notContacted)} sub={`${l.notContactedPct || 0}%`} tone="warn" />
      </StatCellGrid>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Lead Status Breakdown</div>
        <SegmentBar segments={(l.statusBreakdown || []).map((s: any) => ({ label: s.status, value: s.count }))} showPct />
      </div>
    </Panel>
  );
}

export function PropertyMetricsPanel({
  properties,
  title,
  window,
}: {
  properties: any;
  title: string;
  window?: string;
}) {
  const p = properties || {};
  const live = p.source === "2bigha";
  return (
    <Panel
      title={title}
      subtitle={
        live
          ? `Property + Farm combined · live from 2bigha (${fmt(p.properties)} properties, ${fmt(p.farms)} farms)`
          : "Property + Farm combined · CRM listings (2bigha unavailable)"
      }
    >
      <StatCellGrid cols={4}>
        <StatCell label="Total Listed" value={fmt(p.total)} sub="all time" />
        <StatCell label="Approved" value={fmt(p.approved)} tone="good" />
        <StatCell label="Pending" value={fmt(p.pending)} tone="warn" />
        <StatCell label="Rejected" value={fmt(p.rejected)} tone="bad" />
        <StatCell
          label={`Listed · ${periodLabel(window)}`}
          value={fmt(p.period)}
          sub={`${fmt(p.periodApproved)} approved · ${fmt(p.periodRejected)} rejected`}
        />
        <StatCell label="Today's Listed" value={fmt(p.today)} />
        <StatCell label="Today's Approved" value={fmt(p.todayApproved)} tone="good" />
        <StatCell label="Today's Rejected" value={fmt(p.todayRejected)} tone="bad" />
      </StatCellGrid>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Approval Status Breakdown</div>
        <SegmentBar segments={(p.breakdown || []).map((s: any) => ({ label: s.status, value: s.count }))} showPct />
      </div>
    </Panel>
  );
}

export function CallMetricsPanel({
  calls,
  followUps,
  title,
  window,
}: {
  calls: any;
  followUps: any;
  title: string;
  window?: string;
}) {
  const c = calls || {};
  const f = followUps || {};
  const avg = Number(c.avgTalkSecs) || 0;
  return (
    <Panel title={title} subtitle={`IVR (Kommuno) + logged calls · ${periodLabel(window)}`}>
      <StatCellGrid cols={4}>
        <StatCell label="Calls" value={fmt(c.period)} sub={`${fmt(c.incoming)} in · ${fmt(c.outgoing)} out`} />
        <StatCell label="Today's Calls" value={fmt(c.today)} sub={`${fmt(c.todayConnected)} connected`} />
        <StatCell label="Connected" value={fmt(c.connected)} sub={`${c.connectRate || 0}% connect rate`} tone="good" />
        <StatCell label="Avg Talk Time" value={avg ? `${Math.floor(avg / 60)}m ${avg % 60}s` : "—"} />
        <StatCell label="Missed" value={fmt(c.missed)} sub="incoming not answered" tone="bad" />
        <StatCell label="Not Connected" value={fmt(c.notConnected)} sub="outgoing not answered" tone="warn" />
        <StatCell label="Today's Follow-ups" value={fmt(f.today)} sub={`${fmt(f.upcoming)} upcoming`} />
        <StatCell label="Overdue Follow-ups" value={fmt(f.overdue)} sub={`${fmt(f.total)} scheduled in total`} tone="bad" />
      </StatCellGrid>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Call Outcome Breakdown</div>
        <SegmentBar segments={(c.outcomeBreakdown || []).map((s: any) => ({ label: s.name, value: s.count }))} showPct />
      </div>
    </Panel>
  );
}

export function WhatsAppPanel({
  whatsapp,
  title,
  window,
}: {
  whatsapp: any;
  title: string;
  window?: string;
}) {
  const w = whatsapp || {};
  return (
    <Panel title={title} subtitle={`Messages sent from the CRM · ${periodLabel(window)}`}>
      <StatCellGrid cols={4}>
        <StatCell label="Reachout" value={fmt(w.period)} sub={`${fmt(w.contactsReached)} contacts`} />
        <StatCell label="Today's Reachout" value={fmt(w.today)} />
        <StatCell label="Unread Replies" value={fmt(w.newMessages)} tone="warn" />
        <StatCell
          label="Avg Response Time"
          value={w.avgResponseMins === null || w.avgResponseMins === undefined ? "—" : `${fmt(w.avgResponseMins)} min`}
          sub={`${w.deliveredPct || 0}% delivered · ${fmt(w.failed)} failed`}
        />
      </StatCellGrid>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Recent WhatsApp Activity</div>
        {(w.recent || []).length === 0 ? (
          <div className="py-3 text-center text-sm text-muted-foreground">No recent WhatsApp activity</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {(w.recent || []).map((m: any, i: number) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 truncate">
                  <span className="font-medium text-card-foreground">{m.contact}</span>
                  <span className="ml-2 text-muted-foreground">{m.preview}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{timeAgo(m.at)}</span>
                  <MessagePill status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function MessagePill({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "new"
      ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
      : s === "failed"
        ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10"
        : s === "read" || s === "delivered"
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"
          : "bg-blue-50 text-blue-600 dark:bg-blue-500/10";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}

export function SubscriptionsPanel({
  subscriptions,
  title,
  window,
  showPlans = false,
}: {
  subscriptions: any;
  title: string;
  window?: string;
  showPlans?: boolean;
}) {
  const s = subscriptions || {};
  return (
    <Panel
      title={title}
      subtitle={
        s.available
          ? "2bigha plans (credited to the seller, else the customer's lead owner) + PM plans sold in the CRM"
          : "2bigha unavailable right now — showing PM plans sold in the CRM"
      }
    >
      <StatCellGrid cols={4}>
        {s.available && (
          <>
            <StatCell label={`2bigha New · ${periodLabel(window)}`} value={fmt(s.period)} sub={`${fmt(s.periodPaid)} paid · ${fmt(s.today)} today`} tone="good" />
            <StatCell label="2bigha Active" value={fmt(s.active)} sub={`${fmt(s.total)} total · ${fmt(s.paid)} paid`} />
          </>
        )}
        <StatCell label={`PM Plans Sold · ${periodLabel(window)}`} value={fmt(s.pmPeriod)} sub={`${fmt(s.pmToday)} today · ${fmt(s.pmSold)} all time`} tone="good" />
        <StatCell
          label={`PM Revenue · ${periodLabel(window)}`}
          value={`₹${fmt(s.pmRevenuePeriod)}`}
          sub="verified CRM checkouts"
        />
      </StatCellGrid>
      {showPlans && (s.byPlan || []).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Active Subscriptions by Plan</div>
          <SegmentBar segments={(s.byPlan || []).map((p: any) => ({ label: p.plan, value: p.count }))} showPct />
        </div>
      )}
    </Panel>
  );
}

export function TargetsPanel({
  targets,
  title,
  subtitle,
  includeSubscriptions = false,
}: {
  targets: any;
  title: string;
  subtitle?: string;
  includeSubscriptions?: boolean;
}) {
  const t = targets || {};
  const blocks = [t.monthly, t.weekly].filter(Boolean);
  const noTargets = blocks.every((b: any) => !b.agents);
  return (
    <Panel title={title} subtitle={subtitle || (noTargets ? "No targets set yet — showing this month's actuals" : undefined)}>
      <div className="space-y-5">
        {blocks.map((b: any) => (
          <div key={b.label}>
            {blocks.length > 1 && (
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</div>
            )}
            <TargetProgress
              rows={[
                { label: `Leads (${b.label.toLowerCase()})`, actual: b.leads?.actual || 0, target: b.leads?.target ?? null },
                { label: `Calls (${b.label.toLowerCase()})`, actual: b.calls?.actual || 0, target: b.calls?.target ?? null },
                {
                  label: `Property + Farm listings (${b.label.toLowerCase()})`,
                  actual: b.listings?.actual || 0,
                  target: b.listings?.target ?? null,
                },
              ]}
            />
          </div>
        ))}
        {includeSubscriptions && t.subscriptions?.available && (
          <TargetProgress
            rows={[
              {
                label: "Subscriptions (this month)",
                actual: t.subscriptions?.actual || 0,
                target: t.subscriptions?.target ?? null,
              },
            ]}
          />
        )}
      </div>
    </Panel>
  );
}

export function TasksPanel({ tasks }: { tasks: any }) {
  const t = tasks || {};
  const rows = [
    { label: "Open", value: t.open, color: "#3b82f6" },
    { label: "In Progress", value: t.inProgress, color: "#f59e0b" },
    { label: "Completed", value: t.completed, color: "#22c55e" },
    { label: "Overdue", value: t.overdue, color: "#ef4444" },
  ];
  return (
    <Panel title="Task Status" subtitle={`${t.completionPct || 0}% complete · ${fmt(t.total)} tasks`}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
            <span className="font-semibold text-card-foreground">{fmt(r.value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AvailabilityList({ rows }: { rows: any[] }) {
  if (!rows?.length) return <div className="py-4 text-center text-sm text-muted-foreground">No members</div>;
  const pill = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("present") || s === "available") return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10";
    if (s.includes("half")) return "bg-amber-50 text-amber-600 dark:bg-amber-500/10";
    if (s.includes("not marked") || s.includes("no crm")) return "bg-muted text-muted-foreground";
    return "bg-rose-50 text-rose-600 dark:bg-rose-500/10";
  };
  return (
    <ul className="space-y-1.5">
      {rows.map((m) => (
        <li key={m.id} className="flex items-center justify-between text-sm">
          <span className="text-card-foreground">{m.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pill(m.status)}`}>{m.status}</span>
        </li>
      ))}
    </ul>
  );
}

export const SCORE_HELP =
  "Score = new leads ×10 + connected calls ×5 + listings ×20 + subscriptions ×25 + completed tasks ×5 + WhatsApp contacts ×2 (for the selected period)";
