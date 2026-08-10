"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import { CrmKpiCard, CrmSectionCard } from "@/components/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import {
  CRM_CHART_INFO,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import type { DashboardAnalyticsPayload } from "@/components/crm/reports/charts/CrmDashboardAnalyticsCharts";
import {
  DashSkeleton,
  RecentTableCard,
  ViewAllLink,
  fmtMoneyIfAllowed,
  type DashRecentDeal,
} from "./dashboardShared";
import {
  DealsWonLostPanel,
  DashCardHeader,
  PeriodSelect,
} from "./SalesOverviewCharts";
import {
  DealKpiTile,
  EnhancedRecentDealsTable,
  InteractiveDealsTrendChart,
  InteractiveStageBarChart,
} from "./DealsDashboardCharts";

export type PipelineStageRow = { stage: string; count: number; value: number };

type DashboardStat = {
  name: string;
  title: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
};

type BoardReports = {
  dealsByOwner?: Array<{ owner: string; count: number }>;
  dealsCreatedInPeriod?: number;
  openDealsByPipeline?: Array<{
    pipelineId: string | null;
    pipelineName: string;
    total: number;
    stages: Array<{ stage: string; count: number }>;
  }>;
};

type DealsAddedDay = {
  date: string;
  total: number;
  byPipeline?: Array<{
    pipelineId: string | null;
    pipelineName: string;
    count: number;
  }>;
  byStage?: Array<{ stage: string; count: number }>;
};

type LocalRange = "window" | "7" | "30" | "90" | "365";

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  canViewRevenue: boolean;
  pipelineByStage: PipelineStageRow[];
  atRiskCount?: number;
  closingSoonCount?: number;
  openDeals?: number;
  pipelineValue?: number;
  dealsAddedByDay?: DealsAddedDay[];
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

function formatTrendLabel(name: string): string {
  if (!name) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) {
    const d = new Date(name);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }
  }
  if (/^\d{4}-\d{2}$/.test(name)) {
    const d = new Date(`${name}-01`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    }
  }
  return name;
}

