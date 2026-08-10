"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { CrmChartPanel, CrmSegmentedControl } from "@/components/crm/ui";
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
} from "@/lib/crm/shared/chart-theme";

export type DashboardAnalyticsPayload = {
  funnel?: Array<{ label: string; val: number }>;
  summary?: { efficiency?: string };
  outcomes?: {
    won?: number;
    lost?: number;
    wonValue?: number;
    lostValue?: number;
    wonDelta?: number;
    lostDelta?: number;
    vsLastMonth?: number;
  };
  revenuePeriods?: {
    mtd?: number;
    ytd?: number;
    mtdDelta?: number;
    ytdDelta?: number;
    weightedPipeline?: number;
    grossPipeline?: number;
    avgDealSize?: number;
    avgDealSizeDelta?: number;
  };
  charts?: {
    salesTrend?: Array<{ name: string; revenue: number; leads: number }>;
    revenueForecast?: Array<{ name: string; value: number }>;
    dealsByStage?: Array<{ name: string; value: number; amount?: number }>;
    activityTrends?: Array<{ _id?: string; type?: string; count: number }>;
    leadsByStatus?: Array<{ name: string; value: number }>;
  } | null;
};

type Props = {
  data: DashboardAnalyticsPayload | null;
  loading?: boolean;
  canViewRevenue?: boolean;
};

type TrendMode = "revenue" | "deals" | "both";

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Dreams-style dashboard analytics from `/crm/dashboard` charts payload:
 * Revenue analytics area · Deals donut · Lead status · Funnel · Activity mix · Forecast sparkline
 */
