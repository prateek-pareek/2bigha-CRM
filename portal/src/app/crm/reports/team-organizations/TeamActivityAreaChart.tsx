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
} from "recharts";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

interface TeamActivityAreaChartProps {
  trendData: {
    teams: string[];
    data: any[];
  } | null;
  loading: boolean;
}

const COLORS = [
  "#0c66e4", "#22c55e", "#f59e0b", "#8b5cf6", 
  "#ec4899", "#06b6d4", "#ef4444", "#10b981", "#6366f1"
];

// Custom Tooltip component for better styling
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dateObj = new Date(label);
    const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : label;
    
    // Sort payload so the highest values are at the top
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
    
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-3 rounded-lg shadow-lg text-sm min-w-[180px]">
        <p className="font-semibold text-[var(--text-main)] mb-2 border-b border-[var(--border-color)] pb-1">
          {dateStr}
        </p>
        <div className="space-y-1.5">
          {sortedPayload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-2.5 h-2.5 rounded-sm" 
                  style={{ backgroundColor: entry.color }} 
                />
                <span className="text-[var(--text-muted)] text-xs font-medium">{entry.name}</span>
              </div>
              <span className="text-[var(--text-main)] font-semibold text-xs">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function TeamActivityAreaChart({
  trendData,
  loading,
}: TeamActivityAreaChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Filter out teams that have 0 activity across the entire window
  const activeTeams = useMemo(() => {
    if (!trendData || !trendData.teams || !trendData.data) return [];
    return trendData.teams.filter(team => 
      trendData.data.some(d => (d[team] || 0) > 0)
    );
  }, [trendData]);

  // Format dates nicely for X axis
  const chartData = useMemo(() => {
    if (!trendData?.data) return [];
    return trendData.data.map(d => {
      const dateObj = new Date(d.date);
      const formattedDate = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : d.date;
      return {
        ...d,
        formattedDate,
      };
    });
  }, [trendData]);

  if (loading) {
    return <ReportChartSkeleton type="area" height="350px" />;
  }

  if (!trendData || trendData.data.length === 0 || activeTeams.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col justify-center items-center text-[var(--text-muted)] relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Team Activity Trends
        </h3>
        <p className="text-xs">No activity data available for this period.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : 'h-full'}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Team Activity Trends</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Activity volume progression over time across teams
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

      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              {activeTeams.map((team, index) => {
                const color = COLORS[index % COLORS.length];
                return (
                  <linearGradient key={`color-${team}`} id={`color-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="formattedDate" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }} 
              dy={10} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }} 
            />
            <Tooltip content={<CustomTooltip />} />
            
            {activeTeams.map((team, index) => (
              <Area
                key={team}
                type="monotone"
                dataKey={team}
                name={team}
                stackId="1"
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                fill={`url(#color-${index})`}
                animationDuration={1500}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
