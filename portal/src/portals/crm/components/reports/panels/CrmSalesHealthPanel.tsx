"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Phone,
  Mail,
  Target,
  TrendingUp,
  Users,
  Briefcase,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmDropdown, CrmKpiCard, CrmSectionCard, CrmSegmentedControl } from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_INFO,
  CRM_CHART_LEGEND,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

type WorkSnapshot = {
  leadsCreated: number;
  leadsConverted: number;
  dealsCreated: number;
  dealsWon: number;
  activities: number;
  calls: number;
  emailsLogged: number;
  tasksLogged: number;
  meetings: number;
  trackedSends: number;
  emailOpened: number;
  emailClicked: number;
  replies: number;
};

type HealthIndicator = {
  key: string;
  label: string;
  value: string | number;
  status: "good" | "watch" | "risk";
  hint: string;
};

export type SalesHealthPayload = {
  window: string;
  windowLabel: string;
  health: {
    score: number;
    status: "healthy" | "watch" | "at_risk";
    indicators: HealthIndicator[];
  };
  workDone: WorkSnapshot;
  comparison: {
    today: WorkSnapshot;
    this_week: WorkSnapshot;
    this_month: WorkSnapshot;
  };
  activityByDay: Array<{ date: string; activities: number; calls: number; emails: number }>;
  activityByType: Array<{ type: string; count: number }>;
  repLeaderboard: Array<{
    name: string;
    activities: number;
    leadsCreated: number;
    dealsCreated: number;
  }>;
  pipeline: {
    openLeads: number;
    openDeals: number;
    grossValueINR: number;
    weightedValueINR: number;
    staleLeads: number;
    touchCoveragePercent: number;
    overdueTasks: number;
    atRiskDeals: number;
    emailOpenRatePercent: number;
    emailReplyRatePercent: number;
  };
};

const WINDOW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
];

const STATUS_COLORS = {
  healthy: { border: "border-[var(--success)]/30", bg: "bg-[var(--success-light)]", text: "text-[var(--success)]", bar: "#28c76f" },
  watch: { border: "border-[var(--warning)]/30", bg: "bg-[var(--warning-light)]", text: "text-[var(--warning)]", bar: "#ff9f43" },
  at_risk: { border: "border-[var(--error)]/30", bg: "bg-[var(--error-light)]", text: "text-[var(--error)]", bar: "#e41f07" },
};