export default function CrmDashboardAnalyticsCharts({
  data,
  loading,
  canViewRevenue = true,
}: Props) {
  const [trendMode, setTrendMode] = useState<TrendMode>(canViewRevenue ? "both" : "deals");
  const revenueGradId = `dashRev-${useId().replace(/:/g, "")}`;
  const dealsGradId = `dashDeals-${useId().replace(/:/g, "")}`;

  const salesTrend = data?.charts?.salesTrend ?? [];
  const dealsByStage = useMemo(
    () => [...(data?.charts?.dealsByStage ?? [])].sort((a, b) => b.value - a.value).slice(0, 8),
    [data?.charts?.dealsByStage],
  );
  const leadsByStatus = useMemo(
    () => [...(data?.charts?.leadsByStatus ?? [])].sort((a, b) => b.value - a.value).slice(0, 8),
    [data?.charts?.leadsByStatus],
  );
  const funnel = data?.funnel ?? [];
  const forecast = data?.charts?.revenueForecast ?? [];
  const activityMix = useMemo(
    () =>
      (data?.charts?.activityTrends ?? [])
        .map((r) => ({
          name: String(r._id || r.type || "Other"),
          value: Number(r.count) || 0,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [data?.charts?.activityTrends],
  );

  const trendTotalRevenue = salesTrend.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const trendTotalDeals = salesTrend.reduce((s, r) => s + (Number(r.leads) || 0), 0);

  if (loading && !data) {
    return (
      <div className="grid animate-pulse gap-4 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`h-[300px] rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-surface-dim ${i === 1 ? "lg:col-span-2" : ""}`}
          />
        ))}
      </div>
    );
  }

  if (!data?.charts) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="h-4 w-1 shrink-0 rounded-sm bg-[var(--warning,#ff9f43)]" aria-hidden />
        <h2 className="text-sm font-semibold text-[var(--text-main)]">Pipeline analytics</h2>
        {data.summary?.efficiency ? (
          <span className="rounded-[6px] bg-[var(--primary-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)]">
            Efficiency {data.summary.efficiency}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Dreams CRMS: Revenue Performance Trend — area chart with multi-curve gradient */}
        <CrmChartPanel
          className="lg:col-span-2 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
          title="Revenue Performance Trend"
          subtitle="Comparing actual revenue vs. forecast and prior year"
          actions={
            <div className="flex items-center gap-2">
              {canViewRevenue ? (
                <CrmSegmentedControl
                  value={trendMode}
                  onChange={setTrendMode}
                  options={[
                    { value: "both", label: "Both" },
                    { value: "revenue", label: "Revenue" },
                    { value: "deals", label: "Deals" },
                  ]}
                />
              ) : null}
              <select className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#1f2020] focus:outline-none">
                <option>2026</option>
                <option>2025</option>
              </select>
            </div>
          }
          bodyClassName="pt-2"
        >
          <div className="h-[220px] sm:h-[280px] w-full">
            {salesTrend.length === 0 ? (
              <ChartEmpty message="No deal creations in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={revenueGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={dealsGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#707070", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "#707070", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      canViewRevenue && trendMode !== "deals" ? fmtMoney(Number(v)) : String(v)
                    }
                    width={56}
                  />
                  {canViewRevenue && trendMode === "both" ? (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "#707070", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={36}
                    />
                  ) : null}
                  <Tooltip
                    {...CRM_CHART_TOOLTIP}
                    formatter={(value, name) => {
                      const n = Number(value) || 0;
                      if (name === "Actual Revenue") return [fmtMoney(n), "Actual Revenue"];
                      return [n, "Deals"];
                    }}
                  />
                  <Legend {...CRM_CHART_LEGEND} />
                  {canViewRevenue && (trendMode === "revenue" || trendMode === "both") ? (
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Actual Revenue"
                      stroke="#2563eb"
                      fill={`url(#${revenueGradId})`}
                      strokeWidth={2.5}
                    />
                  ) : null}
                  {trendMode === "deals" || trendMode === "both" || !canViewRevenue ? (
                    <Area
                      yAxisId={canViewRevenue && trendMode === "both" ? "right" : "left"}
                      type="monotone"
                      dataKey="leads"
                      name="Forecasted"
                      stroke="#10b981"
                      fill={`url(#${dealsGradId})`}
                      strokeWidth={2.5}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Dreams CRMS Bottom Metric Indicators Bar (Real Dynamic Data) */}
          <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-start sm:justify-center gap-3 sm:gap-6 border-t border-[#e2e8f0] pt-4 text-[12.8px]">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-[#ef4444]" />
              <span className="text-[#707070]">Avg. Monthly Revenue</span>
              <span className="font-bold text-[#1f2020]">
                {salesTrend.length > 0 ? fmtMoney(trendTotalRevenue / salesTrend.length) : "₹0"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-[#2563eb]" />
              <span className="text-[#707070]">Total Revenue</span>
              <span className="font-bold text-[#1f2020]">{fmtMoney(trendTotalRevenue)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-[#10b981]" />
              <span className="text-[#707070]">Total Deals</span>
              <span className="font-bold text-[#10b981]">{trendTotalDeals}</span>
            </div>
          </div>
        </CrmChartPanel>

        {/* Dreams: Deals overview donut */}
        <CrmChartPanel title="Deals overview" subtitle="Open + closed mix by stage" bodyClassName="pt-2">
          <div className="h-[260px] w-full">
            {dealsByStage.length === 0 ? (
              <ChartEmpty message="No deals to chart" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dealsByStage}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {dealsByStage.map((_, i) => (
                      <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend {...CRM_CHART_LEGEND} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        {/* Funnel bars */}
        <CrmChartPanel
          title="Sales funnel"
          subtitle="Leads → qualified → negotiation → won"
          className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {funnel.length === 0 || funnel.every((f) => !f.val) ? (
              <ChartEmpty message="No funnel data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#707070", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={88}
                    tick={{ fill: "#1f2020", fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Bar dataKey="val" name="Count" radius={[0, 6, 6, 0]}>
                    {funnel.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          ["#2563eb", "#06b6d4", "#ff9f43", "#10b981", "#8b5cf6"][i % 5]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        {/* Lead status */}
        <CrmChartPanel
          title="Leads by status"
          subtitle="Current lead status mix"
          className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {leadsByStatus.length === 0 ? (
              <ChartEmpty message="No lead status data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsByStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {leadsByStatus.map((_, i) => (
                      <Cell key={i} fill={CRM_CHART_SERIES[i % CRM_CHART_SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Legend {...CRM_CHART_LEGEND} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        {/* Activity mix */}
        <CrmChartPanel
          title="Activity mix"
          subtitle="Logged touches by type"
          className="shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] border border-[#e2e8f0]"
          bodyClassName="pt-2"
        >
          <div className="h-[240px] w-full">
            {activityMix.length === 0 ? (
              <ChartEmpty message="No activity logged" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityMix} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#707070", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#707070", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                    {activityMix.map((_, i) => (
                      <Cell key={i} fill={["#2563eb", "#06b6d4", "#ff9f43", "#10b981", "#8b5cf6", "#ef4444"][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>
      </div>

      {canViewRevenue && forecast.length > 0 ? (
        <CrmChartPanel
          title="Weighted forecast"
          subtitle="Open pipeline × stage probability by expected close month"
          bodyClassName="pt-2"
        >
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`${revenueGradId}-fc`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={CRM_CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtMoney(Number(v))}
                  width={56}
                />
                <Tooltip
                  {...CRM_CHART_TOOLTIP}
                  formatter={(value) => [fmtMoney(Number(value) || 0), "Weighted"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Weighted"
                  stroke={CRM_CHART_SUCCESS}
                  fill={`url(#${revenueGradId}-fc)`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CrmChartPanel>
      ) : null}
    </div>
  );
}
