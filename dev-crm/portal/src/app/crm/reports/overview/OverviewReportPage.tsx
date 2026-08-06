"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  Target,
  Users,
  Activity as ActivityIcon,
  RefreshCw,
  Download,
  Maximize2,
  TrendingUp,
  DollarSign,
  BarChart3,
  Box,
  FileText,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import CrmReportSummaryCharts from "@/components/crm/reports/charts/CrmReportSummaryCharts";
import CrmDashboardAnalyticsCharts, {
  type DashboardAnalyticsPayload,
} from "@/components/crm/reports/charts/CrmDashboardAnalyticsCharts";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  compareSubtitle,
  type PeriodMeta,
} from "@/portals/crm/lib/reports/period-compare";
import ReportsShell, { type ReportsShellContext } from "../_components/ReportsShell";

/**
 * Live Data Mode: Strict backend API data only.
 */
const ENABLE_TEST_DATA = false;

interface DashboardStat {
  name: string;
  value: number | string;
  delta: number;
  deltaSuffix: string;
  title: string;
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const ICON_BG_COLORS = [
  "bg-[#dc2626]", // Red
  "bg-[#ff9f43]", // Amber
  "bg-[#2563eb]", // Blue
  "bg-[#06b6d4]", // Cyan
  "bg-[#8b5cf6]", // Purple
  "bg-[#10b981]", // Green
];

const BREAKDOWN_BAR_COLORS = [
  "bg-[#8b5cf6]", // Purple
  "bg-[#ef4444]", // Red
  "bg-[#ff9f43]", // Amber
  "bg-[#06b6d4]", // Cyan
  "bg-[#10b981]", // Green
  "bg-[#3b82f6]", // Blue
];

const BREAKDOWN_DOT_COLORS = [
  "bg-[#8b5cf6]",
  "bg-[#ef4444]",
  "bg-[#ff9f43]",
  "bg-[#06b6d4]",
  "bg-[#10b981]",
  "bg-[#3b82f6]",
];

function OverviewBody({
  period,
  compare,
  compareMode,
  owner,
  filters,
  canViewRevenue,
  refreshToken,
}: ReportsShellContext & { refreshToken: number }) {
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [periodMeta, setPeriodMeta] = useState<PeriodMeta | null>(null);
  const [dashboardAnalytics, setDashboardAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const filtersKey = filters.length > 0 ? JSON.stringify(filters) : "";
  const showCompare = compareMode !== "off";

  const load = useCallback(async () => {
    setLoading(true);
    const token = getCrmAuthToken();
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const qs = new URLSearchParams({ days: period, owner });
      if (filtersKey) qs.set("filters", filtersKey);
      if (compare) qs.set("compare", compare);

      const dashboardRes = await fetch(`${CRM_API_URL}/crm/dashboard?${qs.toString()}`, {
        headers: authHeaders,
      });
      const dashboard = await dashboardRes.json();

      if (dashboard?.stats) setStats(dashboard.stats);
      else setStats([]);
      setPeriodMeta(dashboard?.periodMeta ?? null);
      setDashboardAnalytics({
        funnel: Array.isArray(dashboard?.funnel) ? dashboard.funnel : [],
        summary: dashboard?.summary,
        charts: dashboard?.charts ?? null,
      });
    } catch (err) {
      console.error("Fetch overview report error:", err);
      setStats([]);
      setPeriodMeta(null);
      setDashboardAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [period, compare, owner, filtersKey, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived real metrics from live API charts
  const salesTrend = useMemo(() => dashboardAnalytics?.charts?.salesTrend ?? [], [dashboardAnalytics]);
  const revenueForecast = useMemo(() => dashboardAnalytics?.charts?.revenueForecast ?? [], [dashboardAnalytics]);
  const dealsByStage = useMemo(() => dashboardAnalytics?.charts?.dealsByStage ?? [], [dashboardAnalytics]);
  const deltaSub = compareSubtitle(compareMode, periodMeta);

  const totalSalesRevenue = useMemo(
    () => salesTrend.reduce((sum, item) => sum + (Number(item.revenue) || 0), 0),
    [salesTrend]
  );

  const totalDealsCount = useMemo(
    () => salesTrend.reduce((sum, item) => sum + (Number(item.leads) || 0), 0),
    [salesTrend]
  );

  const avgDealValue = useMemo(
    () => (totalDealsCount > 0 ? Math.round(totalSalesRevenue / totalDealsCount) : 0),
    [totalSalesRevenue, totalDealsCount]
  );

  const totalForecastValue = useMemo(
    () => revenueForecast.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [revenueForecast]
  );

  const totalStageCount = useMemo(
    () => dealsByStage.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [dealsByStage]
  );

  const sortedDealsByStage = useMemo(
    () => [...dealsByStage].sort((a, b) => b.value - a.value).slice(0, 6),
    [dealsByStage]
  );

  return (
    <div className="space-y-6 sm:space-y-8 outline-none font-sans pb-6">
      {/* Top Header Bar with Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">Revenue Summary</h1>
            {ENABLE_TEST_DATA && (
              <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-sm font-semibold text-[#d97706] border border-[#fde68a]">
                Test Mode ON
              </span>
            )}
          </div>
          <p className="text-md font-medium text-[var(--color-text-muted)] leading-[18px]">Real-time deal values, forecasted revenue, and pipeline performance.</p>
          {periodMeta?.currentLabel ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Showing <span className="font-semibold text-[var(--color-text-main)]">{periodMeta.currentLabel}</span>
              {showCompare && deltaSub ? (
                <>
                  {" "}
                  · <span className="font-semibold text-[var(--color-text-main)]">{deltaSub}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-md font-semibold text-[var(--color-text-main)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:bg-[var(--color-surface-raised)] hover:border-[#cbd5e1] transition-all"
          >
            <Download size={14} className="text-[var(--color-text-muted)]" />
            <span>Export</span>
            <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-white p-2 text-[var(--color-text-main)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:bg-[var(--color-surface-raised)] hover:border-[#cbd5e1] transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#2563eb]" : "text-[var(--color-text-muted)]"} />
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-white p-2 text-[var(--color-text-main)] shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] hover:bg-[var(--color-surface-raised)] hover:border-[#cbd5e1] transition-all"
            title="Full View"
          >
            <Maximize2 size={14} className="text-[var(--color-text-muted)]" />
          </button>
        </div>
      </div>

      {/* Top Grid: Overview Statistics & Deal Metrics (Left 2 Cols) | Breakdown (Right 1 Col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Left Column (Span 2) */}
        <div className="space-y-6 lg:col-span-2 lg:space-y-8">
          {/* Overview Statistics Card */}
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
            <div className="mb-4 sm:mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[var(--color-text-main)] leading-[22px]">Overview Statistics</h2>
                <p className="text-md text-[var(--color-text-muted)]">Key performance indicators for current selection</p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] transition-all"
              >
                <ArrowUpRight size={15} />
              </button>
            </div>

            {loading && stats.length === 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-36 rounded-xl bg-[#f8fafc] border border-[var(--color-border)]" />
                ))}
              </div>
            ) : stats.length === 0 ? (
              <div className="flex h-36 items-center justify-center rounded-xl bg-[#f8fafc] border border-dashed border-[var(--color-border)] text-md font-medium text-[var(--color-text-muted)]">
                No statistics available for selected period
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
                {stats.slice(0, 3).map((stat, idx) => {
                  const deltaNum = Number(stat.delta) || 0;
                  const isPositive = deltaNum >= 0;
                  const deltaStr = `${isPositive ? "+" : ""}${stat.delta != null ? stat.delta : 0}${stat.deltaSuffix || "%"}`;
                  const iconBg = ICON_BG_COLORS[idx % ICON_BG_COLORS.length];
                  const icons = [
                    <DollarSign key="d" size={20} />,
                    <BarChart3 key="b" size={20} />,
                    <Box key="x" size={20} />,
                    <Briefcase key="bc" size={20} />,
                  ];

                  return (
                    <div
                      key={stat.name || idx}
                      className="flex flex-col items-center justify-center rounded-xl bg-[#f8fafc] p-4 sm:p-5 text-center border border-[var(--color-border)] hover:border-[#cbd5e1] transition-all"
                    >
                      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} text-white shadow-sm`}>
                        {icons[idx] || <ActivityIcon size={20} />}
                      </div>
                      <span className="text-md font-semibold text-[var(--color-text-muted)]">{stat.title}</span>
                      <span className="my-1.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{stat.value}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                          isPositive
                            ? "bg-[#dcfce7] text-[#15803d]"
                            : "bg-[#fee2e2] text-[#b91c1c]"
                        }`}
                      >
                        {deltaStr} vs prior period
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub Split Cards: Deal Value & Forecasted Revenue */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
            {/* Deal Value Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
              <div className="mb-4 sm:mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-[var(--color-text-main)] leading-[22px]">Deal Value</h3>
                  <p className="text-md text-[var(--color-text-muted)]">Average deal size & revenue</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] transition-all"
                >
                  <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1 rounded-xl bg-[#f8fafc] border border-[var(--color-border)]/80 p-3.5">
                    <div className="flex items-center gap-1.5 text-md font-medium text-[var(--color-text-muted)]">
                      <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
                      <span className="truncate">Avg Deal Size</span>
                    </div>
                    <p className="text-3xl font-bold tracking-tight text-[var(--color-text-main)] leading-tight">{fmtMoney(avgDealValue)}</p>
                  </div>

                  <div className="space-y-1 rounded-xl bg-[#f8fafc] border border-[var(--color-border)]/80 p-3.5">
                    <div className="flex items-center gap-1.5 text-md font-medium text-[var(--color-text-muted)]">
                      <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
                      <span className="truncate">Total Revenue</span>
                    </div>
                    <p className="text-3xl font-bold tracking-tight text-[var(--color-text-main)] leading-tight">{fmtMoney(totalSalesRevenue)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#f1f5f9] pt-3 text-sm font-semibold text-[var(--color-text-muted)]">
                  <span>Volume</span>
                  <span className="rounded-full bg-[#f8fafc] border border-[var(--color-border)] px-2.5 py-0.5 text-sm font-semibold text-[var(--color-text-main)]">
                    {totalDealsCount} deals in period
                  </span>
                </div>
              </div>
            </div>

            {/* Forecasted Revenue Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#06b6d4] text-white shadow-sm">
                    <FileText size={20} />
                  </div>
                  <div>
                    <span className="text-md font-semibold text-[var(--color-text-muted)]">Forecasted Revenue</span>
                    <p className="mt-0.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{fmtMoney(totalForecastValue)}</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-sm font-semibold text-[#15803d]">
                  {revenueForecast.length} periods
                </span>
              </div>

              {/* Dynamic Bar Indicator Graphic */}
              <div className="my-4 flex items-end justify-between gap-2 px-1 h-14">
                {revenueForecast.length > 0 ? (
                  revenueForecast.slice(0, 9).map((f, i) => {
                    const maxVal = Math.max(...revenueForecast.map((r) => r.value || 1), 1);
                    const hPercent = Math.max(Math.round(((f.value || 0) / maxVal) * 100), 20);
                    return (
                      <div
                        key={i}
                        style={{ height: `${hPercent}%` }}
                        className="w-3.5 sm:w-4 rounded-md bg-[#10b981] transition-all duration-300 hover:bg-[#059669]"
                        title={`${f.name}: ${fmtMoney(f.value)}`}
                      />
                    );
                  })
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-muted)] font-medium">
                    No forecast data available
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-md text-[var(--color-text-muted)] pt-3 border-t border-[#f1f5f9]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#10b981]">
                  <TrendingUp size={14} /> Pipeline
                </span>
                <span>Active Forecast</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Revenue Breakdown Card (Real Data from Deals By Stage) */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
          <div className="mb-4 sm:mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-text-main)] leading-[22px]">Stage Breakdown</h2>
              <p className="text-md text-[var(--color-text-muted)]">Deal distribution across stages</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] transition-all"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-5 pt-2 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-7 rounded-md bg-[#f8fafc]" />
              ))}
            </div>
          ) : sortedDealsByStage.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-xl bg-[#f8fafc] border border-dashed border-[var(--color-border)] text-md font-medium text-[var(--color-text-muted)]">
              No stage breakdown data available
            </div>
          ) : (
            <>
              {/* Dynamic Horizontal Progress Bars */}
              <div className="space-y-3.5 pt-1">
                {sortedDealsByStage.slice(0, 4).map((stage, i) => {
                  const pct = totalStageCount > 0 ? ((stage.value / totalStageCount) * 100).toFixed(1) : "0";
                  const barColor = BREAKDOWN_BAR_COLORS[i % BREAKDOWN_BAR_COLORS.length];
                  return (
                    <div key={stage.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-md font-semibold text-[var(--color-text-muted)]">
                        <span className="truncate max-w-[170px] text-[var(--color-text-main)] font-medium" title={stage.name}>{stage.name}</span>
                        <span className="shrink-0 text-sm font-semibold">{stage.value} deals</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic 2x2 Metric Grid */}
              <div className="mt-5 grid grid-cols-2 gap-3.5 border-t border-[var(--color-border)] pt-4">
                {sortedDealsByStage.slice(0, 4).map((stage, i) => {
                  const pct = totalStageCount > 0 ? ((stage.value / totalStageCount) * 100).toFixed(1) : "0";
                  const dotColor = BREAKDOWN_DOT_COLORS[i % BREAKDOWN_DOT_COLORS.length];
                  return (
                    <div key={stage.name} className="rounded-xl bg-[#f8fafc] border border-[var(--color-border)]/80 p-3 sm:p-3.5 min-w-0">
                      <div className="flex items-center gap-2 text-md font-semibold text-[var(--color-text-muted)] min-w-0">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                        <span className="truncate" title={stage.name}>{stage.name}</span>
                      </div>
                      <div className="mt-2 flex flex-col gap-0.5">
                        <span className="text-3xl font-bold tracking-tight text-[var(--color-text-main)] leading-none">{pct}%</span>
                        <span className="text-sm font-medium text-[var(--color-text-muted)]">{stage.value} deals</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Revenue Performance Trend & Pipeline Analytics */}
      <CrmDashboardAnalyticsCharts
        data={dashboardAnalytics}
        loading={loading}
        canViewRevenue={canViewRevenue}
      />

      <CrmReportSummaryCharts owner={owner} />
    </div>
  );
}

export default function OverviewReportPage() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <ReportsShell slug="overview" onRefresh={() => setRefreshToken((t) => t + 1)}>
      {(ctx) => <OverviewBody {...ctx} refreshToken={refreshToken} />}
    </ReportsShell>
  );
}