function parsePercent(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/%/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function DealsDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
  canViewRevenue,
  pipelineByStage,
  atRiskCount = 0,
  closingSoonCount = 0,
  openDeals = 0,
  pipelineValue = 0,
  dealsAddedByDay = [],
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [board, setBoard] = useState<BoardReports | null>(null);
  const [deals, setDeals] = useState<DashRecentDeal[]>([]);
  const [trendRange, setTrendRange] = useState<LocalRange>("window");
  const [stagePeriod, setStagePeriod] = useState<"window" | "30" | "90">("window");
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const period = windowToDashboardPeriod(windowFilter);
      const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
      const dashQs = new URLSearchParams({ days: period, owner: ownerParam });
      const boardQs = new URLSearchParams({ days: period, owner: ownerParam });
      if (compare) {
        dashQs.set("compare", compare);
        boardQs.set("compare", compare);
      }

      const trendDays =
        trendRange === "window"
          ? period
          : trendRange === "7"
            ? "7"
            : trendRange === "30"
              ? "30"
              : trendRange === "90"
                ? "90"
                : "365";
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
            { property: "dealOwner", operator: "contains", value: ownerLabel || ownerId },
          ]),
        );
      }

      const [dashRes, boardRes, dealsRes, trendRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/dashboard?${dashQs}`, {
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
      } else {
        setAnalytics(null);
      }

      if (boardRes.ok) {
        const payload = await boardRes.json();
        setBoard({
          dealsByOwner: Array.isArray(payload?.dealsByOwner)
            ? payload.dealsByOwner
            : [],
          dealsCreatedInPeriod: Number(payload?.dealsCreatedInPeriod) || 0,
          openDealsByPipeline: Array.isArray(payload?.openDealsByPipeline)
            ? payload.openDealsByPipeline
            : [],
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

      if (trendRes && trendRes.ok) {
        const trendDash = await trendRes.json();
        setAnalytics((prev) => ({
          ...(prev || {}),
          charts: {
            ...(prev?.charts || {}),
            salesTrend: Array.isArray(trendDash?.charts?.salesTrend)
              ? trendDash.charts.salesTrend
              : prev?.charts?.salesTrend,
          },
        }));
      }
    } catch {
      setError("Failed to load deals analytics. Try refreshing.");
      setStats([]);
      setAnalytics(null);
      setBoard(null);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerLabel, windowFilter, compare, trendRange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshToken]);

  const windowLabel = formatWindowLabel(windowFilter);
  const outcomes = analytics?.outcomes;
  const revenuePeriods = analytics?.revenuePeriods;
  const funnel = analytics?.funnel ?? [];

  const won =
    outcomes?.won ?? funnel.find((f) => /won/i.test(f.label))?.val ?? 0;
  const lost = outcomes?.lost ?? 0;
  const wonValue = Number(outcomes?.wonValue) || 0;
  const expectedRevenue =
    Number(revenuePeriods?.weightedPipeline) ||
    (canViewRevenue ? pipelineValue : 0);
  const grossPipeline =
    Number(revenuePeriods?.grossPipeline) ||
    (canViewRevenue ? pipelineValue : 0);

  const winStat = stats.find((s) => s.name === "win_ratio");
  const cycleStat = stats.find((s) => s.name === "sales_cycle");
  const winRate = parsePercent(winStat?.value);
  const lossRate =
    won + lost > 0 ? (lost / (won + lost)) * 100 : 0;

  const avgDealSize = canViewRevenue
    ? Number(revenuePeriods?.avgDealSize) ||
      (openDeals > 0 ? pipelineValue / openDeals : 0)
    : 0;

  const conversionPct = parsePercent(analytics?.summary?.efficiency);

  const allStageRows = useMemo(() => {
    const fromApi = analytics?.charts?.dealsByStage;
    if (fromApi?.length) {
      return fromApi.map((r) => ({
        stage: r.name,
        count: r.value,
        value: Number(r.amount ?? 0),
      }));
    }
    return pipelineByStage;
  }, [analytics, pipelineByStage]);

  /** Full stage mix (incl. won/lost) — matches reference Deals By Stage chart */
  const stageDistribution = useMemo(() => {
    if (allStageRows.length) return allStageRows;
    return pipelineByStage;
  }, [allStageRows, pipelineByStage]);

  const salesTrend = analytics?.charts?.salesTrend ?? [];

  const createdTrend = useMemo(() => {
    const fromSales = salesTrend.map((r) => ({
      label: formatTrendLabel(r.name),
      deals: Number(r.leads) || 0,
      revenue: Number(r.revenue) || 0,
    }));
    if (trendRange === "window" && dealsAddedByDay?.length) {
      return dealsAddedByDay.map((d) => ({
        label: formatTrendLabel(d.date),
        deals: Number(d.total) || 0,
        revenue: 0,
      }));
    }
    return fromSales;
  }, [dealsAddedByDay, salesTrend, trendRange]);

  const totalDealsInWindow =
    Number(board?.dealsCreatedInPeriod) ||
    createdTrend.reduce((s, r) => s + Number(r.deals || 0), 0) ||
    deals.length;

  const tableDeals = useMemo(() => {
    if (stagePeriod === "window") return deals;
    const days = Number(stagePeriod);
    if (!days) return deals;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = deals.filter((d) => {
      if (!d.createdAt) return true;
      const t = new Date(d.createdAt).getTime();
      return Number.isFinite(t) ? t >= cutoff : true;
    });
    const dated = filtered.filter((d) => d.createdAt);
    return dated.length >= Math.min(3, deals.length) ? filtered : deals;
  }, [deals, stagePeriod]);

  const forecastSpark = analytics?.charts?.revenueForecast ?? [];
  const forecastTotal = forecastSpark.reduce(
    (s, r) => s + (Number(r.value) || 0),
    0,
  );

  if (loading && !analytics && deals.length === 0) {
    return <DashSkeleton rows={5} />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {/* KPI strip — live CRM metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <DealKpiTile
          label="Total deals"
          value={totalDealsInWindow}
          sub={windowLabel}
          accent={CRM_CHART_PRIMARY}
        />
        <DealKpiTile
          label="Open deals"
          value={openDeals}
          sub="In pipeline"
          accent={CRM_CHART_INFO}
        />
        <DealKpiTile
          label="Won"
          value={won}
          sub={windowLabel}
          accent={CRM_CHART_SUCCESS}
          delta={outcomes?.wonDelta}
        />
        <DealKpiTile
          label="Lost"
          value={lost}
          sub={windowLabel}
          accent={CRM_CHART_PRIMARY}
          delta={outcomes?.lostDelta}
        />
        <DealKpiTile
          label="Pipeline value"
          value={canViewRevenue ? pipelineValue || grossPipeline : 0}
          format="money"
          sub={canViewRevenue ? "Open pipeline" : "Restricted"}
          accent={CRM_CHART_SECONDARY}
        />
        <DealKpiTile
          label="Win rate"
          value={winRate}
          format="percent"
          sub="Closed won / closed"
          accent={CRM_CHART_SUCCESS}
          delta={winStat?.delta != null ? Number(winStat.delta) : null}
        />
        <DealKpiTile
          label="Avg deal size"
          value={avgDealSize}
          format="money"
          sub={windowLabel}
          accent={CRM_CHART_WARNING}
          delta={revenuePeriods?.avgDealSizeDelta}
        />
        <DealKpiTile
          label="Expected revenue"
          value={canViewRevenue ? expectedRevenue : 0}
          format="money"
          sub="Weighted pipeline"
          accent={CRM_CHART_INFO}
        />
      </div>

      {/* Row: Recent deals + Deals by stage (reference layout) */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <RecentTableCard
            title="Recently Created Deals"
            actions={
              <div className="flex items-center gap-2">
                <PeriodSelect
                  value={stagePeriod}
                  onChange={(v) => setStagePeriod(v as typeof stagePeriod)}
                  options={[
                    { value: "window", label: windowLabel },
                    { value: "30", label: "Last 30 days" },
                    { value: "90", label: "Last quarter" },
                  ]}
                />
                <ViewAllLink href="/crm/deals" label="View All" />
              </div>
            }
          >
            <EnhancedRecentDealsTable
              deals={tableDeals}
              canViewRevenue={canViewRevenue}
              emptyMessage="No recently created deals for this view."
            />
          </RecentTableCard>
        </div>

        <div className="xl:col-span-2">
          <InteractiveStageBarChart
            title="Deals By Stage"
            subtitle={windowLabel}
            rows={stageDistribution}
            valueMode="count"
            emptyMessage="No open pipeline stages for this view."
          />
        </div>
      </div>

      {/* Won vs Lost + Closing / At-risk (preserved) */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className={cn(CRM_PANEL, "overflow-hidden lg:col-span-3")}>
          <DashCardHeader
            title="Won vs Lost Deals"
            subtitle={windowLabel}
            actions={
              <button
                type="button"
                onClick={() => setRefreshToken((t) => t + 1)}
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Refresh
              </button>
            }
          />
          <div className="p-4 sm:p-5">
            <DealsWonLostPanel
              won={won}
              lost={lost}
              wonDelta={outcomes?.wonDelta}
              lostDelta={outcomes?.lostDelta}
              vsLastMonth={outcomes?.vsLastMonth}
              onRefresh={() => setRefreshToken((t) => t + 1)}
            />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
            <p className="text-sm font-medium text-[var(--text-muted)]">Closing soon</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-main)]">
              {closingSoonCount}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Next 45 days · live pipeline</p>
          </div>
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
            <p className="text-sm font-medium text-[var(--text-muted)]">At-risk deals</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-main)]">
              {atRiskCount}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Need movement</p>
          </div>
        </div>
      </div>

      {/* Snapshot trend — deep owner/source/aging live in Deal Reports */}
      <InteractiveDealsTrendChart
        title="Deals created trend"
        subtitle={
          trendRange === "window"
            ? windowLabel
            : trendRange === "7"
              ? "Last 7 days"
              : trendRange === "30"
                ? "Last 30 days"
                : trendRange === "90"
                  ? "Last quarter"
                  : "Last year"
        }
        data={createdTrend}
        canViewRevenue={canViewRevenue}
        series={[
          { key: "deals", name: "Deals created", color: CRM_CHART_WARNING },
          { key: "revenue", name: "Revenue", color: CRM_CHART_PRIMARY },
        ]}
        actions={
          <PeriodSelect
            value={trendRange}
            onChange={(v) => setTrendRange(v as LocalRange)}
            options={[
              { value: "window", label: "Selected window" },
              { value: "7", label: "Week" },
              { value: "30", label: "Month" },
              { value: "90", label: "Quarter" },
              { value: "365", label: "Year" },
            ]}
          />
        }
        emptyMessage="No deals created in this window."
      />

      {/* Secondary KPI row — conversion, cycle, actual revenue */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmKpiCard
          label="Deal conversion"
          value={`${conversionPct.toFixed(1)}%`}
          icon={<CrmIcon.Target size={18} />}
          sub="Leads → won"
        />
        <CrmKpiCard
          label="Loss rate"
          value={`${lossRate.toFixed(1)}%`}
          icon={<CrmIcon.AlertTriangle size={18} />}
          sub="Closed lost / closed"
          trend={lossRate > 50 ? "down" : "neutral"}
        />
        <CrmKpiCard
          label="Avg sales cycle"
          value={cycleStat?.value ?? "—"}
          icon={<CrmIcon.Calendar size={18} />}
          sub="Days to won"
        />
        <CrmKpiCard
          label="Actual won revenue"
          value={fmtMoneyIfAllowed(wonValue, canViewRevenue)}
          icon={<CrmIcon.Handshake size={18} />}
          sub={windowLabel}
          trend={
            outcomes?.wonDelta == null
              ? "neutral"
              : Number(outcomes.wonDelta) >= 0
                ? "up"
                : "down"
          }
          trendValue={
            outcomes?.wonDelta != null
              ? `${Number(outcomes.wonDelta) >= 0 ? "+" : ""}${outcomes.wonDelta}%`
              : undefined
          }
        />
      </div>

      {canViewRevenue && forecastSpark.length > 0 ? (
        <CrmSectionCard
          title="Expected revenue forecast"
          actions={<ViewAllLink href="/crm/reports/forecast" label="Deal Reports" />}
        >
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs font-medium text-[var(--text-muted)]">
                Forward pipeline (weighted)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-main)]">
                {fmtMoneyIfAllowed(forecastTotal, true)}
              </p>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Owner, source, aging, and quarterly breakdowns are in{" "}
              <a href="/crm/reports/forecast" className="font-medium text-[var(--primary)] hover:underline">
                Reports → Deal Reports
              </a>
              .
            </p>
          </div>
        </CrmSectionCard>
      ) : (
        <section className={cn(CRM_PANEL, "px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5")}>
          Owner, source, aging, and quarterly deal analytics are in{" "}
          <a href="/crm/reports/forecast" className="font-medium text-[var(--primary)] hover:underline">
            Reports → Deal Reports
          </a>
          .
        </section>
      )}
    </div>
  );
}
