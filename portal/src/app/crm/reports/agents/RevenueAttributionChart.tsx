"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import { formatINR, type AgentReportRow } from "../lib/performance-report";

interface RevenueAttributionChartProps {
  agents: AgentReportRow[];
  loading: boolean;
}

/**
 * Revenue & subscription sales attributed to the agent who completed the 2bigha PM plan
 * checkout from the CRM (verified Razorpay payments). Subscribed leads = leads the agent
 * owns that carry an active 2bigha subscription plan.
 */
export default function RevenueAttributionChart({ agents, loading }: RevenueAttributionChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const chartData = useMemo(
    () =>
      agents
        .filter((a) => a.revenue > 0 || a.subscriptionSales > 0 || a.subscribedLeads > 0)
        .map((a) => ({
          name: a.name.split(" ").slice(0, 2).join(" "),
          revenue: a.revenue,
          sales: a.subscriptionSales,
          subscribedLeads: a.subscribedLeads,
        }))
        .sort((x, y) => y.revenue - x.revenue || y.sales - x.sales)
        .slice(0, 10),
    [agents],
  );

  if (loading) return <ReportChartSkeleton type="bar" height="350px" />;

  const totalRevenue = agents.reduce((s, a) => s + (a.revenue || 0), 0);
  const totalSales = agents.reduce((s, a) => s + (a.subscriptionSales || 0), 0);
  const totalSubscribed = agents.reduce((s, a) => s + (a.subscribedLeads || 0), 0);
  const top = chartData[0];

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? "fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl" : ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Revenue & Subscription Sales</h3>
          <p className="text-xs text-[var(--text-muted)]">Verified 2bigha plan payments made through the CRM, by agent</p>
        </div>
        <button
          type="button"
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors"
          title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">Revenue</p>
          <div className="text-lg font-bold text-[#10b981]">{formatINR(totalRevenue)}</div>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Subscription sales</p>
          <div className="text-lg font-bold text-[var(--text-main)]">{totalSales}</div>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Subscribed leads</p>
          <div className="text-lg font-bold text-[var(--text-main)]">{totalSubscribed}</div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">
          No subscription payments were completed through the CRM in this period.
        </p>
      ) : (
        <>
          <div className={`${isFullScreen ? "h-[60vh]" : "h-[240px]"} mb-4 w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                <XAxis dataKey="name" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={CRM_CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatINR(Number(v))}
                  width={70}
                />
                <Tooltip
                  {...CRM_CHART_TOOLTIP}
                  formatter={(value: any, key: any) =>
                    key === "revenue" ? [formatINR(Number(value)), "Revenue"] : [value, key]
                  }
                />
                <Bar dataKey="revenue" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {top ? (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">TOP REVENUE GENERATOR</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-main)]">{top.name}</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#10b981]">{formatINR(top.revenue)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {top.sales} sale{top.sales === 1 ? "" : "s"} · {top.subscribedLeads} subscribed lead
                    {top.subscribedLeads === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
