"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Target,
  RefreshCw,
  Download,
  Maximize2,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CrmChartPanel } from "@/components/crm/ui";
import CrmReportSummaryCharts from "@/components/crm/reports/charts/CrmReportSummaryCharts";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  CRM_CHART_GRID,
  CRM_CHART_SERIES,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
import {
  compareSubtitle,
  type PeriodMeta,
} from "@/portals/crm/lib/reports/period-compare";
import ReportsShell, { type ReportsShellContext } from "../_components/ReportsShell";

interface DashboardStat {
  name: string;
  value: number | string;
  delta: number;
  deltaSuffix: string;
  title: string;
}

type FunnelRow = { label: string; val: number; w?: string };
type StatusRow = { name: string; value: number };

const ICON_BG_COLORS = [
  "bg-[#2563eb]", // Blue
  "bg-[#10b981]", // Green
  "bg-[#8b5cf6]", // Purple
];

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function OverviewBody({
  period,
  compare,
  compareMode,
  owner,
  filters,
  refreshToken,
}: ReportsShellContext & { refreshToken: number }) {
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [periodMeta, setPeriodMeta] = useState<PeriodMeta | null>(null);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [leadsByStatus, setLeadsByStatus] = useState<StatusRow[]>([]);
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

      setStats(Array.isArray(dashboard?.stats) ? dashboard.stats : []);
      setPeriodMeta(dashboard?.periodMeta ?? null);
      setFunnel(Array.isArray(dashboard?.funnel) ? dashboard.funnel : []);
      setLeadsByStatus(
        Array.isArray(dashboard?.charts?.leadsByStatus) ? dashboard.charts.leadsByStatus : [],
      );
    } catch (err) {
      console.error("Fetch overview report error:", err);
      setStats([]);
      setPeriodMeta(null);
      setFunnel([]);
      setLeadsByStatus([]);
    } finally {
      setLoading(false);
    }
  }, [period, compare, owner, filtersKey, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const deltaSub = compareSubtitle(compareMode, periodMeta);
  const totalLeads = funnel.find((f) => /lead/i.test(f.label))?.val ?? 0;
  const qualified = funnel.find((f) => /qualified/i.test(f.label))?.val ?? 0;
  const qualifiedRate = totalLeads > 0 ? Math.round((qualified / totalLeads) * 1000) / 10 : 0;
  const totalByStatus = useMemo(
    () => leadsByStatus.reduce((s, r) => s + (Number(r.value) || 0), 0),
    [leadsByStatus],
  );
  const sortedByStatus = useMemo(
    () => [...leadsByStatus].sort((a, b) => b.value - a.value).slice(0, 6),
    [leadsByStatus],
  );

  return (
    <div className="space-y-6 sm:space-y-8 outline-none font-sans pb-6">
      {/* Top Header Bar with Title & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-5">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">Overview</h1>
          <p className="text-md font-medium text-[var(--color-text-muted)] leading-[18px]">Lead velocity, conversion, and status mix.</p>
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

      {/* Top Grid: Overview Statistics & Conversion (Left 2 Cols) | Status breakdown (Right 1 Col) */}
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

                  return (
                    <div
                      key={stat.name || idx}
                      className="flex flex-col items-center justify-center rounded-xl bg-[#f8fafc] p-4 sm:p-5 text-center border border-[var(--color-border)] hover:border-[#cbd5e1] transition-all"
                    >
                      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} text-white shadow-sm`}>
                        <Users size={20} />
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

          {/* Lead funnel */}
          <CrmChartPanel title="Lead funnel" subtitle="Created → qualified in period" bodyClassName="pt-2">
            <div className="h-[240px] w-full">
              {funnel.every((r) => !r.val) ? (
                <ChartEmpty message="No leads in this period" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnel} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                    <XAxis dataKey="label" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                    <Tooltip {...CRM_CHART_TOOLTIP} />
                    <Bar dataKey="val" name="Leads" radius={[4, 4, 0, 0]}>
                      {funnel.map((_, i) => (
                        <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CrmChartPanel>

          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8b5cf6] text-white shadow-sm">
                  <Target size={20} />
                </div>
                <div>
                  <span className="text-md font-semibold text-[var(--color-text-muted)]">Qualified rate</span>
                  <p className="mt-0.5 text-4xl font-bold tracking-tight text-[var(--color-text-main)] leading-[26px]">{qualifiedRate}%</p>
                </div>
              </div>
              <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-sm font-semibold text-[#15803d]">
                {qualified} of {totalLeads}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Leads by status */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
          <div className="mb-4 sm:mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-text-main)] leading-[22px]">Status Breakdown</h2>
              <p className="text-md text-[var(--color-text-muted)]">Lead distribution across statuses</p>
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
          ) : sortedByStatus.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-xl bg-[#f8fafc] border border-dashed border-[var(--color-border)] text-md font-medium text-[var(--color-text-muted)]">
              No status breakdown data available
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sortedByStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {sortedByStatus.map((_, i) => (
                      <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
              <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">{totalByStatus} leads total</p>
            </div>
          )}
        </div>
      </div>

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
