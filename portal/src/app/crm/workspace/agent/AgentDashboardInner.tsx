"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import {
  canPickAgentOnAgentDashboard,
  canPickAnyDashboardEmployee,
} from "@/lib/crm/shared/dashboard-access";
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
  timeAgo,
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
  TasksPanel,
} from "@/components/crm/dashboards/role-sections";
import {
  Users,
  Target,
  Home,
  CheckCircle2,
  Phone,
  PhoneCall,
  PhoneOff,
  MessageSquare,
  CreditCard,
  ClipboardCheck,
  Activity as ActivityIcon,
} from "lucide-react";

export default function AgentDashboardInner() {
  const { hasAccess, isLoaded } = usePermissions();
  const isAdmin = isLoaded && canPickAnyDashboardEmployee(hasAccess);
  const canPickAgent = isLoaded && (isAdmin || canPickAgentOnAgentDashboard(hasAccess));

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_month");
  const [selectedAgentId, setSelectedAgentId] = useState(() => searchParams.get("agent") || "");

  const setAgent = useCallback(
    (id: string) => {
      setSelectedAgentId(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("agent", id);
      else params.delete("agent");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const fromUrl = searchParams.get("agent") || "";
    setSelectedAgentId((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const people = useDashboardList<{ id: string; name: string; email?: string; team?: string }>(
    canPickAgent ? "/crm/dashboard/people" : null,
  );
  const agentOptions: DashboardPersonOption[] = people.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.team || p.email,
  }));

  const path = useMemo(() => {
    if (!isLoaded) return null;
    const qs = new URLSearchParams({ window: String(dateRange) });
    if (canPickAgent && selectedAgentId) qs.set("agent", selectedAgentId);
    return `/crm/dashboard/agent?${qs.toString()}`;
  }, [isLoaded, dateRange, canPickAgent, selectedAgentId]);
  const { data, loading, refreshing, error, reload, refresh } = useRoleDashboard(path);

  const g = data?.glance || {};
  const agent = data?.agent;
  const period = periodLabel(String(dateRange));
  const viewingSelf = !selectedAgentId;

  return (
    <DashboardShell
      title="Agent Dashboard"
      description={
        canPickAgent
          ? "Your own numbers by default — pick an agent to view their individual dashboard."
          : "Your leads, calls, WhatsApp, listings and tasks — your data only."
      }
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={
        canPickAgent ? (
          <DashboardPersonSelect
            label="Agent"
            value={selectedAgentId}
            options={agentOptions}
            onChange={setAgent}
            placeholder="Me"
          />
        ) : undefined
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
              <span className="font-semibold text-card-foreground">
                {agent?.name || "My Performance"}
                {viewingSelf && agent ? " (you)" : ""}
              </span>
              {agent?.team ? ` · Team: ${agent.team}` : ""} · {period}
              {agent && !agent.ivrNumber && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  · No IVR number set — incoming calls can&apos;t be attributed
                </span>
              )}
              {agent && !agent.linkedTo2bigha && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">· Not linked to a 2bigha admin</span>
              )}
            </div>
            <LiveStatusBar data={data} refreshing={refreshing} onRefresh={refresh} />
          </div>

          <Panel title={`My Performance — ${period}`} subtitle={agent?.email || undefined}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <StatTile title="Total Leads" value={fmt(g.totalLeads)} sub={`${fmt(g.newLeads)} new this period`} icon={Users} />
              <StatTile title="Today's Leads" value={fmt(g.todayLeads)} icon={Target} />
              <StatTile title="Assigned to Me" value={fmt(g.assignedLeads)} sub="by others" icon={Users} />
              <StatTile title="Listings" value={fmt(g.listingsPeriod)} sub={`${fmt(g.listingsTotal)} all time`} icon={Home} />
              <StatTile title="Approved Listings" value={fmt(g.approvedTotal)} icon={CheckCircle2} tone="good" />
              <StatTile title="Subscriptions" value={fmt(g.subscriptionsPeriod)} sub="sold this period" icon={CreditCard} />
              <StatTile title="Calls" value={fmt(g.callsPeriod)} icon={Phone} />
              <StatTile title="Today's Calls" value={fmt(g.callsToday)} icon={PhoneCall} />
              <StatTile title="Connected" value={fmt(g.connectedCalls)} sub={`${g.connectRate || 0}% connect rate`} tone="good" />
              <StatTile title="Not Connected" value={fmt(g.notConnected)} sub={`${g.notConnectedPct || 0}% of calls`} icon={PhoneOff} tone="bad" />
              <StatTile title="WhatsApp Reachout" value={fmt(g.whatsappReachout)} icon={MessageSquare} />
              <StatTile title="Task Completion" value={`${g.taskCompletion || 0}%`} icon={ClipboardCheck} />
            </div>
          </Panel>

          <Panel title="Month-wise Progress — My Leads, Calls & Listings" subtitle="Last 6 months">
            <MonthlyProgressChart data={data?.monthly || []} />
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <LeadMetricsPanel leads={data?.leads} title="Lead Metrics — Mine" window={String(dateRange)} />
            <PropertyMetricsPanel properties={data?.properties} title="Property Metrics — Mine" window={String(dateRange)} />
          </div>

          <CallMetricsPanel calls={data?.calls} followUps={data?.leads?.followUps} title="IVR / Calls Metrics — Mine" window={String(dateRange)} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <WhatsAppPanel whatsapp={data?.whatsapp} title="WhatsApp Metrics — Mine" window={String(dateRange)} />
            <SubscriptionsPanel subscriptions={data?.subscriptions} title="Subscriptions — Mine" window={String(dateRange)} />
          </div>

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
                        <p className="truncate text-card-foreground">
                          <span className="mr-1.5 text-xs font-semibold uppercase text-muted-foreground">{a.type}</span>
                          {a.relatedType === "Lead" && a.relatedTo ? (
                            <Link href={`/crm/leads/${a.relatedTo}`} className="hover:underline">
                              {a.text}
                            </Link>
                          ) : (
                            a.text
                          )}
                        </p>
                        {a.detail && <p className="truncate text-xs text-muted-foreground">{a.detail}</p>}
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(a.at)}
                          {a.status ? ` · ${a.status}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <div className="space-y-6">
              <TasksPanel tasks={data?.tasks} />
              <TargetsPanel targets={data?.targets} title="My Target Progress" subtitle="Targets set by Admin" />
              {data?.availability && (
                <Panel title="Today's Attendance" subtitle="Synced from HRMS">
                  <div className="text-sm font-medium text-card-foreground">{data.availability.status}</div>
                </Panel>
              )}
            </div>
          </div>

          <Panel title="My Leads & Follow-ups" subtitle="Overdue and upcoming follow-ups first" className="overflow-hidden">
            <MyLeadsTable rows={data?.myLeads || []} />
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
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
            <th className="px-3 py-2">Last Call</th>
            <th className="px-3 py-2">Next Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2 font-medium text-card-foreground">
                <Link href={`/crm/leads/${l.id}`} className="hover:underline">
                  {l.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {l.status}
                {l.callStatus && l.callStatus !== "Not Called" ? ` · ${l.callStatus}` : ""}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{l.lastContact ? timeAgo(l.lastContact) : "Never"}</td>
              <td className={`px-3 py-2 ${l.overdue ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                {l.nextFollowUp ? formatFollowUp(l.nextFollowUp, l.overdue) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFollowUp(input: string, overdue: boolean): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const label = d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return overdue ? `Overdue · ${label}` : label;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{text}</div>;
}
