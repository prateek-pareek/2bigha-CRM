"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import {
  CRM_CHART_INFO,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_WARNING,
} from "@/lib/crm/shared/chart-theme";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import {
  DashSkeleton,
  RecentTableCard,
  ViewAllLink,
} from "./dashboardShared";
import { DashCardHeader, PeriodSelect } from "./SalesOverviewCharts";
import {
  EnhancedRecentLeadsTable,
  InteractiveLeadsAreaChart,
  InteractiveLeadsPieChart,
  LeadKpiTile,
  type EnhancedLeadRow,
} from "./LeadsDashboardCharts";

export type LeadsDashboardAnalytics = {
  periodDays?: number;
  kpis?: {
    totalLeads?: number;
    openLeads?: number;
    newLeads?: number;
    qualifiedLeads?: number;
    convertedLeads?: number;
    convertedAllTime?: number;
    lostLeads?: number;
    conversionRate?: number;
    avgHoursToConvert?: number;
    avgDaysToConvert?: number;
    conversionSamples?: number;
    createdInPeriod?: number;
    deltas?: {
      created?: number;
      converted?: number;
      conversionRate?: number;
    };
  };
  leadsByStatus?: Array<{ name: string; value: number }>;
  leadsBySource?: Array<{ name: string; value: number }>;
  leadsByOwner?: Array<{ owner: string; count: number }>;
  leadsByIndustry?: Array<{ name: string; value: number }>;
  leadsByRegion?: Array<{ name: string; value: number }>;
  leadsByPriority?: Array<{ name: string; value: number }>;
  leadsByStage?: Array<{ name: string; value: number }>;
  leadsCreatedByDay?: Array<{ date: string; count: number }>;
  monthlyPerformance?: Array<{
    month: string;
    created: number;
    converted: number;
  }>;
  quarterlyPerformance?: Array<{
    quarter: string;
    created: number;
    converted: number;
    conversionRate: number;
  }>;
  lostLeadsByStage?: Array<{ stage: string; count: number }>;
  convertedLeadsByStage?: Array<{ stage: string; count: number }>;
  conversionFunnel?: Array<{ label: string; val: number }>;
  topLeadSources?: Array<{ name: string; count: number }>;
  recentLeads?: EnhancedLeadRow[];
};

type LocalRange = "window" | "7" | "30" | "90" | "365";

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  neverContactedCount?: number;
  staleCount?: number;
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

