"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
  LabelList,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Timer,
  TrendingUp,
  Users,
  Layers,
} from "lucide-react";
import type { BoardReportPayload } from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import type { ReportSummaryPayload } from "@/components/crm/reports/charts/CrmReportSummaryCharts";
import type { LeadReportVariant } from "@/lib/crm/shared/dashboard-routes";
import CrmDailyIntakeDetailPanel from "@/components/crm/reports/panels/CrmDailyIntakeDetailPanel";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmChartPanel, CrmKpiCard } from "@/components/crm/ui";
import {
  CRM_CHART_GRID,
  CRM_CHART_INFO,
  CRM_CHART_LEGEND,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SERIES,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { cn } from "@/lib/utils";

const ENABLE_TEST_DATA = false;

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function formatHoursLabel(hours: number): string {
  if (!hours || hours <= 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

/** Map ReportsShell period → summary-charts window. */
function periodToSummaryWindow(days: string): string {
  if (days === "yesterday") return "yesterday";
  if (days.includes(",")) {
    // Prefer calendar windows when the YMD range looks like this week / this month.
    const [from, to] = days.split(",", 2);
    if (from?.endsWith("-01") && to) {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      if (from === monthStart) return "this_month";
    }
    return "last_30_days";
  }
  const n = Number(days);
  if (n <= 1) return "today";
  if (n <= 7) return "this_week";
  if (n <= 31) return "last_30_days";
  return "last_30_days";
}

function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dimBarRows(
  rows: Array<{ name: string; value: number }>,
): Array<{ name: string; fullName: string; count: number }> {
  return rows
    .filter((r) => r.name !== "Unspecified" && r.value > 0)
    .slice(0, 8)
    .map((r) => ({
      name: r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
      fullName: r.name,
      count: r.value,
    }));
}

function DimCategoryChart({
  title,
  subtitle,
  rows,
  color,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; fullName: string; count: number }>;
  color: string;
  emptyMessage: string;
}) {
  return (
    <CrmChartPanel title={title} subtitle={subtitle} icon={<Layers className="h-4 w-4" />} bodyClassName="pt-2">
      <div className="h-[240px] w-full">
        {rows.length === 0 ? (
          <ChartEmpty message={emptyMessage} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={CRM_CHART_TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...CRM_CHART_TOOLTIP}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                }
              />
              <Bar dataKey="count" fill={color} name="Leads" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </CrmChartPanel>
  );
}

export default function CrmLeadsReportPanel({
  days = "30",
  owner = "All",
  variant = "overview",
  compare,
  compareMode: _compareMode = "previous",
}: {
  days?: string;
  owner?: string;
  variant?: LeadReportVariant;
  compare?: string;
  compareMode?: import("@/portals/crm/lib/reports/period-compare").CompareMode;
}) {
  const [board, setBoard] = useState<BoardReportPayload | null>(null);
  const [summary, setSummary] = useState<ReportSummaryPayload | null>(null);
  const [leadsDash, setLeadsDash] = useState<{
    leadsByStatus?: Array<{ name: string; value: number }>;
    leadsBySource?: Array<{ name: string; value: number }>;
    leadsByIndustry?: Array<{ name: string; value: number }>;
    leadsByRegion?: Array<{ name: string; value: number }>;
    leadsByPriority?: Array<{ name: string; value: number }>;
    monthlyPerformance?: Array<{ month: string; created: number; converted: number }>;
    quarterlyPerformance?: Array<{
      quarter: string;
      created: number;
      converted: number;
      conversionRate: number;
    }>;
    lostLeadsByStage?: Array<{ stage: string; count: number }>;
    convertedLeadsByStage?: Array<{ stage: string; count: number }>;
    topLeadSources?: Array<{ name: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const rawId = useId();
  const leadGradientId = `leadsTrend-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const boardQ = new URLSearchParams({ days, owner });
      if (compare) boardQ.set("compare", compare);
      const summaryWindow = periodToSummaryWindow(days);
      try {
        const needsSummary = variant === "conversion_time";
        const needsDash = variant === "overview" || variant === "funnel";
        const [boardRes, summaryRes, dashRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/reports/board?${boardQ}`, { headers }),
          needsSummary
            ? fetch(
                `${CRM_API_URL}/crm/reports/summary-charts?window=${encodeURIComponent(summaryWindow)}&owner=${encodeURIComponent(owner)}`,
                { headers },
              )
            : Promise.resolve(null),
          needsDash
            ? fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${boardQ}`, { headers })
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setBoard(boardRes.ok ? await boardRes.json() : null);
          if (summaryRes && summaryRes.ok) setSummary(await summaryRes.json());
          else if (!needsSummary) setSummary(null);
          else setSummary(null);
          if (dashRes && dashRes.ok) setLeadsDash(await dashRes.json());
          else if (!needsDash) setLeadsDash(null);
          else setLeadsDash(null);
        }
      } catch {
        if (!cancelled) {
          setBoard(null);
          setSummary(null);
          setLeadsDash(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, owner, variant, compare]);

  const leadsByDay = useMemo(
    () =>
      (board?.leadsCreatedByDay ?? []).map((r) => ({
        label: shortDateLabel(r.date),
        count: r.count,
      })),
    [board?.leadsCreatedByDay],
  );

  const leadsByOwner = useMemo(
    () =>
      (board?.leadsByOwner ?? []).slice(0, 8).map((r) => ({
        name: r.owner.length > 16 ? `${r.owner.slice(0, 14)}…` : r.owner,
        fullName: r.owner,
        count: r.count,
      })),
    [board?.leadsByOwner],
  );

  const leadsByStage = useMemo(() => {
    const stageMap = new Map<string, number>();
    for (const pipe of board?.openLeadsByPipeline ?? []) {
      for (const s of pipe.stages ?? []) {
        stageMap.set(s.stage, (stageMap.get(s.stage) || 0) + s.count);
      }
    }
    return [...stageMap.entries()]
      .map(([stage, count]) => ({
        name: stage.length > 18 ? `${stage.slice(0, 16)}…` : stage,
        fullStage: stage,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [board?.openLeadsByPipeline]);

  const conversionData = useMemo(() => {
    const c = board?.leadConversion;
    if (!c) return [];
    return [
      { name: "Created", count: c.createdInPeriod },
      { name: "Converted", count: c.convertedInPeriod },
    ];
  }, [board?.leadConversion]);

  const followUpSlices = useMemo(() => {
    const h = board?.followUpHealth;
    if (!h || h.openLeads <= 0) return [];
    return [
      { name: "Touched recently", value: h.leadsTouchedRecently },
      { name: "Stale", value: h.staleLeads },
    ].filter((r) => r.value > 0);
  }, [board?.followUpHealth]);

  const channelRows = useMemo(
    () =>
      (board?.channelPerformance ?? []).slice(0, 8).map((r) => ({
        name: r.channel.length > 14 ? `${r.channel.slice(0, 12)}…` : r.channel,
        fullName: r.channel,
        leads: r.leads,
        converted: r.converted,
        conversionRate: r.conversionRate,
        replies: r.replies,
      })),
    [board?.channelPerformance],
  );

  const pipelineVolume = useMemo(() => {
    return (board?.openLeadsByPipeline ?? [])
      .map((p) => ({
        name: p.pipelineName.length > 16 ? `${p.pipelineName.slice(0, 14)}…` : p.pipelineName,
        fullName: p.pipelineName,
        leads: p.total,
      }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8);
  }, [board?.openLeadsByPipeline]);

  const statusDim = useMemo(
    () => dimBarRows(leadsDash?.leadsByStatus ?? []),
    [leadsDash?.leadsByStatus],
  );
  const sourceDim = useMemo(
    () => dimBarRows(leadsDash?.leadsBySource ?? []),
    [leadsDash?.leadsBySource],
  );
  const industryDim = useMemo(
    () => dimBarRows(leadsDash?.leadsByIndustry ?? []),
    [leadsDash?.leadsByIndustry],
  );
  const regionDim = useMemo(
    () => dimBarRows(leadsDash?.leadsByRegion ?? []),
    [leadsDash?.leadsByRegion],
  );
  const priorityDim = useMemo(
    () => dimBarRows(leadsDash?.leadsByPriority ?? []),
    [leadsDash?.leadsByPriority],
  );
  const monthlyDim = useMemo(
    () =>
      (leadsDash?.monthlyPerformance ?? []).map((r) => ({
        name: r.month,
        created: Number(r.created) || 0,
        converted: Number(r.converted) || 0,
      })),
    [leadsDash?.monthlyPerformance],
  );
  const quarterlyDim = useMemo(
    () =>
      (leadsDash?.quarterlyPerformance ?? []).map((r) => ({
        name: r.quarter,
        created: Number(r.created) || 0,
        converted: Number(r.converted) || 0,
      })),
    [leadsDash?.quarterlyPerformance],
  );
  const lostStageDim = useMemo(
    () =>
      (leadsDash?.lostLeadsByStage ?? []).map((r) => ({
        name: r.stage.length > 16 ? `${r.stage.slice(0, 14)}…` : r.stage,
        fullName: r.stage,
        count: Number(r.count) || 0,
      })),
    [leadsDash?.lostLeadsByStage],
  );
  const convertedStageDim = useMemo(
    () =>
      (leadsDash?.convertedLeadsByStage ?? []).map((r) => ({
        name: r.stage.length > 16 ? `${r.stage.slice(0, 14)}…` : r.stage,
        fullName: r.stage,
        count: Number(r.count) || 0,
      })),
    [leadsDash?.convertedLeadsByStage],
  );

  if (loading) {
    return (
      <div className="grid animate-pulse gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[260px] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-surface-dim"
          />
        ))}
      </div>
    );
  }

  if (!board && variant !== "conversion_time") {
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-main)]">
        Could not load lead report data. Check your connection and{" "}
        <code className="font-mono text-xs">leads:read</code> / dashboard permissions.
      </p>
    );
  }

  if (variant === "conversion_time" && !summary && !board) {
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3 text-sm text-[var(--text-main)]">
        Could not load conversion-time charts.
      </p>
    );
  }

  const conv = board?.leadConversion;
  const health = board?.followUpHealth;

  return (
    <div className="space-y-6 sm:space-y-8 outline-none font-sans pb-6">
      {/* Top Header Bar with Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
              {variant === "funnel"
                ? "Lead Conversion Funnel"
                : variant === "aging"
                  ? "Follow-Up Health & Aging"
                  : variant === "conversion_time"
                    ? "Outreach & Response Speed"
                    : "Lead Performance"}
            </h1>
            {ENABLE_TEST_DATA && (
              <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-sm font-semibold text-[#d97706] border border-[#fde68a]">
                Test Mode ON
              </span>
            )}
          </div>
          <p className="text-md font-medium text-[var(--color-text-muted)] leading-[18px]">
            {variant === "funnel"
              ? "Stage-by-stage progression from new lead creation to conversion."
              : variant === "aging"
                ? "Lead activity freshness, stale lead tracking, and follow-up coverage."
                : variant === "conversion_time"
                  ? "Average time to first outreach and follow-up email response cadence."
                  : "Real-time lead creation, owner distribution, pipeline load, and channel conversions."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-md font-semibold text-[var(--color-text-main)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:bg-[var(--color-surface-raised)] hover:border-[#cbd5e1] transition-all"
          >
            <Users size={14} className="text-[var(--color-text-muted)]" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {variant === "overview" && conv && (
        <>
          {/* Top 4 KPI Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
            {/* Card 1: Leads Created */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm">
                <Users size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Leads Created</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{conv.createdInPeriod}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-sm font-semibold text-[#1e40af]">
                In selected period
              </span>
            </div>

            {/* Card 2: Conversion Rate */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#10b981] text-white shadow-sm">
                <TrendingUp size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Conversion Rate</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{conv.conversionRate}%</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-sm font-semibold text-[#15803d]">
                {conv.convertedInPeriod} converted
              </span>
            </div>

            {/* Card 3: Open Leads */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#8b5cf6] text-white shadow-sm">
                <Layers size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Open Leads</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{health?.openLeads ?? 0}</span>
              <span className="inline-block rounded-full bg-[#f3e8ff] px-2.5 py-0.5 text-sm font-semibold text-[#6b21a8]">
                In active pipeline
              </span>
            </div>

            {/* Card 4: Stale Leads */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-sm">
                <AlertTriangle size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Stale Leads</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{health?.staleLeads ?? 0}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-sm font-semibold text-[#b91c1c]">
                {health ? `${health.touchCoveragePercent}% touched` : "Needs follow-up"}
              </span>
            </div>
          </div>

          <CrmDailyIntakeDetailPanel
            days={days}
            owner={owner}
            board={board}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <CrmChartPanel
              title="Leads Added by Day"
              subtitle="Daily volume in the selected period"
              icon={<Users className="h-4 w-4" />}
              className="lg:col-span-2 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="h-[240px] sm:h-[280px] w-full">
                {leadsByDay.every((r) => r.count === 0) ? (
                  <ChartEmpty message="No leads created in this range" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={leadsByDay} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={leadGradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="label" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <Tooltip {...CRM_CHART_TOOLTIP} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Leads"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        fill={`url(#${leadGradientId})`}
                        dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#ffffff" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>

            {/* Channel Performance Dual Grouped Bar Chart */}
            <CrmChartPanel
              title="Channel Performance"
              subtitle="Leads generated vs converted by source"
              icon={<Target className="h-4 w-4" />}
              className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="h-[240px] sm:h-[280px] w-full">
                {channelRows.every((r) => r.leads === 0) ? (
                  <ChartEmpty message="No channel performance data available" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelRows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
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
                      <Bar dataKey="leads" fill="#2563eb" name="Total Leads" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="converted" fill="#10b981" name="Converted" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <DimCategoryChart
              title="Leads by status"
              subtitle="Detailed status mix for the period"
              rows={statusDim}
              color={CRM_CHART_PRIMARY}
              emptyMessage="No status breakdown for this period"
            />
            <DimCategoryChart
              title="Leads by source"
              subtitle="Acquisition channels"
              rows={sourceDim}
              color={CRM_CHART_INFO}
              emptyMessage="No source data — set Lead Source on new leads"
            />
            <DimCategoryChart
              title="Leads by industry"
              subtitle="Industry field when set"
              rows={industryDim}
              color="#7c3aed"
              emptyMessage="No industry data on leads yet"
            />
            <DimCategoryChart
              title="Leads by region"
              subtitle="Territory field"
              rows={regionDim}
              color={CRM_CHART_SUCCESS}
              emptyMessage="No territory / region data yet"
            />
            <DimCategoryChart
              title="Leads by priority"
              subtitle="Priority when set"
              rows={priorityDim}
              color={CRM_CHART_WARNING}
              emptyMessage="No priority values on leads yet"
            />
            <CrmChartPanel
              title="Monthly lead performance"
              subtitle="Created vs converted by month"
              icon={<TrendingUp className="h-4 w-4" />}
              bodyClassName="pt-2"
            >
              <div className="h-[240px] w-full">
                {monthlyDim.every((r) => r.created === 0 && r.converted === 0) ? (
                  <ChartEmpty message="No monthly lead performance yet" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDim} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <Tooltip {...CRM_CHART_TOOLTIP} />
                      <Legend {...CRM_CHART_LEGEND} />
                      <Bar dataKey="created" fill={CRM_CHART_INFO} name="Created" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="converted" fill={CRM_CHART_SUCCESS} name="Converted" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CrmChartPanel
              title="Quarterly lead performance"
              subtitle="Created vs converted by quarter"
              icon={<TrendingUp className="h-4 w-4" />}
              bodyClassName="pt-2"
            >
              <div className="h-[240px] w-full">
                {quarterlyDim.every((r) => r.created === 0 && r.converted === 0) ? (
                  <ChartEmpty message="Need more history for quarterly rollup" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quarterlyDim} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <Tooltip {...CRM_CHART_TOOLTIP} />
                      <Legend {...CRM_CHART_LEGEND} />
                      <Bar dataKey="created" fill={CRM_CHART_PRIMARY} name="Created" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="converted" fill={CRM_CHART_SUCCESS} name="Converted" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>
            <DimCategoryChart
              title="Top lead sources"
              subtitle="Highest volume channels"
              rows={dimBarRows(
                (leadsDash?.topLeadSources ?? []).map((r) => ({ name: r.name, value: r.count })),
              )}
              color={CRM_CHART_PRIMARY}
              emptyMessage="No top sources yet"
            />
          </div>
        </>
      )}

      {variant === "funnel" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <CrmChartPanel
              title="Lead conversion funnel"
              subtitle="Created → converted in period"
              icon={<TrendingUp className="h-4 w-4" />}
              bodyClassName="pt-2"
            >
              <div className="h-[280px] w-full">
                {conversionData.every((r) => r.count === 0) ? (
                  <ChartEmpty message="No leads in this period" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={conversionData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <Tooltip {...CRM_CHART_TOOLTIP} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="count" position="top" fontSize={11} fill="var(--text-main)" />
                        {conversionData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={[CRM_CHART_INFO, CRM_CHART_SUCCESS, CRM_CHART_PRIMARY][i % 3]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>

            <CrmChartPanel
              title="Leads by stage"
              subtitle="Open leads across pipeline stages"
              icon={<Layers className="h-4 w-4" />}
              bodyClassName="pt-2"
            >
              <div className="h-[280px] w-full">
                {leadsByStage.length === 0 ? (
                  <ChartEmpty message="No open leads by stage" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadsByStage} layout="vertical" margin={{ left: 4, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={CRM_CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        {...CRM_CHART_TOOLTIP}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullStage ? String(payload[0].payload.fullStage) : ""
                        }
                      />
                      <Bar dataKey="count" fill={CRM_CHART_PRIMARY} name="Open leads" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="count" position="right" fontSize={10} fill="var(--text-muted)" />
                        {leadsByStage.map((_, i) => (
                          <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DimCategoryChart
              title="Lost leads by stage"
              subtitle="Where leads were lost / disqualified"
              rows={lostStageDim}
              color={CRM_CHART_PRIMARY}
              emptyMessage="No lost or disqualified leads in this period"
            />
            <DimCategoryChart
              title="Converted leads by stage"
              subtitle="Last stage before conversion"
              rows={convertedStageDim}
              color={CRM_CHART_SUCCESS}
              emptyMessage="No converted leads in this period"
            />
          </div>
        </div>
      )}

      {variant === "aging" && (
        <>
          {/* Aging KPI Summary Row */}
          {health && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
              <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm">
                  <Layers size={20} />
                </div>
                <span className="text-md font-semibold text-[var(--color-text-muted)]">Open Pipeline Leads</span>
                <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                  {health.openLeads}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-sm font-semibold text-[#1e40af]">
                  Active Lead Queue
                </span>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#10b981] text-white shadow-sm">
                  <CheckCircle2 size={20} />
                </div>
                <span className="text-md font-semibold text-[var(--color-text-muted)]">Touched Recently</span>
                <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                  {health.leadsTouchedRecently}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-sm font-semibold text-[#15803d]">
                  {health.touchCoveragePercent}% coverage
                </span>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-sm">
                  <AlertTriangle size={20} />
                </div>
                <span className="text-md font-semibold text-[var(--color-text-muted)]">Stale Leads</span>
                <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                  {health.staleLeads}
                </span>
                <span className="inline-block rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-sm font-semibold text-[#b91c1c]">
                  Requires Immediate Action
                </span>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff9f43] text-white shadow-sm">
                  <Clock size={20} />
                </div>
                <span className="text-md font-semibold text-[var(--color-text-muted)]">Stale Threshold</span>
                <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                  {health.staleDays}d
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-sm font-semibold text-[#c2410c]">
                  No Activity Window
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <CrmChartPanel
              title="Follow-Up Health"
              subtitle={`Open leads touched in last ${health?.staleDays ?? 7} days vs stale backlog`}
              icon={<Target className="h-4 w-4" />}
              className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="mb-2 flex justify-end">
                {health && (
                  <div
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                      health.touchCoveragePercent >= 70
                        ? "border-[#10b981]/30 bg-[#dcfce7] text-[#15803d]"
                        : health.touchCoveragePercent >= 40
                          ? "border-[#f59e0b]/30 bg-[#fef3c7] text-[#b45309]"
                          : "border-[#ef4444]/30 bg-[#fee2e2] text-[#b91c1c]",
                    )}
                  >
                    {health.touchCoveragePercent >= 70 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {health.touchCoveragePercent}% touched · {health.staleLeads} stale
                  </div>
                )}
              </div>
              <div className="h-[260px] w-full">
                {followUpSlices.length === 0 ? (
                  <ChartEmpty message="No open leads" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={followUpSlices}
                        cx="50%"
                        cy="48%"
                        innerRadius={55}
                        outerRadius={85}
                        dataKey="value"
                        nameKey="name"
                        paddingAngle={3}
                      >
                        {followUpSlices.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "#10b981" : "#ef4444"} />
                        ))}
                      </Pie>
                      <Tooltip {...CRM_CHART_TOOLTIP} />
                      <Legend {...CRM_CHART_LEGEND} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>

            <CrmChartPanel
              title="Aging Snapshot"
              subtitle="Coverage vs backlog needing immediate rep attention"
              icon={<AlertTriangle className="h-4 w-4" />}
              className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="grid h-[280px] content-center gap-4 px-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[#f8fafc] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Touched Recently
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">Activity recorded in last 7 days</p>
                  </div>
                  <p className="text-4xl font-bold tabular-nums text-[#10b981]">
                    {health?.leadsTouchedRecently ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[#f8fafc] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Stale (Need Follow-up)
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">No emails or calls in &gt; 7 days</p>
                  </div>
                  <p className="text-4xl font-bold tabular-nums text-[#ef4444]">
                    {health?.staleLeads ?? 0}
                  </p>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Aging tracks rep activities on active leads. Improve touch coverage directly from your CRM Work Dashboard.
                </p>
              </div>
            </CrmChartPanel>
          </div>
        </>
      )}

      {variant === "conversion_time" && (
        <>
          {/* Conversion Time KPI Summary Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm">
                <Clock size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Avg First Outreach</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                {formatHoursLabel(
                  summary?.leadTiming?.avgOutreachHours ?? summary?.totals.avgOutreachHours ?? 0,
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-sm font-semibold text-[#1e40af]">
                Lead Created → First Email
              </span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#10b981] text-white shadow-sm">
                <Timer size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Avg Follow-Up Time</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                {formatHoursLabel(
                  summary?.leadTiming?.avgFollowUpHours ?? summary?.totals.avgFollowUpHours ?? 0,
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-sm font-semibold text-[#15803d]">
                Between Tracked Emails
              </span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#8b5cf6] text-white shadow-sm">
                <Users size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Outreach Samples</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                {summary?.leadTiming?.outreachSamples ?? 0}
              </span>
              <span className="inline-block rounded-full bg-[#f3e8ff] px-2.5 py-0.5 text-sm font-semibold text-[#6b21a8]">
                Leads Contacted
              </span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-5 text-center border border-[var(--color-border)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:border-[#cbd5e1] transition-all">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff9f43] text-white shadow-sm">
                <Target size={20} />
              </div>
              <span className="text-md font-semibold text-[var(--color-text-muted)]">Follow-Up Samples</span>
              <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">
                {summary?.leadTiming?.followUpSamples ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-sm font-semibold text-[#c2410c]">
                Email Sequences Sent
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CrmChartPanel
              title="First Outreach Speed Distribution"
              subtitle={`Lead created → first outreach email · ${summary?.leadTiming?.outreachSamples ?? 0} leads`}
              icon={<Clock className="h-4 w-4" />}
              className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="h-[260px] w-full">
                {!summary?.leadTiming || summary.leadTiming.outreachSamples === 0 ? (
                  <ChartEmpty message="No first outreach emails in this period" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={summary.leadTiming.outreachByBucket}
                      margin={{ top: 16, right: 12, left: -4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="label" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={CRM_CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatHoursLabel(Number(v))}
                      />
                      <Tooltip
                        {...CRM_CHART_TOOLTIP}
                        formatter={(value, _name, item) => [
                          `${formatHoursLabel(Number(value))} avg (${item?.payload?.samples ?? 0} leads)`,
                          "Outreach Speed",
                        ]}
                      />
                      <Bar dataKey="hours" name="Avg Hours" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="hours" position="top" formatter={(v: any) => formatHoursLabel(Number(v))} fontSize={11} fill="var(--color-text-main)" fontWeight={600} />
                        {summary.leadTiming.outreachByBucket.map((_, i) => (
                          <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>

            <CrmChartPanel
              title="Follow-Up Cadence Distribution"
              subtitle={`Time elapsed between sequence emails · ${summary?.leadTiming?.followUpSamples ?? 0} emails`}
              icon={<Timer className="h-4 w-4" />}
              className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
              bodyClassName="pt-2"
            >
              <div className="h-[260px] w-full">
                {!summary?.leadTiming || summary.leadTiming.followUpSamples === 0 ? (
                  <ChartEmpty message="No follow-up emails in this period" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={summary.leadTiming.followUpByBucket}
                      margin={{ top: 16, right: 12, left: -4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                      <XAxis dataKey="label" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={CRM_CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatHoursLabel(Number(v))}
                      />
                      <Tooltip
                        {...CRM_CHART_TOOLTIP}
                        formatter={(value, _name, item) => [
                          `${formatHoursLabel(Number(value))} avg (${item?.payload?.samples ?? 0} leads)`,
                          "Follow-Up Cadence",
                        ]}
                      />
                      <Bar dataKey="hours" name="Avg Hours" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="hours" position="top" formatter={(v: any) => formatHoursLabel(Number(v))} fontSize={11} fill="var(--color-text-main)" fontWeight={600} />
                        {summary.leadTiming.followUpByBucket.map((_, i) => (
                          <Cell key={i} fill={CRM_CHART_SERIES[(i + 2) % CRM_CHART_SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CrmChartPanel>
          </div>
        </>
      )}
    </div>
  );
}
