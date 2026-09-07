"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
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
  CRM_CHART_GRID,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

// Generate a professional palette of colors for the teams
const TEAM_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#8b5cf6", // Violet
  "#f43f5e", // Rose
];

interface TeamPerformanceTrendChartProps {
  trendData: {
    teams: string[];
    data: any[];
  } | null;
  loading: boolean;
}

export default function TeamPerformanceTrendChart({
  trendData,
  loading,
}: TeamPerformanceTrendChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const formattedData = useMemo(() => {
    if (loading || !trendData || !trendData.data || trendData.data.length === 0) return [];
    
    return trendData.data.map(d => {
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

  if (formattedData.length === 0 || !trendData) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col justify-center items-center text-[var(--text-muted)] relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Team Growth Trajectory
        </h3>
        <p className="text-xs">No trend data available for this period.</p>
      </div>
    );
  }

  // Filter out teams that have 0 leads across all days to keep chart clean
  const activeTeams = trendData.teams.filter(team => {
    return formattedData.some(day => day[team] > 0);
  });

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : ''}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Team Growth Trajectory</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Daily lead generation across all active teams (Stacked)
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
              {activeTeams.map((team, index) => (
                <linearGradient key={`grad-${team}`} id={`color-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEAM_COLORS[index % TEAM_COLORS.length]} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={TEAM_COLORS[index % TEAM_COLORS.length]} stopOpacity={0.2} />
                </linearGradient>
              ))}
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
            
            {activeTeams.map((team, index) => (
              <Area 
                key={team}
                type="monotone" 
                name={team}
                dataKey={team} 
                stackId="1"
                stroke={TEAM_COLORS[index % TEAM_COLORS.length]} 
                strokeWidth={2}
                fillOpacity={1} 
                fill={`url(#color-${index})`} 
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
