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
} from "@/components/crm/dashboards/wireframe";
import { Users, Target, PhoneCall, PhoneOff, Home, CheckCircle2, ClipboardCheck, Trophy } from "lucide-react";

export default function TeamDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("today");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberDetail, setMemberDetail] = useState<any>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${CRM_API_URL}/crm/dashboard/team?window=${dateRange}`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`Team dashboard error: ${r.status}`);
        return r.json();
      })
      .then((res) => active && (setData(res || {}), setLoading(false)))
      .catch((err) => active && (setError(err.message || "Failed to load"), setLoading(false)));
    return () => {
      active = false;
    };
  }, [dateRange]);

  useEffect(() => load(), [load]);

  // Member drill-down — reuses the agent endpoint scoped to the chosen member.
  useEffect(() => {
    if (!selectedMember) {
      setMemberDetail(null);
      return;
    }
    let active = true;
    setMemberDetail(null);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${CRM_API_URL}/crm/dashboard/agent?window=${dateRange}&agent=${selectedMember.id}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => active && setMemberDetail(res))
      .catch(() => active && setMemberDetail(null));
    return () => {
      active = false;
    };
  }, [selectedMember, dateRange]);

  const g = data?.glance || {};
  const leads = data?.leads || {};
  const props = data?.properties || {};
  const calls = data?.calls || {};
  const wa = data?.whatsapp || {};
  const targets = data?.targets || {};

  return (
    <DashboardShell
      title="Team Lead Dashboard"
      description="Your team's performance, members and targets — no other team's data."
      dateRange={dateRange}
      setDateRange={setDateRange}
    >
      {error ? (
        <DashboardError message={error} onRetry={load} />
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          <Panel title="Team Performance — This Period" subtitle={`${data?.teamSize || 0} team members`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatTile title="Team Total Leads" value={fmt(g.teamTotalLeads)} sub={`${fmt(g.teamTodayLeads)} today`} icon={Users} />
              <StatTile title="Team Calls" value={fmt(g.teamCallsToday)} sub={`${fmt(g.teamCallsWindow)} this period`} icon={PhoneCall} />
              <StatTile title="Connected Today" value={fmt(g.connectedToday)} sub={`${g.connectRate || 0}% connect rate`} tone="good" />
              <StatTile title="Not Answered Today" value={fmt(g.notAnsweredToday)} icon={PhoneOff} tone="bad" />
              <StatTile title="Properties Listed" value={fmt(g.propertiesListed)} icon={Home} />
              <StatTile title="Approved Properties" value={fmt(g.approvedProperties)} sub={`${g.approvedPct || 0}% of listed`} tone="good" icon={CheckCircle2} />
              <StatTile title="Task Completion" value={`${g.taskCompletion || 0}%`} icon={ClipboardCheck} />
              <StatTile title="Team Score" value={`${g.teamScore || 0}%`} icon={Trophy} tone="good" />
            </div>
          </Panel>

          <Panel title="Month-wise Progress — Team Leads & Calls">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Lead Metrics — Team">
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

            <Panel title="Property Metrics — Team" subtitle="Property + Farm combined">
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

          <Panel title="IVR / Calls Metrics — Team">
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

          <Panel title="WhatsApp Metrics — Team">
            <StatCellGrid cols={4}>
              <StatCell label="Total Reachout" value={fmt(wa.totalReachout)} />
              <StatCell label="Today's Reachout" value={fmt(wa.todayReachout)} />
              <StatCell label="New Messages" value={fmt(wa.newMessages)} tone="warn" />
              <StatCell label="Avg Response Time" value={`${wa.avgResponseMins || 0} min`} />
            </StatCellGrid>
          </Panel>

          {/* Member performance + right rail */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Team — Member Performance" subtitle="Click a row to view member detail" className="xl:col-span-2 overflow-hidden">
              <MemberTable
                rows={data?.memberPerformance || []}
                selectedId={selectedMember?.id}
                onSelect={(m) => setSelectedMember(selectedMember?.id === m.id ? null : m)}
              />
              {selectedMember && (
                <MemberDetail member={selectedMember} detail={memberDetail} onClose={() => setSelectedMember(null)} />
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="Team Target Progress" subtitle="Read-only — set by Admin">
                <TargetProgress
                  rows={[
                    { label: "Leads", actual: targets.leads?.actual || 0, target: targets.leads?.target ?? null },
                    { label: "Calls", actual: targets.calls?.actual || 0, target: targets.calls?.target ?? null },
                    { label: "Listings", actual: targets.listings?.actual || 0, target: targets.listings?.target ?? null },
                  ]}
                />
              </Panel>
              <Panel title="Today's Team Availability" subtitle="Synced from HRMS attendance">
                <Availability rows={data?.availability || []} />
              </Panel>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function MemberTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: any[];
  selectedId?: string;
  onSelect: (m: any) => void;
}) {
  if (!rows.length) return <div className="py-6 text-center text-sm text-muted-foreground">No team members</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2">Member</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Assigned</th>
            <th className="px-3 py-2 text-right">Calls</th>
            <th className="px-3 py-2 text-right">Conn.</th>
            <th className="px-3 py-2 text-right">Props</th>
            <th className="px-3 py-2">Tasks</th>
            <th className="px-3 py-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              onClick={() => onSelect(m)}
              className={`cursor-pointer border-b border-border/40 last:border-0 transition-colors hover:bg-muted/40 ${
                selectedId === m.id ? "bg-primary/5" : ""
              }`}
            >
              <td className="px-3 py-2 font-medium text-card-foreground">{m.name}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(m.leads)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(m.assigned)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(m.calls)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{m.connected}%</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(m.properties)}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.taskStatus}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{m.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberDetail({ member, detail, onClose }: { member: any; detail: any; onClose: () => void }) {
  const g = detail?.glance;
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-card-foreground">Member Detail — {member.name}</h4>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-card-foreground">
          Close
        </button>
      </div>
      {!detail ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <StatCellGrid cols={5}>
          <StatCell label="Total Leads" value={fmt(g?.totalLeads)} />
          <StatCell label="Today's Leads" value={fmt(g?.todayLeads)} />
          <StatCell label="Calls Today" value={fmt(g?.todayCalls)} />
          <StatCell label="Connected" value={fmt(g?.connectedCalls)} tone="good" />
          <StatCell label="Properties" value={fmt(g?.propertyListed)} />
        </StatCellGrid>
      )}
    </div>
  );
}

function Availability({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="py-4 text-center text-sm text-muted-foreground">No members</div>;
  const pill = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("present")) return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10";
    if (s.includes("half")) return "bg-amber-50 text-amber-600 dark:bg-amber-500/10";
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
