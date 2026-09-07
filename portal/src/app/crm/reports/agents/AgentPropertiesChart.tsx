"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_TOOLTIP
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

interface AgentPropertiesChartProps {
  agents: any[];
  propertyCounts: Record<string, { propertyCount: number; farmCount: number }>;
  loading: boolean;
}

export default function AgentPropertiesChart({
  agents,
  propertyCounts,
  loading,
}: AgentPropertiesChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const chartData = useMemo(() => {
    if (loading || agents.length === 0) return null;

    let totalProperties = 0;
    let totalFarms = 0;

    agents.forEach(agent => {
      const counts = propertyCounts[agent.agentId];
      if (counts) {
        totalProperties += counts.propertyCount || 0;
        totalFarms += counts.farmCount || 0;
      }
    });

    if (totalProperties === 0 && totalFarms === 0) return null;

    return [
      { name: "Properties Listed", value: totalProperties, color: CRM_CHART_PRIMARY },
      { name: "Farms Listed", value: totalFarms, color: CRM_CHART_SECONDARY },
    ];
  }, [agents, propertyCounts, loading]);

  if (loading) {
    return <ReportChartSkeleton type="pie" height="300px" />;
  }

  if (!chartData) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-full flex flex-col justify-center items-center text-[var(--text-muted)] min-h-[300px]">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Portfolio Distribution
        </h3>
        <p className="text-xs">No active listings assigned to these agents.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : 'h-full'}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Portfolio Distribution</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Total properties vs farms assigned to selected agents
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

      <div className={`${isFullScreen ? 'flex-1 min-h-[400px]' : 'flex-1 min-h-[250px]'} w-full flex items-center justify-center`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={isFullScreen ? 120 : 70}
              outerRadius={isFullScreen ? 160 : 100}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                if (midAngle === undefined) return null;
                const RADIAN = Math.PI / 180;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text
                    x={x}
                    y={y}
                    fill="white"
                    textAnchor={x > cx ? 'start' : 'end'}
                    dominantBaseline="central"
                    className="text-xs font-bold"
                  >
                    {value}
                  </text>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              {...CRM_CHART_TOOLTIP}
              formatter={(value: any) => [`${value} Listings`, "Count"] as any}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
