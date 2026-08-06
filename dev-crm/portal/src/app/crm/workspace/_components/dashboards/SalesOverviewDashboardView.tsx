"use client";

import { useEffect, useMemo, useState } from "react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import {
  CrmSegmentedControl,
} from "@/components/crm/ui";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import type { DashboardAnalyticsPayload } from "@/components/crm/reports/charts/CrmDashboardAnalyticsCharts";
import {
  DashSkeleton,
  RecentCreatedDealsTable,
  RecentTableCard,
  ViewAllLink,
  fmtMoneyIfAllowed,
  type DashRecentDeal,
} from "./dashboardShared";
import type { PipelineStageRow } from "./DealsDashboardView";
import {
  AvgDealSizeStepChart,
  ConversionGauge,
  DashCardHeader,
  DealsWonLostPanel,
  PeriodSelect,
  PipelineStageBars,
  RevenuePeriodTiles,
  SalesGrowthAreaChart,
  TrendChip,
} from "./SalesOverviewCharts";

type DashboardStat = {
  name: string;
  title: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
};

type RevenuePeriodMode = "weekly" | "monthly" | "yearly";
type GrowthRange = "window" | "90" | "365";
type DealsPeriod = "7" | "30" | "90";

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  compareMode?: import("@/portals/crm/lib/reports/period-compare").CompareMode;
  canViewRevenue: boolean;
  pipelineByStage: PipelineStageRow[];
  openDeals: number;
  pipelineValue: number;
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

function calendarYearLabel(): string {
  const now = new Date();
  return `1 Jan ${now.getFullYear()} - ${formatShortDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  )}`;
}

