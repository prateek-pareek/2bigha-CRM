"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import { CrmKpiCard } from "@/components/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { CRM_BTN_ICON, CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import type { DashboardAnalyticsPayload } from "@/components/crm/reports/charts/CrmDashboardAnalyticsCharts";
import {
  DashSkeleton,
  EmptyDash,
  fmtMoneyIfAllowed,
  type DashRecentDeal,
} from "./dashboardShared";
import { PeriodSelect } from "./SalesOverviewCharts";
import {
  GrowthCategoryBarChart,
  GrowthComparisonLineChart,
  GrowthKpiCard,
  GrowthOverviewTable,
  GrowthTrendAreaChart,
  RegionGrowthDonut,
  RetentionCard,
  RevenueProgressChart,
  TargetVsAchievementChart,
  type GrowthOverviewRow,
} from "./GrowthDashboardCharts";

type DashboardStat = {
  name: string;
  title: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
};

type LeadsDashPayload = {
  kpis?: {
    newLeads?: number;
    createdInPeriod?: number;
    convertedLeads?: number;
    conversionRate?: number;
    deltas?: {
      created?: number;
      converted?: number;
      conversionRate?: number;
    };
  };
  leadsByRegion?: Array<{ name: string; value: number }>;
  leadsBySource?: Array<{ name: string; value: number }>;
  leadsByOwner?: Array<{ name?: string; owner?: string; value?: number; count?: number }>;
  leadsCreatedByDay?: Array<{ date: string; count: number }>;
  monthlyPerformance?: Array<{
    month?: string;
    name?: string;
    created?: number;
    converted?: number;
    conversionRate?: number;
  }>;
};

type BoardReports = {
  dealsByOwner: Array<{ owner: string; count: number }>;
  channelPerformance?: Array<{
    channel: string;
    leads: number;
    converted: number;
    conversionRate: number;
    replies: number;
    deals: number;
    replyRate: number;
  }>;
  followUpReplyAnalytics?: {
    repliesByAttempt: Array<{ attempt: number; label: string; replies: number }>;
    avgSendsAtReply: number;
    avgFollowUpsAtReply: number;
    repliedConversations: number;
  };
};

type TrendRange = "window" | "90" | "365";
type RevenueMode = "daily" | "monthly";

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  canViewRevenue: boolean;
};

function authHeaders(): HeadersInit {
  const token = getCrmAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatWindowLabel(windowFilter: string): string {
  if (windowFilter.includes(",")) {
    const [a, b] = windowFilter.split(",");
    return `${formatShortDate(a)} - ${formatShortDate(b)}`;
  }
  switch (windowFilter) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "this_week":
      return "This week";
    case "this_month":
      return "This month";
    case "last_30_days":
      return "Last 30 days";
    default:
      return "Selected window";
  }
}

