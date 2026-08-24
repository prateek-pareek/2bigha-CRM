"use client";

import { useEffect, useState } from "react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  resolveDashboardOwnerParam,
  windowToDashboardPeriod,
} from "@/lib/crm/shared/dashboard-period";
import { CrmKpiCard } from "@/components/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import { DashSkeleton, ViewAllLink } from "./dashboardShared";
import {
  InteractiveConversionFunnel,
  InteractiveLeadsPieChart,
} from "./LeadsDashboardCharts";

type DashboardStat = {
  name: string;
  title: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
};

type DashboardAnalytics = {
  funnel: Array<{ label: string; val: number; w?: string }>;
  charts?: {
    leadsByStatus?: Array<{ name: string; value: number }>;
  } | null;
};

type Props = {
  ownerId: string;
  ownerLabel: string;
  windowFilter: string;
  compare?: string;
  compareMode?: import("@/portals/crm/lib/reports/period-compare").CompareMode;
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

export default function SalesOverviewDashboardView({
  ownerId,
  ownerLabel,
  windowFilter,
  compare,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const period = windowToDashboardPeriod(windowFilter);
        const ownerParam = resolveDashboardOwnerParam(ownerId, ownerLabel);
        const qs = new URLSearchParams({ days: period, owner: ownerParam });
        if (compare) qs.set("compare", compare);

        const dashRes = await fetch(`${CRM_API_URL}/crm/dashboard?${qs}`, {
          headers: authHeaders(),
          cache: "no-store",
        });

        if (cancelled) return;

        if (dashRes.ok) {
          const dashboard = await dashRes.json();
          if (cancelled) return;
          setStats(Array.isArray(dashboard?.stats) ? dashboard.stats : []);
          setAnalytics({
            funnel: Array.isArray(dashboard?.funnel) ? dashboard.funnel : [],
            charts: dashboard?.charts ?? null,
          });
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

  const funnel = analytics?.funnel ?? [];
  const leadsByStatus = analytics?.charts?.leadsByStatus ?? [];
  const leadsStat = stats.find((s) => s.name === "total_leads");
  const qualified = funnel.find((f) => /qualified/i.test(f.label))?.val ?? 0;
  const totalLeads = funnel.find((f) => /lead/i.test(f.label))?.val ?? (Number(leadsStat?.value) || 0);
  const qualifiedRate = totalLeads > 0 ? Math.round((qualified / totalLeads) * 1000) / 10 : 0;

  const windowLabel = formatWindowLabel(windowFilter);

  if (loading && !analytics) {
    return <DashSkeleton rows={3} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CrmKpiCard
          label="Leads created"
          value={leadsStat?.value ?? totalLeads}
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
              ? `${Number(leadsStat.delta) >= 0 ? "+" : ""}${leadsStat.delta}${leadsStat.deltaSuffix || "%"}`
              : undefined
          }
          sub={`vs prior period · ${windowLabel}`}
        />
        <CrmKpiCard
          label="Qualified leads"
          value={qualified}
          icon={<CrmIcon.ChartPie size={18} />}
          sub={`${qualifiedRate}% of new leads`}
        />
        <CrmKpiCard
          label="Lead statuses tracked"
          value={leadsByStatus.length}
          icon={<CrmIcon.Handshake size={18} />}
          sub="Distinct lead stages in view"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(CRM_PANEL, "overflow-hidden")}>
          <InteractiveConversionFunnel
            title="Lead funnel"
            subtitle={windowLabel}
            rows={funnel}
          />
        </section>
        <section className={cn(CRM_PANEL, "overflow-hidden")}>
          <InteractiveLeadsPieChart
            title="Leads by status"
            subtitle={windowLabel}
            rows={leadsByStatus}
            actions={<ViewAllLink href="/crm/reports/overview" label="Full reports" />}
          />
        </section>
      </div>

      <p className="rounded-[var(--crm-radius-ui)] border border-dashed border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-muted)]">
        Detailed pipeline, email engagement, and forecast reporting are in{" "}
        <a href="/crm/reports/overview" className="font-medium text-[var(--primary)] hover:underline">
          Reports → Overview
        </a>
        .
      </p>
    </div>
  );
}
