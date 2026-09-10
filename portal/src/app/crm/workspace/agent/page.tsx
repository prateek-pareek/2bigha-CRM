"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Target,
  Home,
  CheckCircle2,
  Phone,
  PhoneCall,
  MessageSquare,
  ListTodo,
  Activity as ActivityIcon,
} from "lucide-react";

export default function AgentDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("today");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${CRM_API_URL}/crm/dashboard/agent?window=${dateRange}`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`Agent dashboard error: ${r.status}`);
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
  const tasks = data?.taskStatus || {};
  const targets = data?.targets || {};
  const agentName = data?.agent?.name || "My Performance";

  return (
    <DashboardShell
      title="Agent Dashboard"
      description="Your leads, calls, properties and tasks — your data only."
      dateRange={dateRange}
      setDateRange={setDateRange}
    >
      {error ? (
        <DashboardError message={error} onRetry={load} />
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {/* My Performance — top KPIs */}
          <Panel title={`My Performance — ${agentName}`} subtitle={data?.agent?.email || undefined}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile title="Total Leads" value={fmt(g.totalLeads)} icon={Users} />
              <StatTile title="Today's Leads" value={fmt(g.todayLeads)} icon={Target} />
              <StatTile title="Assigned Leads" value={fmt(g.assignedLeads)} icon={Users} />
              <StatTile title="Property Listed" value={fmt(g.propertyListed)} icon={Home} />
              <StatTile title="Approved" value={fmt(g.approvedProperties)} icon={CheckCircle2} tone="good" />
              <StatTile title="Total Calls" value={fmt(g.totalCalls)} icon={Phone} />
              <StatTile title="Today's Calls" value={fmt(g.todayCalls)} icon={PhoneCall} />
              <StatTile title="Connected" value={fmt(g.connectedCalls)} sub={`${g.connectRate || 0}% connect rate`} tone="good" />
              <StatTile title="Not Answered" value={fmt(g.notAnswered)} sub={`${g.notAnsweredPct || 0}% of calls`} tone="bad" />
            </div>
          </Panel>

          {/* Month-wise progress */}
          <Panel title="Month-wise Progress — My Leads & Calls">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          {/* Lead + Property side by side */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Lead Metrics — Mine">
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

            <Panel title="Property Metrics — Mine" subtitle="Property + Farm combined">
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

          {/* IVR / Calls */}
          <Panel title="IVR / Calls Metrics — Mine">
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

          {/* WhatsApp */}
          <Panel title="WhatsApp Metrics — Mine">
            <StatCellGrid cols={4}>
              <StatCell label="Total Reachout" value={fmt(wa.totalReachout)} />
              <StatCell label="Today's Reachout" value={fmt(wa.todayReachout)} />
              <StatCell label="New Messages" value={fmt(wa.newMessages)} tone="warn" />
              <StatCell label="Avg Response Time" value={`${wa.avgResponseMins || 0} min`} />
            </StatCellGrid>
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">My Recent WhatsApp Log</div>
              <RecentWhatsApp rows={wa.recent || []} />
            </div>
          </Panel>

          {/* Activity log + right rail (task status + targets) */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Activity Log" className="xl:col-span-2">
              {(data?.activityLog || []).length === 0 ? (
                <EmptyRow text="No recent activity" />
              ) : (
                <ol className="space-y-2.5">
                  {(data.activityLog || []).map((a: any, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ActivityIcon className="h-3 w-3" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-card-foreground">{a.text}</p>
                        <p className="text-xs text-muted-foreground">{timeAgo(a.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="Task Status">
                <div className="space-y-2">
                  <TaskRow label="Open" value={tasks.open} color="#3b82f6" />
                  <TaskRow label="In Progress" value={tasks.inProgress} color="#f59e0b" />
                  <TaskRow label="Completed" value={tasks.completed} color="#22c55e" />
                  <TaskRow label="Overdue" value={tasks.overdue} color="#ef4444" />
                </div>
              </Panel>
              <Panel title="My Target Progress" subtitle="Targets set by Admin">
                <TargetProgress
                  rows={[
                    { label: "Calls Today", actual: targets.callsToday?.actual || 0, target: targets.callsToday?.target ?? null },
                    { label: "Leads Today", actual: targets.leadsToday?.actual || 0, target: targets.leadsToday?.target ?? null },
                    { label: "Listings (Month)", actual: targets.listingsMonth?.actual || 0, target: targets.listingsMonth?.target ?? null },
                  ]}
                />
              </Panel>
            </div>
          </div>

          {/* My leads & follow-ups */}
          <Panel title="My Leads & Follow-ups" className="overflow-hidden">
            <MyLeadsTable rows={data?.myLeads || []} />
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}

function TaskRow({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold text-card-foreground">{fmt(value)}</span>
    </div>
  );
}

function RecentWhatsApp({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyRow text="No recent WhatsApp activity" />;
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((m, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <span className="font-medium text-card-foreground">{m.contact}</span>
            <span className="ml-2 truncate text-muted-foreground">{m.preview}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">{timeAgo(m.at)}</span>
            <StatusPill status={m.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "new"
      ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
      : s === "replied"
        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"
        : "bg-blue-50 text-blue-600 dark:bg-blue-500/10";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}

function MyLeadsTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyRow text="No leads assigned" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2">Lead Name</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Last Contact</th>
            <th className="px-3 py-2">Next Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2 font-medium text-card-foreground">{l.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{l.status}</td>
              <td className="px-3 py-2 text-muted-foreground">{timeAgo(l.lastContact)}</td>
              <td className="px-3 py-2 text-muted-foreground">{l.nextFollowUp ? timeAgo(l.nextFollowUp) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>;
}
