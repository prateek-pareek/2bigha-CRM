"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_GRID,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";

interface AgentPerformanceTrendChartProps {
  trendData: any[];
  loading: boolean;
}

export default function AgentPerformanceTrendChart({
  trendData,
  loading,
}: AgentPerformanceTrendChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const formattedData = useMemo(() => {
    if (loading || !trendData || trendData.length === 0) return [];
    
    return trendData.map(d => {
      const date = new Date(d.date);
      return {
        ...d,
        displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
  }, [trendData, loading]);

  if (loading) {
    return <ReportChartSkeleton type="area" height="350px" />;
  }

  if (formattedData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-full flex flex-col justify-center items-center text-[var(--text-muted)] min-h-[350px]">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Performance Over Time
        </h3>
        <p className="text-xs">No trend data available for this period.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : ''}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Performance Over Time</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Daily volume of calls and leads generated across all selected agents
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

      <div className={`${isFullScreen ? 'flex-1 min-h-[400px]' : 'h-[350px]'} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={formattedData}
            margin={{ top: 10, right: 30, left: 0, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CRM_CHART_PRIMARY} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CRM_CHART_SUCCESS} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CRM_CHART_GRID} />
            <XAxis 
              dataKey="displayDate" 
              tick={CRM_CHART_TICK} 
              axisLine={false} 
              tickLine={false} 
              tickMargin={10} 
            />
            <YAxis 
              tick={CRM_CHART_TICK} 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={(value) => value === 0 ? '' : value}
            />
            <Tooltip 
              {...CRM_CHART_TOOLTIP}
              labelStyle={{ color: "var(--text-main)", fontWeight: "bold", marginBottom: "8px" }}
            />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingBottom: 10 }} />
            
            <Area 
              type="monotone" 
              name="Calls Made"
              dataKey="calls" 
              stroke={CRM_CHART_PRIMARY} 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorCalls)" 
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Area 
              type="monotone" 
              name="Leads Created"
              dataKey="leadsCreated" 
              stroke={CRM_CHART_SUCCESS} 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorLeads)" 
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
