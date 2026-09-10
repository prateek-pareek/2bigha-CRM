"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import {
  Panel,
  StatTile,
  StatCell,
  StatCellGrid,
  SegmentBar,
  TargetProgress,
  MonthlyProgressChart,
  DashboardSkeleton,
  DashboardError,
  fmt,
  timeAgo,
} from "@/components/crm/dashboards/wireframe";
import {
  Users,
  Phone,
  MessageSquare,
  Gauge,
  Home,
  ShieldCheck,
  Target as TargetIcon,
  UserCog,
  FileDown,
  ChevronRight,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_week");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${CRM_API_URL}/crm/dashboard/admin?window=${dateRange}`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`Admin dashboard error: ${r.status}`);
        return r.json();
      })
      .then((res) => active && (setData(res || {}), setLoading(false)))
      .catch((err) => active && (setError(err.message || "Failed to load"), setLoading(false)));
    return () => {
      active = false;
    };
  }, [dateRange]);

  useEffect(() => load(), [load]);

  const g = data?.glance || {};
  const leads = data?.leads || {};
  const props = data?.properties || {};
  const calls = data?.calls || {};
  const wa = data?.whatsapp || {};
  const targets = data?.targets || {};

  return (
    <DashboardShell
      title="Admin Dashboard"
      description="Organization-wide CRM metrics. Open Team Lead or Agent dashboards to inspect any employee."
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/crm/workspace/team"
            className="inline-flex h-[38px] items-center rounded-[5px] border border-[var(--border-color)] bg-white px-3 text-xs font-semibold text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--surface-dim)] dark:bg-black dark:border-white/10"
          >
            Team dashboards
          </Link>
          <Link
            href="/crm/workspace/agent"
            className="inline-flex h-[38px] items-center rounded-[5px] border border-[var(--border-color)] bg-white px-3 text-xs font-semibold text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--surface-dim)] dark:bg-black dark:border-white/10"
          >
            Agent dashboards
          </Link>
        </div>
      }
    >
      {error ? (
        <DashboardError message={error} onRetry={load} />
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {/* At a glance */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatTile title="Total Leads" value={fmt(g.totalLeads)} delta={g.totalLeadsDeltaPct} sub="vs last period" icon={Users} />
            <StatTile title="Total Calls" value={fmt(g.totalCalls)} sub={`${fmt(g.totalCallsToday)} today`} icon={Phone} />
            <StatTile title="WhatsApp Reachout" value={fmt(g.whatsappReachout)} sub={`${fmt(g.whatsappReachoutToday)} today`} icon={MessageSquare} />
            <StatTile title="Overall Org Score" value={`${g.orgScore || 0}%`} sub={`avg of ${g.teamCount || 0} teams`} icon={Gauge} tone="good" />
          </div>

          <Panel title="Month-wise Progress — Leads & Calls">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Lead Metrics">
              <StatCellGrid>
                <StatCell label="Total Leads" value={fmt(leads.total)} />
                <StatCell label="Today's Leads" value={fmt(leads.today)} />
                <StatCell label="Assigned" value={fmt(leads.assigned)} />
                <StatCell label="Contacted" value={fmt(leads.contacted)} sub={`${leads.contactedPct || 0}%`} tone="good" />
                <StatCell label="Not Contacted" value={fmt(leads.notContacted)} sub={`${leads.notContactedPct || 0}%`} tone="warn" />
              </StatCellGrid>
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Lead Status Breakdown</div>
                <SegmentBar segments={(leads.statusBreakdown || []).map((s: any) => ({ label: s.status, value: s.count }))} />
              </div>
            </Panel>

            <Panel title="Property Metrics" subtitle="Property + Farm combined">
              <StatCellGrid cols={4}>
                <StatCell label="Total Listed" value={fmt(props.total)} />
                <StatCell label="Approved" value={fmt(props.approved)} tone="good" />
                <StatCell label="Pending" value={fmt(props.pending)} tone="warn" />
                <StatCell label="Rejected" value={fmt(props.rejected)} tone="bad" />
                <StatCell label="Today's Listed" value={fmt(props.todayListed)} />
                <StatCell label="Today's Approved" value={fmt(props.todayApproved)} tone="good" />
                <StatCell label="Today's Rejected" value={fmt(props.todayRejected)} tone="bad" />
              </StatCellGrid>
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Approval Status Breakdown</div>
                <SegmentBar segments={(props.breakdown || []).map((s: any) => ({ label: s.status, value: s.count }))} showPct />
              </div>
            </Panel>
          </div>

          <Panel title="IVR / Calls Metrics">
            <StatCellGrid cols={4}>
              <StatCell label="Total Calls" value={fmt(calls.total)} />
              <StatCell label="Today's Calls" value={fmt(calls.today)} />
              <StatCell label="Missed" value={fmt(calls.missed)} tone="bad" />
              <StatCell label="Connected" value={fmt(calls.connected)} tone="good" />
              <StatCell label="Not Connected" value={fmt(calls.notConnected)} tone="warn" />
              <StatCell label="Total Follow-ups" value={fmt(calls.followUpsTotal)} />
              <StatCell label="Upcoming Follow-ups" value={fmt(calls.followUpsUpcoming)} />
              <StatCell label="Today's Follow-ups" value={fmt(calls.followUpsToday)} />
            </StatCellGrid>
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Call Outcome Breakdown</div>
              <SegmentBar segments={(calls.outcomeBreakdown || []).map((s: any) => ({ label: s.name, value: s.count }))} />
            </div>
          </Panel>

          <Panel title="WhatsApp Metrics">
            <StatCellGrid cols={4}>
              <StatCell label="Total Reachout" value={fmt(wa.totalReachout)} />
              <StatCell label="Today's Reachout" value={fmt(wa.todayReachout)} />
              <StatCell label="New Messages" value={fmt(wa.newMessages)} tone="warn" />
              <StatCell label="Avg Response Time" value={`${wa.avgResponseMins || 0} min`} />
            </StatCellGrid>
            {(wa.recent || []).length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Recent WhatsApp Activity</div>
                <ul className="divide-y divide-border/60">
                  {(wa.recent || []).map((m: any, i: number) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-card-foreground">{m.contact}</span>
                        <span className="ml-2 truncate text-muted-foreground">{m.preview}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(m.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {/* Targets + Admin controls */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Team-wise Performance" className="xl:col-span-2 overflow-hidden">
              <TeamTable rows={data?.teamPerformance || []} />
            </Panel>
            <div className="space-y-6">
              <Panel title="Org Target Achievement">
                <TargetProgress
                  rows={[
                    { label: "Leads", actual: targets.leads?.actual || 0, target: targets.leads?.target ?? null },
                    { label: "Calls", actual: targets.calls?.actual || 0, target: targets.calls?.target ?? null },
                    { label: "Property + Farm Listings", actual: targets.listings?.actual || 0, target: targets.listings?.target ?? null },
                    { label: "Subscriptions (live)", actual: targets.subscriptions?.actual || 0, target: targets.subscriptions?.target ?? null },
                  ]}
                />
              </Panel>
              <Panel title="Admin Controls">
                <div className="flex flex-col divide-y divide-border/60">
                  <AdminLink href="/crm/settings/roles" icon={ShieldCheck} label="Manage Roles & Permissions" />
                  <AdminLink href="/crm/reports/agents" icon={TargetIcon} label="Set Team & Org Targets" />
                  <AdminLink href="/crm/settings/users" icon={UserCog} label="Dept. & Member CRM Access" />
                  <AdminLink href="/crm/reports" icon={FileDown} label="Export Report (Excel / PDF)" />
                </div>
              </Panel>
            </div>
          </div>

          <Panel title="Org-wide Leaderboard — Top Agents" className="overflow-hidden">
            <LeaderTable rows={data?.leaderboard || []} />
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}

function AdminLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between py-2.5 text-sm text-card-foreground transition-colors hover:text-primary">
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function TeamTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="py-6 text-center text-sm text-muted-foreground">No team data</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2">Team Lead</th>
            <th className="px-3 py-2 text-right">Members</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Calls</th>
            <th className="px-3 py-2 text-right">Connected</th>
            <th className="px-3 py-2 text-right">Props</th>
            <th className="px-3 py-2 text-right">Task %</th>
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">View</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.teamId} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2 font-medium text-card-foreground">{t.team}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.teamLead}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(t.members)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(t.leads)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(t.calls)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{t.connected}%</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(t.properties)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{t.taskCompletion}%</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{t.score}%</td>
              <td className="px-3 py-2 text-right">
                {t.teamId ? (
                  <Link
                    href={`/crm/workspace/team?teamLead=${encodeURIComponent(String(t.teamId))}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="py-6 text-center text-sm text-muted-foreground">No leaderboard data</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-center">Rank</th>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Calls</th>
            <th className="px-3 py-2 text-right">Properties</th>
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">View</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map((a, i) => (
            <tr key={a.id} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0
                      ? "bg-yellow-100 text-yellow-700"
                      : i === 1
                        ? "bg-gray-200 text-gray-700"
                        : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-card-foreground">{a.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{a.team}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(a.leads)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(a.calls)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(a.properties)}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{a.score}</td>
              <td className="px-3 py-2 text-right">
                {a.id ? (
                  <Link
                    href={`/crm/workspace/agent?agent=${encodeURIComponent(String(a.id))}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Open
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
