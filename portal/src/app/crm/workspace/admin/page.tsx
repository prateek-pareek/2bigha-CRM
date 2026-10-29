"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DashboardShell, DateRangeFilter } from "@/components/crm/dashboards/DashboardShell";
import {
  DashboardPersonSelect,
  type DashboardPersonOption,
} from "@/components/crm/dashboards/DashboardPersonSelect";
import {
  Panel,
  StatTile,
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
  SCORE_HELP,
} from "@/components/crm/dashboards/role-sections";
import {
  Users,
  Phone,
  MessageSquare,
  Gauge,
  Home,
  CreditCard,
  ShieldCheck,
  Target as TargetIcon,
  UserCog,
  FileDown,
  ChevronRight,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_month");
  const [team, setTeam] = useState("");
  const teams = useDashboardList<{ id: string; name: string; members: number }>("/crm/dashboard/teams");
  const teamOptions: DashboardPersonOption[] = teams.map((t) => ({
    id: t.id,
    label: t.name,
    sublabel: `${t.members} members`,
  }));

  // Agent picker follows the team: all CRM users, or just the picked team's members.
  const [agent, setAgent] = useState("");
  const people = useDashboardList<{ id: string; name: string; team?: string }>(
    `/crm/dashboard/people${team ? `?teamLead=${encodeURIComponent(team)}` : ""}`,
  );
  const agentOptions: DashboardPersonOption[] = people.map((p) => ({ id: p.id, label: p.name, sublabel: p.team }));
  const agentValid = agent && people.some((p) => p.id === agent) ? agent : "";

  const qs = new URLSearchParams({ window: String(dateRange) });
  if (team) qs.set("team", team);
  if (agentValid) qs.set("agents", agentValid);
  const { data, loading, refreshing, error, reload, refresh } = useRoleDashboard(
    `/crm/dashboard/admin?${qs.toString()}`,
  );

  const g = data?.glance || {};
  const period = periodLabel(String(dateRange));
  const teamLabel = team ? teams.find((t) => t.id === team)?.name || "Selected team" : "";
  const agentLabel = agentValid ? people.find((p) => p.id === agentValid)?.name || "Selected agent" : "";
  const scopeLabel = agentLabel
    ? `${agentLabel}${teamLabel ? ` (${teamLabel}'s team)` : ""}`
    : teamLabel
      ? `${teamLabel}'s team`
      : "Whole organization";
  const filtered = !!(team || agentValid);

  return (
    <DashboardShell
      title="Admin Dashboard"
      description="Organization-wide CRM, IVR, WhatsApp and 2bigha metrics. Open Team Lead or Agent dashboards to inspect any employee."
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={
        <div className="flex flex-wrap items-center gap-2">
          {teams.length > 0 && (
            <DashboardPersonSelect
              label="Team Lead"
              value={team}
              options={teamOptions}
              onChange={(id) => {
                setTeam(id);
                setAgent("");
              }}
              placeholder="All team leads"
            />
          )}
          {people.length > 0 && (
            <DashboardPersonSelect label="Agent" value={agentValid} options={agentOptions} onChange={setAgent} placeholder="All agents" />
          )}
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
      {error && !data ? (
        <DashboardError message={error} onRetry={reload} />
      ) : loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-card-foreground">{scopeLabel}</span> · {period} ·{" "}
              {fmt(g.activeMembers)} CRM members · {fmt(g.teamCount)} teams
            </div>
            <LiveStatusBar data={data} refreshing={refreshing} onRefresh={refresh} />
          </div>

          {/* At a glance */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile title={`New Leads · ${period}`} value={fmt(g.newLeads)} delta={g.newLeadsDeltaPct} sub={`vs previous · ${fmt(g.totalLeads)} total`} icon={Users} />
            <StatTile title={`Calls · ${period}`} value={fmt(g.callsPeriod)} delta={g.callsDeltaPct} sub={`${fmt(g.callsToday)} today`} icon={Phone} />
            <StatTile title={`WhatsApp · ${period}`} value={fmt(g.whatsappReachout)} sub={`${fmt(g.whatsappReachoutToday)} today`} icon={MessageSquare} />
            <StatTile title={`Listings · ${period}`} value={fmt(g.listingsPeriod)} sub={`${fmt(g.listingsTotal)} total on 2bigha`} icon={Home} />
            <StatTile title={`Subscriptions · ${period}`} value={fmt(g.subscriptionsPeriod)} sub={`${fmt(g.subscriptionsTotal)} total`} icon={CreditCard} />
            <StatTile
              title="Org Target Score"
              value={g.orgScore === null || g.orgScore === undefined ? "—" : `${g.orgScore}%`}
              sub={g.orgScore === null || g.orgScore === undefined ? "no targets set" : `avg of ${fmt(g.teamCount)} teams`}
              icon={Gauge}
              tone="good"
            />
          </div>

          <Panel title="Month-wise Progress — Leads, Calls & Listings" subtitle="Last 6 months">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <LeadMetricsPanel leads={data?.leads} title="Lead Metrics" window={String(dateRange)} showUnassigned={!filtered} />
            <PropertyMetricsPanel properties={data?.properties} title="Property Metrics" window={String(dateRange)} />
          </div>

          <CallMetricsPanel calls={data?.calls} followUps={data?.leads?.followUps} title="IVR / Calls Metrics" window={String(dateRange)} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <WhatsAppPanel whatsapp={data?.whatsapp} title="WhatsApp Metrics" window={String(dateRange)} />
            <SubscriptionsPanel subscriptions={data?.subscriptions} title="Subscriptions" window={String(dateRange)} showPlans={!filtered} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Team-wise Performance" subtitle={`${period} · Score = ranking points`} className="overflow-hidden xl:col-span-2">
              <TeamTable rows={data?.teamPerformance || []} />
            </Panel>
            <div className="space-y-6">
              <TargetsPanel targets={data?.targets} title="Org Target Achievement" includeSubscriptions />
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

          <Panel title="Org-wide Leaderboard — Top Agents" subtitle={`${period} · ${SCORE_HELP}`} className="overflow-hidden">
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

const th = "px-3 py-2";
const td = "px-3 py-2 text-right text-muted-foreground";

function TeamTable({ rows }: { rows: any[] }) {
  if (!rows.length)
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No teams yet — set &quot;Reports To&quot; for members in Settings → Users &amp; access.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className={th}>Team Lead</th>
            <th className={`${th} text-right`}>Members</th>
            <th className={`${th} text-right`}>Leads</th>
            <th className={`${th} text-right`}>Calls</th>
            <th className={`${th} text-right`}>Conn. %</th>
            <th className={`${th} text-right`}>WhatsApp</th>
            <th className={`${th} text-right`}>Listings</th>
            <th className={`${th} text-right`}>Subs</th>
            <th className={`${th} text-right`}>Task %</th>
            <th className={`${th} text-right`}>Target</th>
            <th className={`${th} text-right`}>Score</th>
            <th className={`${th} text-right`}>View</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.teamId} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2 font-medium text-card-foreground">{t.teamLead}</td>
              <td className={td}>{fmt(t.members)}</td>
              <td className={td}>{fmt(t.leads)}</td>
              <td className={td}>{fmt(t.calls)}</td>
              <td className={td}>{t.connected}%</td>
              <td className={td}>{fmt(t.whatsapp)}</td>
              <td className={td}>{fmt(t.properties)}</td>
              <td className={td}>{fmt(t.subscriptions)}</td>
              <td className={td}>{t.taskCompletion}%</td>
              <td className={td}>{t.targetPct === null || t.targetPct === undefined ? "—" : `${t.targetPct}%`}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(t.score)}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/crm/workspace/team?teamLead=${encodeURIComponent(String(t.teamId))}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open
                </Link>
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
            <th className={`${th} text-center`}>Rank</th>
            <th className={th}>Agent</th>
            <th className={th}>Team</th>
            <th className={`${th} text-right`}>Leads</th>
            <th className={`${th} text-right`}>Calls</th>
            <th className={`${th} text-right`}>Connected</th>
            <th className={`${th} text-right`}>WhatsApp</th>
            <th className={`${th} text-right`}>Listings</th>
            <th className={`${th} text-right`}>Subs</th>
            <th className={`${th} text-right`}>Target</th>
            <th className={`${th} text-right`}>Score</th>
            <th className={`${th} text-right`}>View</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((a, i) => (
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
              <td className={td}>{fmt(a.leads)}</td>
              <td className={td}>{fmt(a.calls)}</td>
              <td className={td}>{fmt(a.connected)}</td>
              <td className={td}>{fmt(a.whatsapp)}</td>
              <td className={td}>{fmt(a.properties)}</td>
              <td className={td}>{fmt(a.subscriptions)}</td>
              <td className={td}>{a.targetPct === null || a.targetPct === undefined ? "—" : `${a.targetPct}%`}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(a.score)}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/crm/workspace/agent?agent=${encodeURIComponent(String(a.id))}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