const INDICATOR_STATUS: Record<string, string> = {
  good: "bg-[var(--success-light)] text-[var(--success)]",
  watch: "bg-[var(--warning-light)] text-[var(--warning)]",
  risk: "bg-[var(--primary-light)] text-[var(--primary)]",
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtShortDate(date: string) {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CrmSalesHealthPanel({
  owner = "All",
  window: initialWindow = "this_week",
}: {
  owner?: string;
  window?: string;
}) {
  const { canViewCrmRevenue } = usePermissions();
  const [window, setWindow] = useState(initialWindow);
  const [data, setData] = useState<SalesHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getCrmAuthToken();
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/reports/sales-health?window=${encodeURIComponent(window)}&owner=${encodeURIComponent(owner)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Failed to load sales health (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [window, owner]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusTheme = data ? STATUS_COLORS[data.health.status] : STATUS_COLORS.watch;

  const comparisonChart = useMemo(() => {
    if (!data) return [];
    return [
      { period: "Today", activities: data.comparison.today.activities, leads: data.comparison.today.leadsCreated, deals: data.comparison.today.dealsCreated },
      { period: "This week", activities: data.comparison.this_week.activities, leads: data.comparison.this_week.leadsCreated, deals: data.comparison.this_week.dealsCreated },
      { period: "This month", activities: data.comparison.this_month.activities, leads: data.comparison.this_month.leadsCreated, deals: data.comparison.this_month.dealsCreated },
    ];
  }, [data]);

  const workBreakdown = useMemo(() => {
    if (!data) return [];
    const w = data.workDone;
    return [
      { name: "Calls", value: w.calls, color: CRM_CHART_INFO },
      { name: "Emails", value: w.emailsLogged, color: CRM_CHART_SECONDARY },
      { name: "Tasks", value: w.tasksLogged, color: CRM_CHART_WARNING },
      { name: "Meetings", value: w.meetings, color: CRM_CHART_SUCCESS },
    ].filter((x) => x.value > 0);
  }, [data]);

  const emailFunnel = useMemo(() => {
    if (!data) return [];
    const w = data.workDone;
    return [
      { name: "Sends", value: w.trackedSends },
      { name: "Opened", value: w.emailOpened },
      { name: "Clicked", value: w.emailClicked },
      { name: "Replies", value: w.replies },
    ].filter((r) => r.value > 0);
  }, [data]);

  const outreachComparison = useMemo(() => {
    if (!data) return [];
    return [
      {
        period: "Today",
        calls: data.comparison.today.calls,
        emails: data.comparison.today.emailsLogged,
        replies: data.comparison.today.replies,
        sends: data.comparison.today.trackedSends,
      },
      {
        period: "This week",
        calls: data.comparison.this_week.calls,
        emails: data.comparison.this_week.emailsLogged,
        replies: data.comparison.this_week.replies,
        sends: data.comparison.this_week.trackedSends,
      },
      {
        period: "This month",
        calls: data.comparison.this_month.calls,
        emails: data.comparison.this_month.emailsLogged,
        replies: data.comparison.this_month.replies,
        sends: data.comparison.this_month.trackedSends,
      },
    ];
  }, [data]);

  const leaderboardChart = useMemo(
    () =>
      (data?.repLeaderboard ?? []).slice(0, 8).map((r) => ({
        name: r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
        fullName: r.name,
        activities: r.activities,
        leads: r.leadsCreated,
        deals: r.dealsCreated,
      })),
    [data?.repLeaderboard],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading sales health…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 p-6 text-rose-700 text-sm">
        {error || "No data available"}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 font-sans pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e2e8f0] pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">Sales Health & Performance</h2>
          <p className="text-xs font-medium text-slate-500 leading-relaxed">
            Work output, activity trends, and pipeline health signals for {data.windowLabel.toLowerCase()}
            {owner !== "All" ? ` · ${owner}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CrmDropdown value={window} onChange={setWindow} options={WINDOW_OPTIONS} />
        </div>
      </div>

      {/* Health score + KPI row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div
          className={cn(
            CRM_PANEL,
            "lg:col-span-4 p-6 flex flex-col justify-between",
            statusTheme.border,
            statusTheme.bg,
          )}
        >
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Health Score</p>
                <p className={cn("text-5xl font-extrabold mt-2 tabular-nums", statusTheme.text)}>{data.health.score}</p>
                <p className={cn("text-xs font-bold mt-1 uppercase tracking-wider capitalize", statusTheme.text)}>
                  {data.health.status.replace("_", " ")}
                </p>
              </div>
              {data.health.status === "healthy" ? (
                <CheckCircle2 className={cn("h-10 w-10 shrink-0", statusTheme.text)} />
              ) : (
                <AlertTriangle className={cn("h-10 w-10 shrink-0", statusTheme.text)} />
              )}
            </div>
          </div>
          <div className="mt-6">
            <div className="h-2.5 rounded-full bg-white/80 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${data.health.score}%`, backgroundColor: statusTheme.bar }}
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <CrmKpiCard icon={<Activity className="h-4 w-4 text-[#2563eb]" />} label="Activities" value={data.workDone.activities} />
          <CrmKpiCard icon={<Users className="h-4 w-4 text-[#06b6d4]" />} label="Leads created" value={data.workDone.leadsCreated} />
          <CrmKpiCard icon={<Briefcase className="h-4 w-4 text-[#8b5cf6]" />} label="Deals created" value={data.workDone.dealsCreated} />
          <CrmKpiCard className="border-[var(--success)]/30" icon={<Target className="h-4 w-4 text-[#10b981]" />} label="Deals won" value={data.workDone.dealsWon} />
          <CrmKpiCard icon={<Phone className="h-4 w-4 text-[#0284c7]" />} label="Calls" value={data.workDone.calls} />
          <CrmKpiCard icon={<Mail className="h-4 w-4 text-[#d97706]" />} label="Emails logged" value={data.workDone.emailsLogged} />
          <CrmKpiCard icon={<Mail className="h-4 w-4 text-[#2563eb]" />} label="Tracked sends" value={data.workDone.trackedSends} />
          <CrmKpiCard icon={<TrendingUp className="h-4 w-4 text-[#10b981]" />} label="Replies" value={data.workDone.replies} />
        </div>
      </div>

      {/* Decision Signals */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-[#1e293b]">Decision Signals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.health.indicators.map((ind) => (
            <div key={ind.key} className={cn(CRM_PANEL, "p-4 flex flex-col justify-between hover:border-slate-300 transition-all")}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{ind.label}</p>
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", INDICATOR_STATUS[ind.status])}>
                  {ind.status}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-[#0f172a] mt-2 tabular-nums">{ind.value}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-1 leading-snug">{ind.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modern Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Work Output Comparison" subtitle="Output volume across today, this week, and this month">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={comparisonChart} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
              <XAxis dataKey="period" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...CRM_CHART_TOOLTIP} />
              <Legend {...CRM_CHART_LEGEND} />
              <Bar dataKey="activities" name="Activities" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="activities" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
              </Bar>
              <Bar dataKey="leads" name="Leads" fill={CRM_CHART_INFO} radius={[6, 6, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="leads" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
              </Bar>
              <Bar dataKey="deals" name="Deals" fill={CRM_CHART_SUCCESS} radius={[6, 6, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="deals" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Activity Trend (${data.windowLabel})`} subtitle="Daily calls, emails, and total touchpoints">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={data.activityByDay} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorActivitiesArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...CRM_CHART_TOOLTIP} labelFormatter={(l) => fmtShortDate(String(l))} />
              <Legend {...CRM_CHART_LEGEND} />
              <Area type="monotone" dataKey="activities" name="Total Touches" stroke={CRM_CHART_PRIMARY} strokeWidth={2.5} fillOpacity={1} fill="url(#colorActivitiesArea)" />
              <Line type="monotone" dataKey="calls" name="Calls" stroke={CRM_CHART_INFO} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="emails" name="Emails" stroke={CRM_CHART_SECONDARY} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {workBreakdown.length > 0 && (
          <ChartCard title="Activity Mix (Donut Ring)" subtitle={`Share of activities for ${data.windowLabel.toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={270}>
              <PieChart>
                <Pie
                  data={workBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={92}
                  paddingAngle={4}
                >
                  {workBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Legend {...CRM_CHART_LEGEND} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {data.activityByType.length > 0 && (
          <ChartCard title="Activity by Type" subtitle="Distribution of rep time across touchpoint types">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart
                data={data.activityByType.slice(0, 8)}
                layout="vertical"
                margin={{ top: 4, right: 30, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                <XAxis type="number" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" width={80} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Bar dataKey="count" fill={CRM_CHART_PRIMARY} radius={[0, 6, 6, 0]} maxBarSize={22}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {emailFunnel.length > 0 && (
          <ChartCard title="Email Engagement Funnel" subtitle="Tracked sends → opens → clicks → replies conversion funnel">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={emailFunnel} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {emailFunnel.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        [CRM_CHART_PRIMARY, CRM_CHART_INFO, CRM_CHART_SECONDARY, CRM_CHART_SUCCESS][i % 4]
                      }
                    />
                  ))}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Outreach Multi-Channel Comparison" subtitle="Calls, emails, sends, and replies across timeframes">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={outreachComparison} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
              <XAxis dataKey="period" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip {...CRM_CHART_TOOLTIP} />
              <Legend {...CRM_CHART_LEGEND} />
              <Bar dataKey="calls" name="Calls" fill={CRM_CHART_INFO} radius={[6, 6, 0, 0]} maxBarSize={20} />
              <Bar dataKey="emails" name="Emails" fill={CRM_CHART_SECONDARY} radius={[6, 6, 0, 0]} maxBarSize={20} />
              <Bar dataKey="sends" name="Sends" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={20} />
              <Bar dataKey="replies" name="Replies" fill={CRM_CHART_SUCCESS} radius={[6, 6, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Pipeline snapshot + leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CrmSectionCard title="Pipeline snapshot" bodyClassName="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <PipelineStat label="Open leads" value={data.pipeline.openLeads} />
            <PipelineStat label="Open deals" value={data.pipeline.openDeals} />
            {canViewCrmRevenue ? (
              <>
                <PipelineStat label="Pipeline value" value={fmtMoney(data.pipeline.grossValueINR)} />
                <PipelineStat label="Weighted forecast" value={fmtMoney(data.pipeline.weightedValueINR)} />
              </>
            ) : null}
            <PipelineStat label="Stale leads" value={data.pipeline.staleLeads} warn={data.pipeline.staleLeads > 0} />
            <PipelineStat label="Past-due deals" value={data.pipeline.atRiskDeals} warn={data.pipeline.atRiskDeals > 0} />
            <PipelineStat label="Email open rate" value={`${data.pipeline.emailOpenRatePercent}%`} />
            <PipelineStat label="Reply rate" value={`${data.pipeline.emailReplyRatePercent}%`} />
          </div>
        </CrmSectionCard>

        {data.repLeaderboard && data.repLeaderboard.length > 0 && (
          <CrmSectionCard title={`Rep leaderboard — ${data.windowLabel}`} bodyClassName="pt-4 space-y-4">
            {leaderboardChart.length > 0 ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leaderboardChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                    <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                    <Tooltip
                      {...CRM_CHART_TOOLTIP}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                      }
                    />
                    <Legend {...CRM_CHART_LEGEND} />
                    <Bar dataKey="activities" name="Activities" fill={CRM_CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="leads" name="Leads" fill={CRM_CHART_INFO} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="deals" name="Deals" fill={CRM_CHART_SUCCESS} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <div className="space-y-2">
              {data.repLeaderboard.map((rep, i) => (
                <div
                  key={rep.name}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-dim)] px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                    <span className="truncate text-sm font-semibold text-[var(--text-main)]">{rep.name}</span>
                  </div>
                  <div className="flex shrink-0 gap-4 text-xs text-[var(--text-muted)]">
                    <span><strong className="text-[var(--text-main)]">{rep.activities}</strong> acts</span>
                    <span><strong className="text-[var(--text-main)]">{rep.leadsCreated}</strong> leads</span>
                    <span><strong className="text-[var(--text-main)]">{rep.dealsCreated}</strong> deals</span>
                  </div>
                </div>
              ))}
            </div>
          </CrmSectionCard>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <CrmChartPanel title={title} subtitle={subtitle} bodyClassName="pt-0">
      {children}
    </CrmChartPanel>
  );
}

function PipelineStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
      <p className={cn("text-lg font-bold mt-0.5 tabular-nums", warn ? "text-amber-600" : "text-text-main")}>
        {value}
      </p>
    </div>
  );
}
