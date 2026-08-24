"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import { CRM_BTN_ICON, CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { DashSkeleton, EmptyDash } from "./dashboardShared";
import { PeriodSelect } from "./SalesOverviewCharts";
import {
  GrowthCategoryBarChart,
  GrowthKpiCard,
  GrowthTrendAreaChart,
  RegionGrowthDonut,
} from "./GrowthDashboardCharts";

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
  leadsCreatedByDay?: Array<{ date: string; count: number }>;
};

type BoardReports = {
  channelPerformance?: Array<{
    channel: string;
    leads: number;
    converted: number;
    conversionRate: number;
    replies: number;
    replyRate: number;
  }>;
  followUpReplyAnalytics?: {
    repliesByAttempt: Array<{ attempt: number; label: string; replies: number }>;
    avgSendsAtReply: number;
    avgFollowUpsAtReply: number;
    repliedConversations: number;
  };
};

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

export default function GrowthDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadsDash, setLeadsDash] = useState<LeadsDashPayload | null>(null);
  const [board, setBoard] = useState<BoardReports | null>(null);
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
      const leadsQs = new URLSearchParams({ days: period, owner: ownerParam });
      const boardQs = new URLSearchParams({ days: period, owner: ownerParam });
      if (compare) {
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

      const [leadsRes, boardRes, regionRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${leadsQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/reports/board?${boardQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/reports/leads-dashboard?${regionQs}`, {
          headers: authHeaders(),
          cache: "no-store",
        }),
      ]);

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
          channelPerformance: Array.isArray(payload?.channelPerformance)
            ? payload.channelPerformance
            : [],
          followUpReplyAnalytics: payload?.followUpReplyAnalytics ?? undefined,
        });
      } else {
        setBoard(null);
      }

      if (!leadsRes.ok) {
        setError("Unable to load growth analytics. Check your connection and try again.");
      }
    } catch {
      setLeadsDash(null);
      setBoard(null);
      setRegionRowsLive([]);
      setRegionIsTerritory(false);
      setError("Unable to load growth analytics. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerLabel, windowFilter, compare, regionYear, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const conversionPct = parsePercent(leadsDash?.kpis?.conversionRate);

  const newCustomers =
    Number(leadsDash?.kpis?.convertedLeads) ||
    Number(leadsDash?.kpis?.createdInPeriod) ||
    0;

  const newCustomersDelta =
    leadsDash?.kpis?.deltas?.converted ?? leadsDash?.kpis?.deltas?.created ?? null;

  const createdInPeriod = Number(leadsDash?.kpis?.createdInPeriod) || 0;
  const createdDelta = leadsDash?.kpis?.deltas?.created ?? null;

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

  const leadAcquisition = useMemo(
    () =>
      (leadsDash?.leadsCreatedByDay ?? []).map((r) => ({
        name: r.date,
        leads: Number(r.count) || 0,
      })),
    [leadsDash],
  );

  const followUpReplyRows = useMemo(
    () =>
      (board?.followUpReplyAnalytics?.repliesByAttempt ?? []).map((r) => ({
        name: r.label,
        value: Number(r.replies) || 0,
      })),
    [board],
  );

  const windowLabel = formatWindowLabel(windowFilter);

  if (loading && !leadsDash) {
    return <DashSkeleton rows={4} />;
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

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <GrowthKpiCard
          label="Leads Created"
          value={createdInPeriod}
          format="number"
          delta={createdDelta}
          tone="purple"
          sub="vs Last Period"
        />
        <GrowthKpiCard
          label="Conversion Rate"
          value={conversionPct}
          format="percent"
          delta={leadsDash?.kpis?.deltas?.conversionRate ?? null}
          tone="red"
          sub="vs Last Period"
        />
        <GrowthKpiCard
          label="New Customers"
          value={newCustomers}
          format="number"
          delta={newCustomersDelta}
          tone="green"
          sub="vs Last Period"
        />
      </div>

      {/* Lead acquisition + Region growth */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthTrendAreaChart
          data={leadAcquisition}
          canViewRevenue={false}
          title="Lead Acquisition Trend"
          subtitle={windowLabel}
          seriesKey="leads"
          seriesName="Leads"
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

      {!loading && !leadsDash && !error ? (
        <EmptyDash message="No growth data available for the selected filters." />
      ) : null}
    </div>
  );
}