function formatShortDate(ymd: string): string {
  const d = new Date(ymd.trim());
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function parsePercent(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/%/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseMoneyValue(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isWon(stage?: string, status?: string): boolean {
  const s = `${stage || ""} ${status || ""}`.toLowerCase();
  return /won|closed\s*won/.test(s);
}

function isLost(stage?: string, status?: string): boolean {
  const s = `${stage || ""} ${status || ""}`.toLowerCase();
  return /lost|rejected|withdrawn|closed\s*lost/.test(s);
}

function aggregateTrendByMonth(
  salesTrend: Array<{ name: string; revenue: number; leads: number }>,
): Array<{ name: string; revenue: number; leads: number }> {
  const buckets = new Map<string, { revenue: number; leads: number }>();
  for (const row of salesTrend) {
    const key = String(row.name).slice(0, 7) || row.name;
    const prev = buckets.get(key) || { revenue: 0, leads: 0 };
    prev.revenue += Number(row.revenue) || 0;
    prev.leads += Number(row.leads) || 0;
    buckets.set(key, prev);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => ({ name, revenue: v.revenue, leads: v.leads }));
}

function monthlyGrowthRate(
  series: Array<{ revenue: number; leads: number }>,
  useRevenue: boolean,
): number {
  if (series.length < 2) return 0;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const curr = useRevenue ? last.revenue : last.leads;
  const before = useRevenue ? prev.revenue : prev.leads;
  if (before <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - before) / before) * 100);
}

function buildOverviewRows(
  deals: DashRecentDeal[],
  salesTrend: Array<{ name: string; revenue: number; leads: number }>,
): GrowthOverviewRow[] {
  // Prefer per-deal customer rows when we have named organizations
  const named = deals.filter((d) => {
    const org =
      typeof d.organization === "string"
        ? d.organization
        : d.organization?.name || d.company || "";
    return Boolean(org?.trim());
  });

  if (named.length >= 3) {
    const byCustomer = new Map<
      string,
      {
        revenue: number;
        won: number;
        lost: number;
        total: number;
        latest: number;
        periodLabel: string;
      }
    >();

    for (const d of named) {
      const customer = (
        typeof d.organization === "string"
          ? d.organization
          : d.organization?.name || d.company || "Unknown"
      ).trim();
      const created = d.createdAt ? new Date(d.createdAt).getTime() : 0;
      const prev = byCustomer.get(customer) || {
        revenue: 0,
        won: 0,
        lost: 0,
        total: 0,
        latest: 0,
        periodLabel: "",
      };
      prev.revenue += Number(d.dealValueINR ?? d.dealValue ?? 0) || 0;
      prev.total += 1;
      if (isWon(d.stage, d.status)) prev.won += 1;
      if (isLost(d.stage, d.status)) prev.lost += 1;
      if (created >= prev.latest) {
        prev.latest = created;
        prev.periodLabel = Number.isFinite(created)
          ? new Date(created).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—";
      }
      byCustomer.set(customer, prev);
    }

    const entries = Array.from(byCustomer.entries()).sort(
      (a, b) => b[1].latest - a[1].latest,
    );

    return entries.map(([customer, v], idx) => {
      const closed = v.won + v.lost;
      const conversionRate = v.total > 0 ? (v.won / v.total) * 100 : 0;
      const retentionRate = closed > 0 ? (v.won / closed) * 100 : conversionRate;
      const prev = entries[idx + 1]?.[1];
      const growth =
        prev && prev.revenue > 0
          ? ((v.revenue - prev.revenue) / prev.revenue) * 100
          : prev && prev.total > 0
            ? ((v.total - prev.total) / prev.total) * 100
            : conversionRate > 0
              ? conversionRate
              : 0;
      const status: GrowthOverviewRow["status"] =
        growth > 1 ? "Up" : growth < -1 ? "Down" : "Flat";
      return {
        id: `cust-${customer}-${idx}`,
        period: v.periodLabel || "—",
        periodSort: v.latest || idx,
        customer,
        conversionRate,
        revenue: v.revenue,
        retentionRate,
        growth,
        status,
      };
    });
  }

  // Fallback: monthly buckets from sales trend
  const monthly = aggregateTrendByMonth(salesTrend);
  return monthly.map((row, idx) => {
    const prev = monthly[idx - 1];
    const growth =
      prev && prev.revenue > 0
        ? ((row.revenue - prev.revenue) / prev.revenue) * 100
        : prev && prev.leads > 0
          ? ((row.leads - prev.leads) / prev.leads) * 100
          : 0;
    const d = new Date(`${row.name}-01`);
    const period = Number.isNaN(d.getTime())
      ? row.name
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const status: GrowthOverviewRow["status"] =
      growth > 1 ? "Up" : growth < -1 ? "Down" : "Flat";
    return {
      id: `month-${row.name}`,
      period,
      periodSort: Number.isNaN(d.getTime()) ? idx : d.getTime(),
      customer: `${row.leads} deal${row.leads === 1 ? "" : "s"}`,
      conversionRate: 0,
      revenue: row.revenue,
      retentionRate: 0,
      growth,
      status,
    };
  });
}

export default function GrowthDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
  canViewRevenue,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [leadsDash, setLeadsDash] = useState<LeadsDashPayload | null>(null);
  const [board, setBoard] = useState<BoardReports | null>(null);
  const [deals, setDeals] = useState<DashRecentDeal[]>([]);
  const [trendSeries, setTrendSeries] = useState<
    Array<{ name: string; revenue: number; leads: number }>
  >([]);
  const [trendRange, setTrendRange] = useState<TrendRange>("window");
  const [revenueMode, setRevenueMode] = useState<RevenueMode>("monthly");
  const [regionYear, setRegionYear] = useState(String(new Date().getFullYear()));
  const [regionRowsLive, setRegionRowsLive] = useState<
    Array<{ name: string; value: number }>
  >([]);
  const [regionIsTerritory, setRegionIsTerritory] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const period = windowToDashboardPeriod(windowFilter);
      const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
      const dashQs = new URLSearchParams({ days: period, owner: ownerParam });
      const leadsQs = new URLSearchParams({ days: period, owner: ownerParam });
      const boardQs = new URLSearchParams({ days: period, owner: ownerParam });
      if (compare) {
        dashQs.set("compare", compare);
        leadsQs.set("compare", compare);
        boardQs.set("compare", compare);
      }
      const year = Number(regionYear) || new Date().getFullYear();
      const regionPeriod = `${year}-01-01,${year}-12-31`;
      const regionQs = new URLSearchParams({
        days: regionPeriod,
        owner: ownerParam,
      });
      if (compare) regionQs.set("compare", compare);

      const trendDays =
        trendRange === "window" ? period : trendRange === "90" ? "90" : "365";
      const trendQs = new URLSearchParams({
        days: trendDays,
        owner: ownerParam,
      });
      if (compare) trendQs.set("compare", compare);

      const dealsParams = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      if (ownerId && ownerId !== "All") {
        dealsParams.set(
          "filters",
          JSON.stringify([
            {
              property: "dealOwner",
              operator: "contains",
              value: ownerLabel || ownerId,
            },
          ]),
        );
      }

      const [dashRes, leadsRes, boardRes, dealsRes, trendRes, regionRes] =
        await Promise.all([
        fetch(`${CRM_API_URL}/crm/dashboard?${dashQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${leadsQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/reports/board?${boardQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/deals?${dealsParams}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        trendRange === "window"
          ? Promise.resolve(null)
          : fetch(`${CRM_API_URL}/crm/dashboard?${trendQs}`, {
              headers: authHeaders(),
              cache: "no-store",
            }),
        fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${regionQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
      ]);

      if (dashRes.ok) {
        const dashboard = await dashRes.json();
        setStats(Array.isArray(dashboard?.stats) ? dashboard.stats : []);
        setAnalytics({
          funnel: Array.isArray(dashboard?.funnel) ? dashboard.funnel : [],
          summary: dashboard?.summary,
          outcomes: dashboard?.outcomes,
          revenuePeriods: dashboard?.revenuePeriods,
          charts: dashboard?.charts ?? null,
        });
        if (trendRange === "window") {
          setTrendSeries(
            Array.isArray(dashboard?.charts?.salesTrend)
              ? dashboard.charts.salesTrend
              : [],
          );
        }
      } else {
        setAnalytics(null);
        setStats([]);
      }

      if (trendRes && trendRes.ok) {
        const growthDash = await trendRes.json();
        setTrendSeries(
          Array.isArray(growthDash?.charts?.salesTrend)
            ? growthDash.charts.salesTrend
            : [],
        );
      }

      if (leadsRes.ok) {
        setLeadsDash(await leadsRes.json());
      } else {
        setLeadsDash(null);
      }

      if (regionRes.ok) {
        const regionPayload = await regionRes.json();
        const regions = Array.isArray(regionPayload?.leadsByRegion)
          ? regionPayload.leadsByRegion
          : [];
        const sources = Array.isArray(regionPayload?.leadsBySource)
          ? regionPayload.leadsBySource
          : [];
        const usable = regions.filter(
          (r: { name?: string; value?: number }) =>
            r.name && !/^unspecified$/i.test(r.name) && Number(r.value) > 0,
        );
        if (usable.length) {
          setRegionRowsLive(usable);
          setRegionIsTerritory(true);
        } else {
          setRegionRowsLive(
            sources
              .filter((r: { value?: number }) => Number(r.value) > 0)
              .slice(0, 8),
          );
          setRegionIsTerritory(false);
        }
      } else {
        setRegionRowsLive([]);
        setRegionIsTerritory(false);
      }

      if (boardRes.ok) {
        const payload = await boardRes.json();
        setBoard({
          dealsByOwner: Array.isArray(payload?.dealsByOwner)
            ? payload.dealsByOwner
            : [],
          channelPerformance: Array.isArray(payload?.channelPerformance)
            ? payload.channelPerformance
            : [],
          followUpReplyAnalytics: payload?.followUpReplyAnalytics ?? undefined,
        });
      } else {
        setBoard(null);
      }

      if (dealsRes.ok) {
        const payload = await dealsRes.json();
        const list: DashRecentDeal[] = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        setDeals(list);
      } else {
        setDeals([]);
      }

      if (!dashRes.ok && !leadsRes.ok) {
        setError("Unable to load growth analytics. Check your connection and try again.");
      }
    } catch {
      setStats([]);
      setAnalytics(null);
      setLeadsDash(null);
      setBoard(null);
      setDeals([]);
      setTrendSeries([]);
      setRegionRowsLive([]);
      setRegionIsTerritory(false);
      setError("Unable to load growth analytics. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerLabel, windowFilter, compare, trendRange, regionYear, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const outcomes = analytics?.outcomes;
  const revenuePeriods = analytics?.revenuePeriods;
  const salesTrend = analytics?.charts?.salesTrend ?? [];
  const displayTrend = trendSeries.length ? trendSeries : salesTrend;

  const monthlySeries = useMemo(
    () => aggregateTrendByMonth(displayTrend),
    [displayTrend],
  );

  const revenueBars = useMemo(() => {
    const source =
      revenueMode === "monthly" ? monthlySeries.slice(-6) : displayTrend;
    return source.map((r) => ({
      name: r.name,
      revenue: canViewRevenue ? Number(r.revenue) || 0 : Number(r.leads) || 0,
    }));
  }, [revenueMode, monthlySeries, displayTrend, canViewRevenue]);

  const leadsStat = stats.find((s) => s.name === "total_leads");
  const revenueStat = stats.find((s) => s.name === "total_revenue");
  const winStat = stats.find((s) => s.name === "win_ratio");
  const cycleStat = stats.find((s) => s.name === "sales_cycle");

  const won = Number(outcomes?.won) || 0;
  const lost = Number(outcomes?.lost) || 0;
  const closed = won + lost;
  const retainedPct = closed > 0 ? (won / closed) * 100 : 0;
  const churnedPct = closed > 0 ? (lost / closed) * 100 : 0;

  const funnelLeads =
    analytics?.funnel?.find((f) => /lead/i.test(f.label))?.val ??
    (Number(leadsStat?.value) || 0);
  const conversionPct = parsePercent(
    leadsDash?.kpis?.conversionRate ??
      analytics?.summary?.efficiency ??
      (funnelLeads > 0 ? ((won / funnelLeads) * 100).toFixed(1) : "0"),
  );

  const newCustomers =
    Number(leadsDash?.kpis?.convertedLeads) ||
    won ||
    Number(leadsDash?.kpis?.createdInPeriod) ||
    Number(leadsStat?.value) ||
    0;

  const newCustomersDelta =
    leadsDash?.kpis?.deltas?.converted ??
    leadsDash?.kpis?.deltas?.created ??
    (leadsStat?.delta != null ? Number(leadsStat.delta) : null);

  const revenueGrowthValue = canViewRevenue
    ? Number(revenuePeriods?.mtd) ||
      Number(revenuePeriods?.grossPipeline) ||
      parseMoneyValue(revenueStat?.value)
    : Number(leadsStat?.value) || 0;

  const revenueGrowthDelta =
    revenuePeriods?.mtdDelta != null
      ? Number(revenuePeriods.mtdDelta)
      : revenueStat?.delta != null
        ? Number(revenueStat.delta)
        : null;

  const moGrowth = monthlyGrowthRate(monthlySeries, canViewRevenue);

  const qoGrowth = useMemo(() => {
    if (monthlySeries.length < 4) return moGrowth;
    const last3 = monthlySeries.slice(-3);
    const prev3 = monthlySeries.slice(-6, -3);
    if (!prev3.length) return moGrowth;
    const sum = (rows: typeof monthlySeries) =>
      rows.reduce(
        (s, r) => s + (canViewRevenue ? r.revenue : r.leads),
        0,
      );
    const curr = sum(last3);
    const prev = sum(prev3);
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }, [monthlySeries, canViewRevenue, moGrowth]);

  const yoGrowth = useMemo(() => {
    if (monthlySeries.length < 12) return null;
    const last = monthlySeries[monthlySeries.length - 1];
    const yearAgo = monthlySeries[monthlySeries.length - 13];
    if (!yearAgo) return null;
    const curr = canViewRevenue ? last.revenue : last.leads;
    const prev = canViewRevenue ? yearAgo.revenue : yearAgo.leads;
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }, [monthlySeries, canViewRevenue]);

  const regionRows = useMemo(() => {
    if (regionRowsLive.length) return regionRowsLive;
    const regions = leadsDash?.leadsByRegion ?? [];
    const usable = regions.filter(
      (r) => r.name && !/^unspecified$/i.test(r.name) && Number(r.value) > 0,
    );
    if (usable.length) return usable;
    const sources = leadsDash?.leadsBySource ?? [];
    return sources.filter((r) => Number(r.value) > 0).slice(0, 8);
  }, [regionRowsLive, leadsDash]);

  const channelPerformanceRows = useMemo(
    () =>
      (board?.channelPerformance ?? [])
        .filter((r) => r && r.channel)
        .map((r) => ({ name: r.channel, value: Number(r.leads) || 0 })),
    [board],
  );

  const wonLostValueRows = useMemo(
    () => [
      { name: "Won", value: Number(outcomes?.wonValue) || 0 },
      { name: "Lost", value: Number(outcomes?.lostValue) || 0 },
    ],
    [outcomes],
  );

  const leadAcquisition = useMemo(
    () =>
      (leadsDash?.leadsCreatedByDay ?? []).map((r) => ({
        name: r.date,
        value: Number(r.count) || 0,
        revenue: 0,
        leads: Number(r.count) || 0,
      })),
    [leadsDash],
  );

  const comparisonSeries = useMemo(
    () =>
      displayTrend.map((r) => ({
        name: r.name,
        leads: Number(r.leads) || 0,
        revenue: Number(r.revenue) || 0,
      })),
    [displayTrend],
  );

  const followUpReplyRows = useMemo(
    () =>
      (board?.followUpReplyAnalytics?.repliesByAttempt ?? []).map((r) => ({
        name: r.label,
        value: Number(r.replies) || 0,
      })),
    [board],
  );

  const forecast = analytics?.charts?.revenueForecast ?? [];
  const achievedRevenue = canViewRevenue
    ? Number(revenuePeriods?.mtd) ||
      Number(outcomes?.wonValue) ||
      0
    : 0;

  const overviewRows = useMemo(
    () => buildOverviewRows(deals, displayTrend),
    [deals, displayTrend],
  );

  const windowLabel = formatWindowLabel(windowFilter);
  const trendLabel =
    trendRange === "window"
      ? windowLabel
      : trendRange === "90"
        ? "Last 90 days"
        : "Last year";

  if (loading && !analytics && !leadsDash) {
    return <DashSkeleton rows={5} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — refresh keeps shell date/owner filters intact */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">Growth analytics</p>
          <p className="text-xs text-[var(--text-muted)]">
            Live CRM data · {windowLabel}
            {ownerId && ownerId !== "All" ? ` · ${ownerLabel}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshToken((t) => t + 1)}
          className={cn(CRM_BTN_ICON, "h-9 w-9")}
          aria-label="Refresh growth dashboard"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>

      {error ? (
        <div className={cn(CRM_PANEL, "border-[color-mix(in_srgb,var(--error)_35%,var(--border-color))] p-4")}>
          <p className="text-sm font-medium text-[var(--error)]">{error}</p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-[var(--primary)] hover:underline"
            onClick={() => setRefreshToken((t) => t + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* KPI row + Retention */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <GrowthKpiCard
          label={canViewRevenue ? "Total Revenue Growth" : "Deal Volume Growth"}
          value={revenueGrowthValue}
          format={canViewRevenue ? "money" : "number"}
          delta={revenueGrowthDelta}
          tone="green"
          sub="vs Last Period"
        />
        <GrowthKpiCard
          label="Conversion Rate"
          value={conversionPct}
          format="percent"
          delta={
            leadsDash?.kpis?.deltas?.conversionRate ??
            (leadsStat?.delta != null ? Number(leadsStat.delta) : null)
          }
          tone="red"
          sub="vs Last Period"
        />
        <GrowthKpiCard
          label="New Customers"
          value={newCustomers}
          format="number"
          delta={newCustomersDelta}
          tone="purple"
          sub="vs Last Period"
        />
        <GrowthKpiCard
          label="Monthly Growth"
          value={moGrowth}
          format="percent"
          delta={moGrowth}
          tone="yellow"
          sub="vs prior month"
        />
        <div className="sm:col-span-2 xl:col-span-1">
          <RetentionCard
            retainedPct={retainedPct}
            churnedPct={churnedPct}
            onRefresh={() => setRefreshToken((t) => t + 1)}
          />
        </div>
      </div>

      {/* Performance comparison MoM / QoQ / YoY */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={cn(CRM_PANEL, "p-4 transition-shadow hover:shadow-[var(--crm-shadow-raised)]")}>
          <p className="text-xs font-medium text-[var(--text-muted)]">Month-over-Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-main)]">
            {moGrowth >= 0 ? "+" : ""}
            {moGrowth}%
          </p>
        </div>
        <div className={cn(CRM_PANEL, "p-4 transition-shadow hover:shadow-[var(--crm-shadow-raised)]")}>
          <p className="text-xs font-medium text-[var(--text-muted)]">Quarter-over-Quarter</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-main)]">
            {qoGrowth >= 0 ? "+" : ""}
            {qoGrowth}%
          </p>
        </div>
        <div className={cn(CRM_PANEL, "p-4 transition-shadow hover:shadow-[var(--crm-shadow-raised)]")}>
          <p className="text-xs font-medium text-[var(--text-muted)]">Year-over-Year</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-main)]">
            {yoGrowth == null
              ? "—"
              : `${yoGrowth >= 0 ? "+" : ""}${yoGrowth}%`}
          </p>
        </div>
      </div>

      {/* Revenue bars + Region donut */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueProgressChart
          data={revenueBars}
          canViewRevenue={canViewRevenue}
          title="Revenue"
          subtitle={trendLabel}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSelect
                value={revenueMode}
                onChange={(v) => setRevenueMode(v as RevenueMode)}
                options={[
                  { value: "monthly", label: "Last 6 Months" },
                  { value: "daily", label: "Daily" },
                ]}
              />
              <PeriodSelect
                value={trendRange}
                onChange={(v) => setTrendRange(v as TrendRange)}
                options={[
                  { value: "window", label: "Selected window" },
                  { value: "90", label: "Last 90 days" },
                  { value: "365", label: "Last Year" },
                ]}
              />
            </div>
          }
        />
        <RegionGrowthDonut
          data={regionRows}
          title={regionIsTerritory ? "Region-wise Growth" : "Source-wise Growth"}
          subtitle={`Lead acquisition · ${regionYear}`}
          actions={
            <PeriodSelect
              value={regionYear}
              onChange={setRegionYear}
              options={[
                {
                  value: String(new Date().getFullYear()),
                  label: String(new Date().getFullYear()),
                },
                {
                  value: String(new Date().getFullYear() - 1),
                  label: String(new Date().getFullYear() - 1),
                },
              ]}
            />
          }
        />
      </div>

      {/* Growth trend */}
      <GrowthTrendAreaChart
        data={displayTrend}
        canViewRevenue={canViewRevenue}
        title="Growth Trend"
        subtitle={trendLabel}
        seriesKey={canViewRevenue ? "revenue" : "leads"}
        seriesName={canViewRevenue ? "Revenue" : "Deals"}
        actions={
          <PeriodSelect
            value={trendRange}
            onChange={(v) => setTrendRange(v as TrendRange)}
            options={[
              { value: "window", label: windowLabel },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: String(new Date().getFullYear()) },
            ]}
          />
        }
      />

      {/* Lead acquisition + Deal/Revenue comparison (existing dual chart restyled) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthTrendAreaChart
          data={leadAcquisition}
          canViewRevenue={false}
          title="Lead Acquisition Trend"
          subtitle={windowLabel}
          seriesKey="value"
          seriesName="Leads"
        />
        <GrowthComparisonLineChart
          data={comparisonSeries}
          canViewRevenue={canViewRevenue}
          title={canViewRevenue ? "Revenue & Deal Volume" : "Deal Volume"}
          subtitle="Period growth comparison"
        />
      </div>

      {/* Channel performance — which acquisition channels are driving growth */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthCategoryBarChart
          title="Channel Performance"
          subtitle={`Leads by channel · ${windowLabel}`}
          data={channelPerformanceRows}
          valueLabel="Leads"
          color="#8b5cf6"
        />
        <GrowthCategoryBarChart
          title="Follow-up Reply Effectiveness"
          subtitle="Replies by follow-up attempt #"
          data={followUpReplyRows}
          valueLabel="Replies"
          color="#3b82f6"
        />
      </div>

      {/* Target vs achievement + Won/Lost value */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TargetVsAchievementChart
          forecast={forecast}
          achieved={achievedRevenue}
          canViewRevenue={canViewRevenue}
          subtitle="Forecast pipeline vs MTD closed-won"
        />
        <GrowthCategoryBarChart
          title="Won vs Lost Value"
          subtitle={windowLabel}
          data={canViewRevenue ? wonLostValueRows : []}
          valueLabel="Value"
          color="#ff9f43"
        />
      </div>

      {/* Growth Overview table */}
      <GrowthOverviewTable rows={overviewRows} canViewRevenue={canViewRevenue} />

      {/* Preserved: Original KPI stats at bottom for continuity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmKpiCard
          label="Lead Velocity"
          value={leadsStat?.value ?? funnelLeads}
          icon={<CrmIcon.TrendingUp size={18} />}
          trend={
            leadsStat?.delta == null
              ? "neutral"
              : Number(leadsStat.delta) >= 0
                ? "up"
                : "down"
          }
          trendValue={
            leadsStat?.delta != null
              ? `${Number(leadsStat.delta) >= 0 ? "+" : ""}${leadsStat.delta}%`
              : undefined
          }
          sub="vs prior period"
        />
        <CrmKpiCard
          label="Gross Pipeline"
          value={
            canViewRevenue
              ? fmtMoneyIfAllowed(
                  Number(revenuePeriods?.grossPipeline) ||
                    parseMoneyValue(revenueStat?.value),
                  true,
                )
              : "—"
          }
          icon={<CrmIcon.Money size={18} />}
          trend={
            revenueStat?.delta == null
              ? "neutral"
              : Number(revenueStat.delta) >= 0
                ? "up"
                : "down"
          }
          trendValue={
            revenueStat?.delta != null
              ? `${Number(revenueStat.delta) >= 0 ? "+" : ""}${revenueStat.delta}%`
              : undefined
          }
          sub="vs prior period"
        />
        <CrmKpiCard
          label="Win Ratio"
          value={winStat?.value ?? `${retainedPct.toFixed(1)}%`}
          icon={<CrmIcon.Handshake size={18} />}
          trend={
            winStat?.delta == null
              ? "neutral"
              : Number(winStat.delta) >= 0
                ? "up"
                : "down"
          }
          trendValue={
            winStat?.delta != null
              ? `${Number(winStat.delta) >= 0 ? "+" : ""}${winStat.delta}%`
              : undefined
          }
          sub="Closed won / closed"
        />
        <CrmKpiCard
          label="Active Cycle"
          value={cycleStat?.value ?? "—"}
          icon={<CrmIcon.Calendar size={18} />}
          sub="Avg days to won"
        />
      </div>

      {!loading && !analytics && !leadsDash && !error ? (
        <EmptyDash message="No growth data available for the selected filters." />
      ) : null}
    </div>
  );
}
