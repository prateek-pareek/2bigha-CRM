"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_SECONDARY,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

interface AgentComparisonChartProps {
  agents: any[];
  loading: boolean;
}

export default function AgentComparisonChart({ agents, loading }: AgentComparisonChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (loading) {
    return <ReportChartSkeleton type="bar" height="350px" />;
  }

  // Prepare data - sort by total activity score (calls + leads created)
  const chartData = agents
    .map((agent) => {
      let displayName = agent.name || "Unknown Agent";
      if (displayName === "Unknown agent" || displayName === "Unknown Agent") {
        displayName = `Agent #${agent.agentId?.slice(-4) || "N/A"}`;
      } else {
        displayName = displayName.split(" ").slice(0, 2).join(" ");
      }
      return {
        name: displayName,
        calls: agent.calls || 0,
        leadsCreated: agent.leadsCreated || 0,
        leadsConverted: agent.leadsConverted || 0,
        score: (agent.calls || 0) + (agent.leadsCreated || 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Top 10 agents

  if (chartData.length === 0) return null;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : ''}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Agent Performance Ranking</h3>
          <p className="text-xs text-[var(--text-muted)]">Top agents by calls and leads created</p>
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

      <div className={`${isFullScreen ? 'h-[calc(100vh-200px)]' : 'h-[300px]'} w-full transition-all`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 40 }}
          >
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
            <Tooltip {...CRM_CHART_TOOLTIP} cursor={{ fill: "var(--surface-dim)", opacity: 0.5 }} />
            <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontWeight: 600 }} />
            <Bar dataKey="calls" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} />
            <Bar dataKey="leadsCreated" fill={CRM_CHART_SUCCESS} radius={[6, 6, 0, 0]} />
            <Bar dataKey="leadsConverted" fill={CRM_CHART_SECONDARY} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-color)] pt-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: CRM_CHART_PRIMARY }} />
          <span className="text-xs font-medium text-[var(--text-muted)]">Calls</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: CRM_CHART_SUCCESS }} />
          <span className="text-xs font-medium text-[var(--text-muted)]">Leads Created</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: CRM_CHART_SECONDARY }} />
          <span className="text-xs font-medium text-[var(--text-muted)]">Leads Converted</span>
        </div>
      </div>
    </div>
  );
}