export default function LeadsDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
  neverContactedCount = 0,
  staleCount = 0,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeadsDashboardAnalytics | null>(null);
  const [trendRange, setTrendRange] = useState<LocalRange>("window");
  const [tablePeriod, setTablePeriod] = useState<"window" | "30" | "90">("window");
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const period =
        trendRange === "window"
          ? windowToDashboardPeriod(windowFilter)
          : trendRange === "7"
            ? "7"
            : trendRange === "30"
              ? "30"
              : trendRange === "90"
                ? "90"
                : "365";
      const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
      const qs = new URLSearchParams({ days: period, owner: ownerParam });
      if (compare) qs.set("compare", compare);

      const res = await fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${qs}`, {
        headers: authHeaders(),
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as LeadsDashboardAnalytics;
      setData(payload);
    } catch {
      setError("Failed to load leads analytics. Try refreshing.");
      setData(null);
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
  const kpis = data?.kpis;

  const stagePie = useMemo(() => {
    if (data?.leadsByStage?.length) {
      return data.leadsByStage.map((r) => ({
        name: r.name,
        value: Number(r.value) || 0,
      }));
    }
    return (data?.leadsByStatus || []).map((r) => ({
      name: r.name,
      value: Number(r.value) || 0,
    }));
  }, [data]);

  const createdTrend = useMemo(
    () =>
      (data?.leadsCreatedByDay || []).map((r) => ({
        label: formatTrendLabel(r.date),
        leads: Number(r.count) || 0,
      })),
    [data],
  );

  const tableLeads = useMemo(() => {
    const leads = data?.recentLeads || [];
    if (tablePeriod === "window") return leads;
    const days = Number(tablePeriod);
    if (!days) return leads;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = leads.filter((l) => {
      if (!l.createdAt) return true;
      const t = new Date(l.createdAt).getTime();
      return Number.isFinite(t) ? t >= cutoff : true;
    });
    const dated = filtered.filter((l) => l.createdAt);
    return dated.length >= Math.min(3, leads.length) ? filtered : leads;
  }, [data, tablePeriod]);

  const avgConvertLabel =
    kpis?.avgDaysToConvert && kpis.avgDaysToConvert >= 1
      ? `${kpis.avgDaysToConvert}d`
      : kpis?.avgHoursToConvert
        ? `${kpis.avgHoursToConvert}h`
        : "—";

  if (loading && !data) {
    return <DashSkeleton rows={6} />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRefreshToken((t) => t + 1)}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* KPI strip — live CRM lead metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <LeadKpiTile
          label="Total leads"
          value={Number(kpis?.totalLeads) || 0}
          sub="All time · scoped"
          accent={CRM_CHART_PRIMARY}
        />
        <LeadKpiTile
          label="New leads"
          value={Number(kpis?.createdInPeriod ?? kpis?.newLeads) || 0}
          sub={windowLabel}
          accent={CRM_CHART_INFO}
          delta={kpis?.deltas?.created}
        />
        <LeadKpiTile
          label="Qualified"
          value={Number(kpis?.qualifiedLeads) || 0}
          sub="By status in period"
          accent={CRM_CHART_WARNING}
        />
        <LeadKpiTile
          label="Converted"
          value={Number(kpis?.convertedLeads) || 0}
          sub={windowLabel}
          accent={CRM_CHART_SUCCESS}
          delta={kpis?.deltas?.converted}
        />
        <LeadKpiTile
          label="Lost leads"
          value={Number(kpis?.lostLeads) || 0}
          sub="Disqualified / lost"
          accent={CRM_CHART_PRIMARY}
        />
        <LeadKpiTile
          label="Conversion rate"
          value={Number(kpis?.conversionRate) || 0}
          format="percent"
          sub="Created → converted"
          accent={CRM_CHART_SUCCESS}
          delta={kpis?.deltas?.conversionRate}
        />
        <LeadKpiTile
          label="Open leads"
          value={Number(kpis?.openLeads) || 0}
          sub="In pipeline"
          accent={CRM_CHART_SECONDARY}
        />
        <LeadKpiTile
          label="Avg time to convert"
          value={
            kpis?.avgDaysToConvert && kpis.avgDaysToConvert >= 1
              ? Number(kpis.avgDaysToConvert)
              : Number(kpis?.avgHoursToConvert) || 0
          }
          format="number"
          sub={
            kpis?.conversionSamples
              ? `${avgConvertLabel} · ${kpis.conversionSamples} samples`
              : avgConvertLabel
          }
          accent={CRM_CHART_INFO}
        />
      </div>

      {/* Row: Recently Created Leads + Leads By Stage pie (reference layout) */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <RecentTableCard
            title="Recently Created Leads"
            actions={
              <div className="flex items-center gap-2">
                <PeriodSelect
                  value={tablePeriod}
                  onChange={(v) => setTablePeriod(v as typeof tablePeriod)}
                  options={[
                    { value: "window", label: windowLabel },
                    { value: "30", label: "Last 30 days" },
                    { value: "90", label: "Last quarter" },
                  ]}
                />
                <ViewAllLink href="/crm/leads" label="View All" />
              </div>
            }
          >
            <EnhancedRecentLeadsTable
              leads={tableLeads}
              emptyMessage="No recently created leads for this view."
            />
          </RecentTableCard>
        </div>

        <div className="xl:col-span-2">
          <InteractiveLeadsPieChart
            title="Leads By Stage"
            subtitle={windowLabel}
            rows={stagePie}
            emptyMessage="No open leads by stage yet."
          />
        </div>
      </div>

      {/* Attention tiles (preserved) + growth area */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <InteractiveLeadsAreaChart
            title="Leads Created Over Time"
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
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
            <p className="text-sm font-medium text-[var(--text-muted)]">No outreach</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-main)]">
              {neverContactedCount}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Open leads, no logged touch</p>
            <NextLink
              href="/crm/workspace/work"
              className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
            >
              Open work queue
            </NextLink>
          </div>
          <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
            <p className="text-sm font-medium text-[var(--text-muted)]">Stale follow-up</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-main)]">
              {staleCount}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Need re-engagement</p>
            <button
              type="button"
              onClick={() => setRefreshToken((t) => t + 1)}
              className="mt-3 text-sm font-medium text-[var(--primary)] hover:underline"
            >
              Refresh analytics
            </button>
          </div>
        </div>
      </div>

      {/* Snapshot summary + deep-dive link (detailed breakdowns live in Reports) */}
      <section className={cn(CRM_PANEL, "overflow-hidden")}>
        <DashCardHeader
          title="Lead snapshot"
          subtitle={`${windowLabel} · daily overview`}
          actions={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRefreshToken((t) => t + 1)}
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Refresh
              </button>
              <ViewAllLink href="/crm/reports/leads" label="Lead Reports" />
            </div>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)]">Created in period</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-main)]">
              {(Number(kpis?.createdInPeriod) || 0).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)]">Converted in period</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-main)]">
              {(Number(kpis?.convertedLeads) || 0).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)]">All-time converted</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-main)]">
              {(Number(kpis?.convertedAllTime) || 0).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)]">Conversion rate</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-main)]">
              {Number(kpis?.conversionRate) || 0}%
            </p>
          </div>
        </div>
        <p className="border-t border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5">
          Funnel, aging, conversion time, and source/owner/region breakdowns are in{" "}
          <NextLink href="/crm/reports/leads" className="font-medium text-[var(--primary)] hover:underline">
            Reports → Lead Reports
          </NextLink>
          .
        </p>
      </section>
    </div>
  );
}
