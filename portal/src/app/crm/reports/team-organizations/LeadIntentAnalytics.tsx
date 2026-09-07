"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import {
  CRM_CHART_SERIES,
  CRM_CHART_TOOLTIP,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

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
  const [isFullScreen, setIsFullScreen] = useState(false);

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

  if (loading) {
    return <ReportChartSkeleton type="pie" height="350px" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col items-center justify-center relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">Lead Intent Distribution</h3>
        <p className="text-xs text-[var(--text-muted)]">No intent data available</p>
      </div>
    );
  }

  const totalLeads = chartData.reduce((sum, d) => sum + d.value, 0);
  const totalConverted = chartData.reduce((sum, d) => sum + d.converted, 0);
  const avgConversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : 'h-full'}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Lead Intent Distribution</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Intent types and their conversion rates
          </p>
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

      <div className={`grid grid-cols-1 gap-6 flex-1 items-center ${isFullScreen ? 'lg:grid-cols-2 lg:h-[calc(100vh-250px)]' : 'lg:grid-cols-2 min-h-[300px]'}`}>
        {/* Pie Chart */}
        <div className={isFullScreen ? 'h-full min-h-[400px] flex items-center justify-center' : 'h-[300px] flex items-center justify-center'}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={isFullScreen ? "50%" : "55%"}
                outerRadius={isFullScreen ? "70%" : "80%"}
                paddingAngle={2}
                fill="#8884d8"
                dataKey="value"
                stroke="none"
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
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CRM_CHART_SERIES[idx % CRM_CHART_SERIES.length] }}
                  />
                  <span className="text-sm font-semibold text-[var(--text-main)] truncate">
                    {intent.name}
                  </span>
                </div>
                <span className="text-xs font-bold text-[var(--text-main)] whitespace-nowrap">
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
