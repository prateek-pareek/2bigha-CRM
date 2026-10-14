"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import type { AgentReportRow } from "../lib/performance-report";

interface AgentSkillRadarChartProps {
  agents: AgentReportRow[];
  loading: boolean;
}

export default function AgentSkillRadarChart({
  agents,
  loading,
}: AgentSkillRadarChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const radarData = useMemo(() => {
    if (loading || agents.length === 0) return null;

    // Five real dimensions, each normalised 0-100 against the best agent in scope.
    const stats = agents.map((a) => ({
      id: a.agentId,
      name: a.name || "Unknown Agent",
      calls: a.calls || 0,
      connectRate: a.connectRate || 0,
      conversionRate: a.conversionRate || 0,
      followUp: a.followUpAdherence ?? 0,
      // Faster first response = higher score; agents with no contacted leads score 0.
      speed: a.avgResponseMins == null ? 0 : 1 / (1 + a.avgResponseMins / 60),
    }));
    const max = (k: keyof (typeof stats)[number]) => Math.max(1e-9, ...stats.map((s) => Number(s[k]) || 0));
    const avg = (k: keyof (typeof stats)[number]) => stats.reduce((s, x) => s + (Number(x[k]) || 0), 0) / stats.length;
    const dims: Array<[string, keyof (typeof stats)[number]]> = [
      ["Call Volume", "calls"],
      ["Connect Rate", "connectRate"],
      ["Conversion Rate", "conversionRate"],
      ["Follow-up Adherence", "followUp"],
      ["Response Speed", "speed"],
    ];

    const target =
      (selectedAgentId && stats.find((s) => s.id === selectedAgentId)) ||
      stats.reduce((best, s) => {
        const score = (x: typeof s) => dims.reduce((t, [, k]) => t + (Number(x[k]) || 0) / max(k), 0);
        return score(s) > score(best) ? s : best;
      }, stats[0]);
    if (!target) return null;

    return dims.map(([subject, k]) => ({
      subject,
      "Team Average": Math.round((avg(k) / max(k)) * 100),
      [target.name]: Math.round(((Number(target[k]) || 0) / max(k)) * 100),
      fullMark: 100,
    }));
  }, [agents, loading, selectedAgentId]);

  if (loading) {
    return <ReportChartSkeleton type="pie" height="350px" />;
  }

  if (!radarData) return null;

  const targetAgentName = Object.keys(radarData[0]).find(k => k !== "subject" && k !== "Team Average" && k !== "fullMark") || "Agent";

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : ''}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Agent Skill Profile</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Multi-dimensional performance vs Team Average (Indexed 0-100)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isFullScreen && (
            <select
              value={selectedAgentId || ""}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="text-xs border border-[var(--border-color)] bg-[var(--surface-dim)] rounded-md px-2 py-1 text-[var(--text-main)] outline-none"
            >
              <option value="">Top Performer</option>
              {agents.map(a => (
                <option key={a.agentId} value={a.agentId}>{a.name}</option>
              ))}
            </select>
          )}
          <button 
            type="button" 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors"
            title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className={`${isFullScreen ? 'flex-1 min-h-[400px]' : 'h-[320px]'} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius={isFullScreen ? "70%" : "65%"} data={radarData}>
            <PolarGrid stroke="var(--border-color)" />
            <PolarAngleAxis dataKey="subject" tick={{ ...CRM_CHART_TICK, fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip {...CRM_CHART_TOOLTIP} />
            <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontWeight: 600 }} />
            
            {/* Team Average */}
            <Radar
              name="Team Average"
              dataKey="Team Average"
              stroke="#64748b"
              fill="#64748b"
              fillOpacity={0.2}
            />
            {/* Target Agent */}
            <Radar
              name={targetAgentName}
              dataKey={targetAgentName}
              stroke={CRM_CHART_PRIMARY}
              fill={CRM_CHART_PRIMARY}
              fillOpacity={0.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
