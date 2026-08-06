"use client";

import { useEffect, useId, useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import { CrmChartPanel, CrmKpiCard, CrmSectionCard } from "@/components/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_TICK,
  CRM_CHART_TOOLTIP,
} from "@/lib/crm/shared/chart-theme";
import type { DashboardAnalyticsPayload } from "@/components/crm/reports/charts/CrmDashboardAnalyticsCharts";
import CrmRevenueForecastPanel from "@/components/crm/reports/panels/CrmRevenueForecastPanel";
import {
  DashSkeleton,
  EmptyDash,
  fmtMoneyIfAllowed,
  ViewAllLink,
} from "./dashboardShared";

type DashboardStat = {
  name: string;
  title: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
};

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  canViewRevenue: boolean;
  pipelineValue: number;
  openDeals: number;
};

function authHeaders(): HeadersInit {
  const token = getCrmAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function RevenueSummaryDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
  canViewRevenue,
  pipelineValue,
  openDeals,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const revGradId = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const days = windowToDashboardPeriod(windowFilter);
        const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
        const qs = new URLSearchParams({ days, owner: ownerParam });
        if (compare) qs.set("compare", compare);
        const dashRes = await fetch(`${CRM_API_URL}/crm/dashboard?${qs}`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (dashRes.ok) {
          const dashboard = await dashRes.json();
          if (!cancelled) {
            setStats(Array.isArray(dashboard?.stats) ? dashboard.stats : []);
            setAnalytics({
              funnel: Array.isArray(dashboard?.funnel) ? dashboard.funnel : [],
              summary: dashboard?.summary,
              charts: dashboard?.charts ?? null,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setStats([]);
          setAnalytics(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, ownerLabel, windowFilter, compare]);

  const grossStat = stats.find((s) => s.name === "total_revenue");
  const salesTrend = analytics?.charts?.salesTrend ?? [];
  const forecastSpark = analytics?.charts?.revenueForecast ?? [];
  const avgDealSize = openDeals > 0 && canViewRevenue ? pipelineValue / openDeals : 0;

  const revenueByMonth = useMemo(
    () =>
      salesTrend.map((r) => ({
        name: r.name,
        revenue: Number(r.revenue) || 0,
      })),
    [salesTrend],
  );

  if (!canViewRevenue) {
    return (
      <EmptyDash message="Revenue summary requires permission to view CRM revenue." />
    );
  }

  if (loading && !analytics) {
    return <DashSkeleton rows={3} />;
  }

  return (
    <div className="space-y-4">
      <CrmSectionCard
        title="Revenue snapshot"
        actions={<ViewAllLink href="/crm/reports/forecast" label="Full forecast" />}
      >
        <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 py-5 sm:px-6">
          <p className="text-sm font-medium text-[var(--text-muted)]">Open pipeline value</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-[var(--text-main)] sm:text-4xl">
            {fmtMoneyIfAllowed(pipelineValue, true)}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
            <span>
              <span className="font-semibold text-[var(--text-main)]">{openDeals}</span> open deals
            </span>
            {grossStat?.delta != null && (
              <span className="text-[var(--success)]">
                {Number(grossStat.delta) >= 0 ? "+" : ""}
                {grossStat.delta}
                {grossStat.deltaSuffix || "%"} vs prior
              </span>
            )}
          </div>
        </div>
      </CrmSectionCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CrmKpiCard
          label="Gross / reported"
          value={grossStat?.value ?? "—"}
          icon={<CrmIcon.TrendingUp size={18} />}
          trend={
            Number(grossStat?.delta) > 0 ? "up" : Number(grossStat?.delta) < 0 ? "down" : "neutral"
          }
          trendValue={
            grossStat?.delta != null
              ? `${Number(grossStat.delta) >= 0 ? "+" : ""}${grossStat.delta}${grossStat.deltaSuffix || "%"}`
              : undefined
          }
          sub="vs prior period"
        />
        <CrmKpiCard
          label="Avg deal size"
          value={fmtMoneyIfAllowed(avgDealSize, true)}
          icon={<CrmIcon.Handshake size={18} />}
          sub="Open pipeline average"
        />
        <CrmKpiCard
          label="Open deals"
          value={openDeals}
          icon={<CrmIcon.Handshake size={18} />}
          sub="Currently in pipeline"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CrmChartPanel
          title="Revenue trend"
          subtitle="Sales revenue by period from dashboard analytics"
          icon={<CrmIcon.TrendingUp size={16} />}
          bodyClassName="pt-2"
        >
          <div className="h-[260px] w-full">
            {revenueByMonth.every((r) => r.revenue === 0) ? (
              <EmptyDash message="No revenue trend in this window." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`revSum-${revGradId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={CRM_CHART_SUCCESS}
                    fill={`url(#revSum-${revGradId})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>

        <CrmChartPanel
          title="Forecast sparkline"
          subtitle="Weighted outlook from dashboard charts"
          icon={<CrmIcon.ChartPie size={16} />}
          bodyClassName="pt-2"
        >
          <div className="h-[260px] w-full">
            {forecastSpark.length === 0 ? (
              <EmptyDash message="No forecast sparkline yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastSpark} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                  <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CRM_CHART_TOOLTIP} />
                  <Bar dataKey="value" name="Forecast" fill={CRM_CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CrmChartPanel>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Weighted forecast</h3>
          <NextLink
            href="/crm/reports/forecast"
            className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
          >
            Open in Reports
          </NextLink>
        </div>
        <CrmRevenueForecastPanel
          owner={ownerId === "All" ? "All" : ownerLabel || "All"}
          months={6}
        />
      </div>
    </div>
  );
}
