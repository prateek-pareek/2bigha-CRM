"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { canPickAnyDashboardEmployee } from "@/lib/crm/shared/dashboard-access";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import {
  DashboardPersonSelect,
  type DashboardPersonOption,
} from "@/components/crm/dashboards/DashboardPersonSelect";
import {
  Panel,
  StatTile,
  StatCell,
  StatCellGrid,
  MonthlyProgressChart,
  DashboardSkeleton,
  DashboardError,
  fmt,
} from "@/components/crm/dashboards/wireframe";
import {
  useRoleDashboard,
  useDashboardList,
  periodLabel,
  LiveStatusBar,
  LeadMetricsPanel,
  PropertyMetricsPanel,
  CallMetricsPanel,
  WhatsAppPanel,
  SubscriptionsPanel,
  TargetsPanel,
  AvailabilityList,
  SCORE_HELP,
} from "@/components/crm/dashboards/role-sections";
import { Users, PhoneCall, PhoneOff, Home, CheckCircle2, ClipboardCheck, Trophy, MessageSquare } from "lucide-react";

export default function TeamDashboardInner() {
  const { hasAccess, isLoaded } = usePermissions();
  const canPickTeamLead = isLoaded && canPickAnyDashboardEmployee(hasAccess);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_month");
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [selectedTeamLeadId, setSelectedTeamLeadId] = useState(() => searchParams.get("teamLead") || "");

  const setTeamLead = useCallback(
    (id: string) => {
      setSelectedTeamLeadId(id);
      setSelectedMember(null);
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("teamLead", id);
      else params.delete("teamLead");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const fromUrl = searchParams.get("teamLead") || "";
    setSelectedTeamLeadId((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const teams = useDashboardList<{ id: string; name: string; members: number }>(
    canPickTeamLead ? "/crm/dashboard/teams" : null,
  );
  const teamLeadOptions: DashboardPersonOption[] = teams.map((t) => ({
    id: t.id,
    label: t.name,
    sublabel: `${t.members} members`,
  }));

  useEffect(() => {
    if (canPickTeamLead && !selectedTeamLeadId && teams.length === 1) setTeamLead(teams[0].id);
  }, [canPickTeamLead, selectedTeamLeadId, teams, setTeamLead]);

  const waitingForAdminPick = canPickTeamLead && !selectedTeamLeadId;

  // Agent filter: this team's members only (the API also ignores ids outside the team).
  const [agentPick, setAgentPick] = useState("");
  const peoplePath =
    !isLoaded || waitingForAdminPick
      ? null
      : `/crm/dashboard/people${canPickTeamLead && selectedTeamLeadId ? `?teamLead=${encodeURIComponent(selectedTeamLeadId)}` : ""}`;
  const people = useDashboardList<{ id: string; name: string; team?: string }>(peoplePath);
  const agentOptions: DashboardPersonOption[] = people.map((p) => ({ id: p.id, label: p.name }));
  const agentFilter = agentPick && people.some((p) => p.id === agentPick) ? agentPick : "";
  const path = useMemo(() => {
    if (!isLoaded || waitingForAdminPick) return null;
    const qs = new URLSearchParams({ window: String(dateRange) });
    if (canPickTeamLead && selectedTeamLeadId) qs.set("teamLead", selectedTeamLeadId);
    if (agentFilter) qs.set("agents", agentFilter);
    return `/crm/dashboard/team?${qs.toString()}`;
  }, [isLoaded, waitingForAdminPick, dateRange, canPickTeamLead, selectedTeamLeadId, agentFilter]);
  const { data, loading, refreshing, error, reload, refresh } = useRoleDashboard(path);

  const memberPath = selectedMember
    ? `/crm/dashboard/agent?window=${encodeURIComponent(String(dateRange))}&agent=${encodeURIComponent(selectedMember.id)}`
    : null;
  const { data: memberDetail } = useRoleDashboard(memberPath);

  // The team lead's OWN numbers (they are also counted in the team totals below).
  const leadId: string = data?.teamLeadId || "";
  const selfPath = leadId
    ? `/crm/dashboard/agent?window=${encodeURIComponent(String(dateRange))}&agent=${encodeURIComponent(leadId)}`
    : null;
  const { data: selfData } = useRoleDashboard(selfPath);
  const me = selfData?.glance;

  const g = data?.glance || {};
  const period = periodLabel(String(dateRange));

  return (
    <DashboardShell
      title="Team Lead Dashboard"
      description={
        canPickTeamLead
          ? "Pick a team lead to view that team's performance, members and targets."
          : "Your team's performance, members and targets — no other team's data."
      }
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={
        <div className="flex flex-wrap items-center gap-2">
          {canPickTeamLead && (
            <DashboardPersonSelect
              label="Team Lead"
              value={selectedTeamLeadId}
              options={teamLeadOptions}
              onChange={(id) => {
                setAgentPick("");
                setTeamLead(id);
              }}
              placeholder={teamLeadOptions.length ? "Select team lead…" : "No teams yet"}
            />
          )}
          {agentOptions.length > 0 && (
            <DashboardPersonSelect
              label="Agent"
              value={agentFilter}
              options={agentOptions}
              onChange={(id) => {
                setAgentPick(id);
                setSelectedMember(null);
              }}
              placeholder="All agents"
            />
          )}
        </div>
      }
    >
      {waitingForAdminPick ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-card-foreground">Select a team lead</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {teams.length
              ? "Choose a team lead above to load their team dashboard."
              : "No teams exist yet — set “Reports To” for members in Settings → Users & access."}
          </p>
        </div>
      ) : error && !data ? (
        <DashboardError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-card-foreground">{data?.teamLead || "My team"}</span> ·{" "}
              {fmt(data?.teamSize)} members (incl. team lead) · {period}
            </div>
            <LiveStatusBar data={data} refreshing={refreshing} onRefresh={refresh} />
          </div>

          <Panel
            title={`${canPickTeamLead ? `${data?.teamLead || "Team lead"} — Own` : "My"} Performance — ${period}`}
            subtitle="Only the team lead's own work (also included in the team totals below)"
          >
            {!me ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                <StatCellGrid cols={5}>
                  <StatCell label="New Leads" value={fmt(me.newLeads)} sub={`${fmt(me.todayLeads)} today · ${fmt(me.totalLeads)} total`} />
                  <StatCell label="Calls" value={fmt(me.callsPeriod)} sub={`${fmt(me.callsToday)} today`} />
                  <StatCell label="Connected" value={fmt(me.connectedCalls)} sub={`${me.connectRate || 0}% connect rate`} tone="good" />
                  <StatCell label="Listings" value={fmt(me.listingsPeriod)} sub={`${fmt(me.approvedTotal)} approved (all time)`} />
                  <StatCell label="WhatsApp Reachout" value={fmt(me.whatsappReachout)} sub={`${fmt(me.subscriptionsPeriod)} subscriptions · tasks ${me.taskCompletion || 0}%`} />
                </StatCellGrid>
                <div className="mt-3 text-right">
                  <Link
                    href={`/crm/workspace/agent?agent=${encodeURIComponent(leadId)}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Open {canPickTeamLead ? "their" : "my"} full dashboard
                  </Link>
                </div>
              </>
            )}
          </Panel>

          <Panel title={`Team Performance — ${period}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatTile title="New Leads" value={fmt(g.newLeads)} delta={g.newLeadsDeltaPct} sub={`${fmt(g.todayLeads)} today · ${fmt(g.totalLeads)} total`} icon={Users} />
              <StatTile title="Team Calls" value={fmt(g.callsPeriod)} sub={`${fmt(g.callsToday)} today`} icon={PhoneCall} />
              <StatTile title="Connected Today" value={fmt(g.connectedToday)} sub={`${g.todayConnectRate || 0}% connect rate`} tone="good" />
              <StatTile title="Not Connected Today" value={fmt(g.notConnectedToday)} icon={PhoneOff} tone="bad" />
              <StatTile title="Listings" value={fmt(g.listingsPeriod)} sub={`${fmt(g.listingsTotal)} all time`} icon={Home} />
              <StatTile title="Approved Listings" value={fmt(g.approvedTotal)} sub={`${g.approvedPct || 0}% of listed · ${fmt(g.approvedPeriod)} this period`} tone="good" icon={CheckCircle2} />
              <StatTile title="WhatsApp Reachout" value={fmt(g.whatsappReachout)} sub={`${fmt(g.subscriptionsPeriod)} subscriptions this period`} icon={MessageSquare} />
              <StatTile
                title="Task Completion"
                value={`${g.taskCompletion || 0}%`}
                sub={g.teamScore === null || g.teamScore === undefined ? "no targets set" : `team target ${g.teamScore}%`}
                icon={g.teamScore === null || g.teamScore === undefined ? ClipboardCheck : Trophy}
              />
            </div>
          </Panel>

          <Panel title="Month-wise Progress — Team Leads, Calls & Listings" subtitle="Last 6 months">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <LeadMetricsPanel leads={data?.leads} title="Lead Metrics — Team" window={String(dateRange)} />
            <PropertyMetricsPanel properties={data?.properties} title="Property Metrics — Team" window={String(dateRange)} />
          </div>

          <CallMetricsPanel calls={data?.calls} followUps={data?.leads?.followUps} title="IVR / Calls Metrics — Team" window={String(dateRange)} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <WhatsAppPanel whatsapp={data?.whatsapp} title="WhatsApp Metrics — Team" window={String(dateRange)} />
            <SubscriptionsPanel subscriptions={data?.subscriptions} title="Subscriptions — Team" window={String(dateRange)} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel
              title="Team — Member Performance"
              subtitle={`${period} · click a row for member detail · ${SCORE_HELP}`}
              className="overflow-hidden xl:col-span-2"
            >
              <MemberTable
                rows={data?.memberPerformance || []}
                leadId={leadId}
                selectedId={selectedMember?.id}
                onSelect={(m) => setSelectedMember(selectedMember?.id === m.id ? null : m)}
              />
              {selectedMember && (
                <MemberDetail member={selectedMember} detail={memberDetail} onClose={() => setSelectedMember(null)} />
              )}
            </Panel>

            <div className="space-y-6">
              <TargetsPanel targets={data?.targets} title="Team Target Progress" subtitle="Read-only — set by Admin" />
              <Panel title="Today's Team Availability" subtitle="Synced from HRMS attendance">
                <AvailabilityList rows={data?.availability || []} />
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
  leadId,
  selectedId,
  onSelect,
}: {
  rows: any[];
  leadId?: string;
  selectedId?: string;
  onSelect: (m: any) => void;
}) {
  if (!rows.length) return <div className="py-6 text-center text-sm text-muted-foreground">No team members</div>;
  const td = "px-3 py-2 text-right text-muted-foreground";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2">Member</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Assigned</th>
            <th className="px-3 py-2 text-right">Calls</th>
            <th className="px-3 py-2 text-right">Conn. %</th>
            <th className="px-3 py-2 text-right">WhatsApp</th>
            <th className="px-3 py-2 text-right">Listings</th>
            <th className="px-3 py-2 text-right">Subs</th>
            <th className="px-3 py-2">Tasks</th>
            <th className="px-3 py-2 text-right">Target</th>
            <th className="px-3 py-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              onClick={() => onSelect(m)}
              className={`cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40 ${
                selectedId === m.id ? "bg-primary/5" : ""
              }`}
            >
              <td className="px-3 py-2 font-medium text-card-foreground">
                {m.name}
                {leadId && m.id === leadId ? (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Team lead</span>
                ) : null}
              </td>
              <td className={td}>{fmt(m.leads)}</td>
              <td className={td}>{fmt(m.assigned)}</td>
              <td className={td}>{fmt(m.calls)}</td>
              <td className={td}>{m.connectRate}%</td>
              <td className={td}>{fmt(m.whatsapp)}</td>
              <td className={td}>{fmt(m.properties)}</td>
              <td className={td}>{fmt(m.subscriptions)}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {m.tasksOverdue > 0
                  ? `${fmt(m.tasksOverdue)} overdue`
                  : m.tasksOpen > 0
                    ? `${fmt(m.tasksOpen)} open`
                    : "All done"}
              </td>
              <td className={td}>{m.targetPct === null || m.targetPct === undefined ? "—" : `${m.targetPct}%`}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(m.score)}</td>
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
        <div className="flex items-center gap-3">
          <Link
            href={`/crm/workspace/agent?agent=${encodeURIComponent(member.id)}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Open full dashboard
          </Link>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-card-foreground">
            Close
          </button>
        </div>
      </div>
      {!detail ? (
        <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <StatCellGrid cols={5}>
          <StatCell label="Total Leads" value={fmt(g?.totalLeads)} sub={`${fmt(g?.newLeads)} new`} />
          <StatCell label="Today's Leads" value={fmt(g?.todayLeads)} />
          <StatCell label="Calls Today" value={fmt(g?.callsToday)} sub={`${fmt(g?.callsPeriod)} this period`} />
          <StatCell label="Connected" value={fmt(g?.connectedCalls)} sub={`${g?.connectRate || 0}%`} tone="good" />
          <StatCell label="Listings" value={fmt(g?.listingsTotal)} sub={`${fmt(g?.approvedTotal)} approved`} />
        </StatCellGrid>
      )}
    </div>
  );
}
