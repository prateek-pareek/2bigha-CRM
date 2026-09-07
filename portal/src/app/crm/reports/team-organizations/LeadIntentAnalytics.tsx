"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import {
  CRM_CHART_SERIES,
  CRM_CHART_TOOLTIP,
} from "@/portals/crm/lib/shared/chart-theme";

type IntentData = {
  intentLabel: string;
  totalWithIntent: number;
  converted: number;
};

interface LeadIntentAnalyticsProps {
  intentData: IntentData[];
  loading: boolean;
}

export default function LeadIntentAnalytics({
  intentData,
  loading,
}: LeadIntentAnalyticsProps) {
  const chartData = useMemo(() => {
    if (loading || !intentData || intentData.length === 0) return [];

    return intentData
      .map((intent) => ({
        name: intent.intentLabel,
        value: intent.totalWithIntent,
        converted: intent.converted,
        rate: intent.totalWithIntent > 0
          ? Math.round((intent.converted / intent.totalWithIntent) * 100)
          : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [intentData, loading]);

  if (loading || chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--card-bg)] p-6">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">Lead Intent Distribution</h3>
        <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
          <p className="text-xs">No intent data available</p>
        </div>
      </div>
    );
  }

  const totalLeads = chartData.reduce((sum, d) => sum + d.value, 0);
  const totalConverted = chartData.reduce((sum, d) => sum + d.converted, 0);
  const avgConversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Lead Intent Distribution</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Intent types and their conversion rates
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${(name || "").slice(0, 10)}: ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CRM_CHART_SERIES[index % CRM_CHART_SERIES.length]} />
                ))}
              </Pie>
              <Tooltip {...CRM_CHART_TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Intent Details */}
        <div className="space-y-3">
          {chartData.map((intent, idx) => (
            <div
              key={intent.name}
              className="rounded-lg border border-[var(--border-color)] p-3 hover:bg-[var(--surface-dim)] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: CRM_CHART_SERIES[idx % CRM_CHART_SERIES.length] }}
                  />
                  <span className="text-sm font-semibold text-[var(--text-main)]">
                    {intent.name}
                  </span>
                </div>
                <span className="text-xs font-bold text-[var(--text-main)]">
                  {intent.rate}% conversion
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{intent.value} leads</span>
                <span>{intent.converted} converted</span>
              </div>

              {/* Mini progress bar */}
              <div className="mt-2 h-1.5 w-full bg-[var(--surface-dim)] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${intent.rate}%`,
                    backgroundColor: CRM_CHART_SERIES[idx % CRM_CHART_SERIES.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-6 border-t border-[var(--border-color)] pt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-[var(--surface-dim)] p-3 text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Total Intents</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">{chartData.length}</p>
        </div>
        <div className="rounded-lg bg-[var(--surface-dim)] p-3 text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Leads w/ Intent</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
            {totalLeads.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--surface-dim)] p-3 text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Avg Conversion</p>
          <p className="mt-1 text-lg font-bold text-[#10b981]">{avgConversionRate}%</p>
        </div>
      </div>
    </div>
  );
}
