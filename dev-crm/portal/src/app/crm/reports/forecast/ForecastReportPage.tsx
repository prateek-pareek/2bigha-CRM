"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Target, Users, Briefcase } from "lucide-react";
import CrmBoardInsightsPanel from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import CrmDailyIntakeDetailPanel from "@/components/crm/reports/panels/CrmDailyIntakeDetailPanel";
import CrmPipelineOutcomesPanel from "@/components/crm/reports/panels/CrmPipelineOutcomesPanel";
import CrmRevenueForecastPanel from "@/components/crm/reports/panels/CrmRevenueForecastPanel";
import CrmSalesHealthPanel from "@/components/crm/reports/panels/CrmSalesHealthPanel";
import type { DealReportSection } from "@/lib/crm/shared/dashboard-routes";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import ReportsShell from "../_components/ReportsShell";

export interface RealKpiMetrics {
  leadsCreated: number;
  convertedLeads: number;
  conversionRate: number;
  dealsCreated: number;
  clientsCreated: number;
}

/** Dedicated deal/forecast page — 100% real backend data integration. */
export default function ForecastReportPage({
  section = "forecast",
}: {
  section?: DealReportSection;
}) {
  return (
    <ReportsShell slug={section}>
      {({ period, owner, owners, canViewRevenue }) => (
        <>
          {section === "forecast" && (
            <div className="space-y-4">
              <CrmDailyIntakeDetailPanel
                days={period}
                owner={owner}
                entity="deals"
              />
              <CrmPipelineOutcomesPanel days={period} owner={owner} />
              <CrmBoardInsightsPanel
                ownerFilter={owner}
                owners={owners}
                pinnedFilters={{ days: period, owner }}
                defaultOpen
              />
            </div>
          )}

          {section === "health" && <CrmSalesHealthPanel owner={owner} />}

          {section === "revenue" && canViewRevenue ? (
            <CrmRevenueForecastPanel owner={owner} months={6} />
          ) : null}
        </>
      )}
    </ReportsShell>
  );
}

function ForecastReportContent({
  section,
  period,
  owner,
  owners,
  canViewRevenue,
}: {
  section: DealReportSection;
  period: string;
  owner: string;
  owners: any[];
  canViewRevenue: boolean;
}) {
  const [metrics, setMetrics] = useState<RealKpiMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const token = getCrmAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const queryParams = new URLSearchParams({ days: period });
    if (owner && owner !== "All") {
      queryParams.set("owner", owner);
    }

    fetch(`${CRM_API_URL}/crm/reports/board?${queryParams.toString()}`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) {
          setMetrics({
            leadsCreated: json.leadConversion?.createdInPeriod ?? 0,
            convertedLeads: json.leadConversion?.convertedInPeriod ?? 0,
            conversionRate: json.leadConversion?.conversionRate ?? 0,
            dealsCreated: json.dealsCreatedInPeriod ?? 0,
            clientsCreated: json.clientsCreatedInPeriod ?? 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, owner]);

  return (
    <div className="space-y-6 sm:space-y-8 font-sans pb-8">
      {/* Page Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e8f0] pb-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0f172a]">
            {section === "health"
              ? "Sales Health & Operations"
              : section === "revenue"
                ? "Revenue Forecast & Projections"
                : "Sales & Pipeline Forecast"}
          </h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">
            {section === "health"
              ? "Deal velocity, pipeline hygiene, and team activity benchmarks."
              : section === "revenue"
                ? "Weighted revenue forecast and probability projections for upcoming quarters."
                : "Real-time win probability, pipeline outcome distribution, and top closer rankings."}
          </p>
        </div>
      </div>

      {/* Top Real KPI Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Leads Created</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dbeafe] text-[#2563eb]">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0f172a] tabular-nums">
              {loading ? "…" : metrics?.leadsCreated ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-400">Total new leads in period ({period} days)</p>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lead Conversion %</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dcfce7] text-[#10b981]">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0f172a] tabular-nums">
              {loading ? "…" : `${metrics?.conversionRate ?? 0}%`}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-400">{metrics?.convertedLeads ?? 0} leads converted to deals</p>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deals Created</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3e8ff] text-[#8b5cf6]">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0f172a] tabular-nums">
              {loading ? "…" : metrics?.dealsCreated ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-400">New pipeline deals generated</p>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px] transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clients Converted</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#cff4fc] text-[#0891b2]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0f172a] tabular-nums">
              {loading ? "…" : metrics?.clientsCreated ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-400">New accounts onboarded</p>
        </div>
      </div>

      {section === "forecast" && (
        <div className="space-y-8">
          <CrmPipelineOutcomesPanel days={period} owner={owner} />
          <CrmBoardInsightsPanel
            ownerFilter={owner}
            owners={owners}
            pinnedFilters={{ days: period, owner }}
            defaultOpen
          />
        </div>
      )}

      {section === "health" && <CrmSalesHealthPanel owner={owner} />}

      {section === "revenue" && canViewRevenue ? (
        <CrmRevenueForecastPanel owner={owner} months={6} />
      ) : null}
    </div>
  );
}