function parsePercent(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/%/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function filterDealsByDays(deals: DashRecentDeal[], days: number): DashRecentDeal[] {
  if (!days || days <= 0) return deals;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const withDates = deals.filter((d) => {
    if (!d.createdAt) return true;
    const t = new Date(d.createdAt).getTime();
    return Number.isFinite(t) ? t >= cutoff : true;
  });
  // If API omitted createdAt on most rows, keep full list rather than empty.
  const dated = withDates.filter((d) => d.createdAt);
  return dated.length >= Math.min(3, deals.length) ? withDates : deals;
}

function buildAvgDealTrend(
  salesTrend: Array<{ name: string; revenue: number; leads: number }>,
): Array<{ name: string; avg: number }> {
  return salesTrend
    .map((row) => {
      const count = Number(row.leads) || 0;
      const revenue = Number(row.revenue) || 0;
      return {
        name: row.name,
        avg: count > 0 ? revenue / count : revenue,
      };
    })
    .filter((r) => r.avg > 0);
}

function aggregateTrendByPeriod(
  salesTrend: Array<{ name: string; revenue: number; leads: number }>,
  mode: RevenuePeriodMode,
): Array<{ name: string; revenue: number; leads: number }> {
  if (mode === "weekly" || salesTrend.length <= 14) return salesTrend;

  const buckets = new Map<string, { revenue: number; leads: number }>();
  for (const row of salesTrend) {
    const key =
      mode === "yearly"
        ? String(row.name).slice(0, 4) || row.name
        : String(row.name).slice(0, 7) || row.name;
    const prev = buckets.get(key) || { revenue: 0, leads: 0 };
    prev.revenue += Number(row.revenue) || 0;
    prev.leads += Number(row.leads) || 0;
    buckets.set(key, prev);
  }
  return Array.from(buckets.entries()).map(([name, v]) => ({
    name,
    revenue: v.revenue,
    leads: v.leads,
  }));
}

export default function SalesOverviewDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
  compareMode = "previous",
  canViewRevenue,
  pipelineByStage,
  openDeals,
  pipelineValue,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [deals, setDeals] = useState<DashRecentDeal[]>([]);
  const [growthTrend, setGrowthTrend] = useState<
    Array<{ name: string; revenue: number; leads: number }>
  >([]);
  const [compareLabel, setCompareLabel] = useState("vs prior window");

  const [revenueMode, setRevenueMode] = useState<RevenuePeriodMode>("monthly");
  const [growthRange, setGrowthRange] = useState<GrowthRange>("window");
  const [dealsPeriod, setDealsPeriod] = useState<DealsPeriod>("7");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const period = windowToDashboardPeriod(windowFilter);
        const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
        const qs = new URLSearchParams({ days: period, owner: ownerParam });
        if (compare) qs.set("compare", compare);

        const growthDays =
          growthRange === "window"
            ? period
            : growthRange === "90"
              ? "90"
              : "365";
        const growthQs = new URLSearchParams({
          days: growthDays,
          owner: ownerParam,
        });
        if (compare) growthQs.set("compare", compare);

        const [dashRes, dealsRes, growthRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/dashboard?${qs}`, {
            headers: authHeaders(),
            cache: "no-store",
          }),
          fetch(
            `${CRM_API_URL}/crm/deals?${new URLSearchParams({
              page: "1",
              pageSize: "24",
              ...(ownerId && ownerId !== "All" ? { owner: ownerId } : {}),
            })}`,
            { headers: authHeaders(), cache: "no-store" },
          ),
          growthRange === "window"
            ? Promise.resolve(null)
            : fetch(`${CRM_API_URL}/crm/dashboard?${growthQs}`, {
                headers: authHeaders(),
                cache: "no-store",
              }),
        ]);

        if (cancelled) return;

        if (dashRes.ok) {
          const dashboard = await dashRes.json();
          if (cancelled) return;
          setStats(Array.isArray(dashboard?.stats) ? dashboard.stats : []);
          setCompareLabel(
            compareMode === "off"
              ? ""
              : dashboard?.periodMeta?.compareLabel || "vs prior window",
          );
          setAnalytics({
            funnel: Array.isArray(dashboard?.funnel) ? dashboard.funnel : [],
            summary: dashboard?.summary,
            outcomes: dashboard?.outcomes,
            revenuePeriods: dashboard?.revenuePeriods,
            charts: dashboard?.charts ?? null,
          });
          if (growthRange === "window") {
            setGrowthTrend(
              Array.isArray(dashboard?.charts?.salesTrend)
                ? dashboard.charts.salesTrend
                : [],
            );
          }
        }

        if (growthRes && growthRes.ok) {
          const growthDash = await growthRes.json();
          if (cancelled) return;
          setGrowthTrend(
            Array.isArray(growthDash?.charts?.salesTrend)
              ? growthDash.charts.salesTrend
              : [],
          );
        }

        if (dealsRes.ok) {
          const payload = await dealsRes.json();
          if (cancelled) return;
          const list: DashRecentDeal[] = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];
          setDeals(list.slice(0, 24));
        }
      } catch {
        if (!cancelled) {
          setStats([]);
          setAnalytics(null);
          setDeals([]);
          setGrowthTrend([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, ownerLabel, windowFilter, compare, compareMode, growthRange, refreshToken]);

  const outcomes = analytics?.outcomes;
  const revenuePeriods = analytics?.revenuePeriods;
  const funnel = analytics?.funnel ?? [];

  const won =
    outcomes?.won ?? funnel.find((f) => /won/i.test(f.label))?.val ?? 0;
  const lost = outcomes?.lost ?? 0;
  const leadsCount = funnel.find((f) => /lead/i.test(f.label))?.val ?? 0;

  const conversionPct = parsePercent(
    analytics?.summary?.efficiency ||
      (leadsCount > 0 ? ((won / leadsCount) * 100).toFixed(1) : "0"),
  );

  const grossStat = stats.find((s) => s.name === "total_revenue");
  const leadsStat = stats.find((s) => s.name === "total_leads");

  const salesTrend = analytics?.charts?.salesTrend ?? [];
  const displayGrowthTrend = useMemo(
    () => aggregateTrendByPeriod(growthTrend.length ? growthTrend : salesTrend, revenueMode),
    [growthTrend, salesTrend, revenueMode],
  );

  const avgDealTrend = useMemo(
    () => buildAvgDealTrend(salesTrend),
    [salesTrend],
  );

  const avgDealSize =
    canViewRevenue
      ? Number(revenuePeriods?.avgDealSize) ||
        (openDeals > 0 ? pipelineValue / openDeals : 0)
      : 0;

  const mtd = Number(revenuePeriods?.mtd) || 0;
  const ytd = Number(revenuePeriods?.ytd) || 0;

  const stageRows = useMemo(() => {
    if (pipelineByStage?.length) {
      return pipelineByStage.filter(
        (s) => !/closed\s*won|closed\s*lost/i.test(s.stage || ""),
      );
    }
    const fromApi = analytics?.charts?.dealsByStage;
    if (fromApi?.length) {
      return fromApi.map((r) => ({
        stage: r.name,
        count: r.value,
        value: Number(r.amount ?? 0),
      }));
    }
    return [];
  }, [analytics, pipelineByStage]);

  const filteredDeals = useMemo(
    () => filterDealsByDays(deals, Number(dealsPeriod)).slice(0, 8),
    [deals, dealsPeriod],
  );

  const windowLabel = formatWindowLabel(windowFilter);
  const yearLabel = calendarYearLabel();

  if (loading && !analytics && deals.length === 0) {
    return <DashSkeleton rows={5} />;
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Total Revenue + Conversion Rate */}
      <div className="grid gap-4 xl:grid-cols-5">
        <section className={cn(CRM_PANEL, "overflow-hidden xl:col-span-3")}>
          <DashCardHeader
            title="Total Revenue"
            subtitle={yearLabel}
            actions={
              <CrmSegmentedControl
                value={revenueMode}
                onChange={setRevenueMode}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
            }
          />
          <div className="p-4 sm:p-5">
            <RevenuePeriodTiles
              mtd={mtd}
              ytd={ytd}
              mtdDelta={revenuePeriods?.mtdDelta}
              ytdDelta={revenuePeriods?.ytdDelta}
              canViewRevenue={canViewRevenue}
              dateLabel={yearLabel}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  Open pipeline · {windowLabel}
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-main)]">
                  {fmtMoneyIfAllowed(pipelineValue, canViewRevenue)}
                </p>
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-main)]">{openDeals}</span>{" "}
                open deals
              </div>
              {grossStat?.delta != null ? (
                <TrendChip
                  delta={Number(grossStat.delta)}
                  label={compareLabel || "vs prior window"}
                />
              ) : null}
              {canViewRevenue ? (
                <div className="ml-auto">
                  <ViewAllLink href="/crm/reports/forecast" label="Forecast" />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={cn(CRM_PANEL, "overflow-hidden xl:col-span-2")}>
          <DashCardHeader
            title="Conversion Rate"
            subtitle={windowLabel}
          />
          <div className="p-4 sm:p-5">
            <ConversionGauge
              rate={conversionPct}
              delta={leadsStat?.delta}
              subtitle="Leads → won in selected window"
            />
          </div>
        </section>
      </div>

      {/* Row 2: Won vs Lost + Pipeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(CRM_PANEL, "overflow-hidden")}>
          <DashCardHeader title="Deals Won Vs Lost" />
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

        <section className={cn(CRM_PANEL, "overflow-hidden")}>
          <DashCardHeader
            title="Sales Pipeline Overview"
            actions={<ViewAllLink href="/crm/deals" label="View deals" />}
          />
          <div className="p-4 sm:p-5">
            <PipelineStageBars
              rows={stageRows}
              canViewRevenue={canViewRevenue}
              totalValue={pipelineValue}
              totalDelta={
                grossStat?.delta != null ? Number(grossStat.delta) : null
              }
            />
          </div>
        </section>
      </div>

      {/* Row 3: Recent deals + Avg deal size */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RecentTableCard
            title="Recently Created Deals"
            actions={
              <div className="flex items-center gap-2">
                <PeriodSelect
                  value={dealsPeriod}
                  onChange={(v) => setDealsPeriod(v as DealsPeriod)}
                  options={[
                    { value: "7", label: "Weekly" },
                    { value: "30", label: "Monthly" },
                    { value: "90", label: "Quarterly" },
                  ]}
                />
                <ViewAllLink href="/crm/reports/overview" label="Full reports" />
              </div>
            }
          >
            <RecentCreatedDealsTable
              deals={filteredDeals}
              canViewRevenue={canViewRevenue}
            />
          </RecentTableCard>
        </div>

        <section className={cn(CRM_PANEL, "overflow-hidden lg:col-span-2")}>
          <DashCardHeader title="Avg Deal Size" subtitle={windowLabel} />
          <div className="p-4 sm:p-5">
            <AvgDealSizeStepChart
              data={avgDealTrend}
              avgValue={avgDealSize}
              delta={revenuePeriods?.avgDealSizeDelta}
              canViewRevenue={canViewRevenue}
            />
          </div>
        </section>
      </div>

      {/* Row 4: Sales Growth (executive trend — detailed analytics in Reports) */}
      <section className={cn(CRM_PANEL, "overflow-hidden")}>
        <DashCardHeader
          title="Sales Growth"
          subtitle={
            growthRange === "window"
              ? windowLabel
              : growthRange === "90"
                ? "Last 90 days"
                : "Last year"
          }
          actions={
            <div className="flex items-center gap-2">
              <PeriodSelect
                value={growthRange}
                onChange={(v) => setGrowthRange(v as GrowthRange)}
                options={[
                  { value: "window", label: "Selected window" },
                  { value: "90", label: "Last 90 days" },
                  { value: "365", label: "Last Year" },
                ]}
              />
              <ViewAllLink href="/crm/reports/overview" label="Reports" />
            </div>
          }
        />
        <div className="p-4 sm:p-5">
          <SalesGrowthAreaChart
            data={displayGrowthTrend}
            canViewRevenue={canViewRevenue}
          />
        </div>
        <p className="border-t border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5">
          Period funnel, activity mix, email engagement, and forecast detail are in{" "}
          <a href="/crm/reports/overview" className="font-medium text-[var(--primary)] hover:underline">
            Reports → Overview
          </a>
          .
        </p>
      </section>
    </div>
  );
}
