"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";

interface RevenueAttributionChartProps {
  agents: any[];
  loading: boolean;
}

export default function RevenueAttributionChart({
  agents,
  loading,
}: RevenueAttributionChartProps) {
  const chartData = useMemo(() => {
    if (loading || agents.length === 0) return [];

    // Calculate estimated revenue based on lead conversion
    // Formula: Each converted lead = base value, weighted by activity level
    const baseLeadValue = 5000; // Base revenue per converted lead
    const activityMultiplier = 0.02; // Additional revenue per activity

    return agents
      .map((agent) => {
        const leadsConverted = agent.leadsConverted || 0;
        const activities = agent.activities || 0;

        // Revenue calculation: base converted leads + activity-based bonus
        const baseRevenue = leadsConverted * baseLeadValue;
        const activityBonus = activities * activityMultiplier * baseLeadValue;
        const totalRevenue = Math.round(baseRevenue + activityBonus);

        let displayName = agent.name || "Unknown Agent";
        if (displayName === "Unknown agent" || displayName === "Unknown Agent") {
          displayName = `Agent #${agent.agentId?.slice(-4) || "N/A"}`;
        } else {
          displayName = displayName.split(" ").slice(0, 2).join(" ");
        }

        return {
          name: displayName,
          revenue: totalRevenue,
          leadsConverted,
          activities,
          revenuePerLead: leadsConverted > 0 ? Math.round(totalRevenue / leadsConverted) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 agents
  }, [agents, loading]);

  if (loading || chartData.length === 0) return null;

  const totalRevenue = chartData.reduce((sum, a) => sum + a.revenue, 0);
  const avgRevenuePerAgent = Math.round(totalRevenue / chartData.length);

  function formatRevenue(value: number): string {
    if (value >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Revenue Attribution</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Estimated revenue generated per agent (based on conversions & activities)
        </p>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-main)]">{formatRevenue(totalRevenue)}</div>
          <p className="text-xs text-[var(--text-muted)]">Total Revenue</p>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[#10b981]">{formatRevenue(avgRevenuePerAgent)}</div>
          <p className="text-xs text-[var(--text-muted)]">Avg per Agent</p>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--text-main)]">{chartData.length}</div>
          <p className="text-xs text-[var(--text-muted)]">Agents Tracked</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px] w-full mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CRM_CHART_GRID} />
            <XAxis
              dataKey="name"
              tick={CRM_CHART_TICK}
              axisLine={false}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              {...CRM_CHART_TOOLTIP}
              formatter={(value) => (typeof value === "number" ? formatRevenue(value) : "—")}
              labelFormatter={(label) => `Agent: ${label}`}
            />
            <Bar dataKey="revenue" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Performer */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
        <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">TOP REVENUE GENERATOR</p>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-[var(--text-main)]">{chartData[0]?.name}</span>
          <div className="text-right">
            <p className="text-sm font-bold text-[#10b981]">{formatRevenue(chartData[0]?.revenue || 0)}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {chartData[0]?.leadsConverted} conversions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
