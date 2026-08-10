"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  Calendar,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
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
  healthy: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", bar: "#10b981" },
  watch: { ring: "ring-amber-200", bg: "bg-amber-50", text: "text-amber-700", bar: "#f59e0b" },
  at_risk: { ring: "ring-rose-200", bg: "bg-rose-50", text: "text-rose-700", bar: "#f43f5e" },
};

const INDICATOR_STATUS: Record<string, string> = {
  good: "text-emerald-600 bg-emerald-50",
  watch: "text-amber-600 bg-amber-50",
  risk: "text-rose-600 bg-rose-50",
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
      { name: "Calls", value: w.calls, color: "#3b82f6" },
      { name: "Emails", value: w.emailsLogged, color: "#8b5cf6" },
      { name: "Tasks", value: w.tasksLogged, color: "#f59e0b" },
      { name: "Meetings", value: w.meetings, color: "#10b981" },
    ].filter((x) => x.value > 0);
  }, [data]);

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
      <div className="rounded-[3px] border border-rose-200 bg-rose-50 p-6 text-rose-700 text-sm">
        {error || "No data available"}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-main">Sales department health</h2>
          <p className="text-sm text-text-muted mt-0.5">
            Work done, activity trends, and pipeline signals for {data.windowLabel.toLowerCase()}
            {owner !== "All" ? ` · ${owner}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWindow(opt.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                window === opt.value
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-100 text-text-muted hover:bg-slate-200",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Health score + KPI row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div
          className={cn(
            "lg:col-span-4 rounded-[28px] border p-6 shadow-sm ring-2",
            statusTheme.ring,
            statusTheme.bg,
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted">Overall health</p>
              <p className={cn("text-5xl font-bold mt-2 tabular-nums", statusTheme.text)}>{data.health.score}</p>
              <p className={cn("text-sm font-semibold mt-1 capitalize", statusTheme.text)}>
                {data.health.status.replace("_", " ")}
              </p>
            </div>
            {data.health.status === "healthy" ? (
              <CheckCircle2 className={cn("h-10 w-10", statusTheme.text)} />
            ) : (
              <AlertTriangle className={cn("h-10 w-10", statusTheme.text)} />
            )}
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/60 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${data.health.score}%`, backgroundColor: statusTheme.bar }}
            />
          </div>
        </div>

        <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard icon={<Activity className="h-4 w-4" />} label="Activities" value={data.workDone.activities} />
          <KpiCard icon={<Users className="h-4 w-4" />} label="Leads created" value={data.workDone.leadsCreated} />
          <KpiCard icon={<Briefcase className="h-4 w-4" />} label="Deals created" value={data.workDone.dealsCreated} />
          <KpiCard icon={<Target className="h-4 w-4" />} label="Deals won" value={data.workDone.dealsWon} highlight />
          <KpiCard icon={<Phone className="h-4 w-4" />} label="Calls" value={data.workDone.calls} />
          <KpiCard icon={<Mail className="h-4 w-4" />} label="Emails logged" value={data.workDone.emailsLogged} />
          <KpiCard icon={<Mail className="h-4 w-4" />} label="Tracked sends" value={data.workDone.trackedSends} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Replies" value={data.workDone.replies} />
        </div>
      </div>

      {/* Health indicators */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-3">Decision signals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.health.indicators.map((ind) => (
            <div key={ind.key} className="rounded-[3px] border border-[#ebecf0] bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-text-muted">{ind.label}</p>
                <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", INDICATOR_STATUS[ind.status])}>
                  {ind.status}
                </span>
              </div>
              <p className="text-2xl font-bold text-text-main mt-1 tabular-nums">{ind.value}</p>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">{ind.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Work done — today vs week vs month" subtitle="Compare output across time windows">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparisonChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="activities" name="Activities" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="deals" name="Deals" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Activity trend — ${data.windowLabel}`} subtitle="Daily calls, emails, and total touches">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.activityByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(l) => fmtShortDate(String(l))} />
              <Legend />
              <Line type="monotone" dataKey="activities" name="All" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="calls" name="Calls" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="emails" name="Emails" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {workBreakdown.length > 0 && (
          <ChartCard title="Activity mix" subtitle={`Breakdown for ${data.windowLabel.toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={workBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {workBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {data.activityByType.length > 0 && (
          <ChartCard title="Activity by type" subtitle="Where reps are spending time">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.activityByType.slice(0, 8)}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="type" width={72} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Pipeline snapshot + leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[28px] border border-[#ebecf0] bg-card p-6 shadow-sm">
          <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Pipeline snapshot
          </h3>
          <div className="grid grid-cols-2 gap-4 mt-4">
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
        </div>

        {data.repLeaderboard.length > 0 && owner === "All" && (
          <div className="rounded-[28px] border border-[#ebecf0] bg-card p-6 shadow-sm">
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Rep leaderboard — {data.windowLabel}
            </h3>
            <div className="mt-4 space-y-2">
              {data.repLeaderboard.map((rep, i) => (
                <div
                  key={rep.name}
                  className="flex items-center justify-between gap-3 rounded-[3px] bg-[#f4f5f7] px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-black text-text-muted w-5">{i + 1}</span>
                    <span className="text-sm font-semibold text-text-main truncate">{rep.name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-text-muted shrink-0">
                    <span><strong className="text-text-main">{rep.activities}</strong> acts</span>
                    <span><strong className="text-text-main">{rep.leadsCreated}</strong> leads</span>
                    <span><strong className="text-text-main">{rep.dealsCreated}</strong> deals</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[3px] border p-4 shadow-sm",
        highlight ? "border-emerald-100 bg-emerald-50/50" : "border-[#ebecf0] bg-card",
      )}
    >
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-text-main mt-2 tabular-nums">{value}</p>
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
    <div className="rounded-[28px] border border-[#ebecf0] bg-card p-6 shadow-sm">
      <h3 className="text-sm font-bold text-text-main">{title}</h3>
      <p className="text-xs text-text-muted mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
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
