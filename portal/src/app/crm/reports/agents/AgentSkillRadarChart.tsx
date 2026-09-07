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

interface AgentSkillRadarChartProps {
  agents: any[];
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

    // Calculate max possible values to normalize 0-100
    let maxCalls = 1;
    let maxConversions = 1;
    let maxFollowUps = 1;
    let maxSpeedScore = 1; // 100 max

    const agentStats = agents.map(agent => {
      const calls = agent.calls || 0;
      const leads = agent.leadsCreated || 0;
      const conversions = agent.leadsConverted || 0;
      const activities = agent.activities || 0;
      
      const conversionRate = leads > 0 ? (conversions / leads) * 100 : 0;
      const followUpRate = leads > 0 ? Math.min((activities / (leads * 3)) * 100, 100) : 0;
      
      // Speed score approximation
      const activitiesPerLead = leads > 0 ? activities / leads : (activities > 0 ? 5 : 0);
      const speedScore = Math.min(activitiesPerLead * 20, 100);

      maxCalls = Math.max(maxCalls, calls);
      maxConversions = Math.max(maxConversions, conversionRate);
      maxFollowUps = Math.max(maxFollowUps, followUpRate);
      maxSpeedScore = Math.max(maxSpeedScore, speedScore);

      return {
        id: agent.agentId,
        name: agent.name || "Unknown Agent",
        calls,
        conversionRate,
        followUpRate,
        speedScore,
      };
    });

    // Calculate Team Average (Normalized 0-100)
    const avgCalls = agentStats.reduce((sum, a) => sum + a.calls, 0) / agentStats.length;
    const avgConversion = agentStats.reduce((sum, a) => sum + a.conversionRate, 0) / agentStats.length;
    const avgFollowUp = agentStats.reduce((sum, a) => sum + a.followUpRate, 0) / agentStats.length;
    const avgSpeed = agentStats.reduce((sum, a) => sum + a.speedScore, 0) / agentStats.length;

    // Select the target agent (Top performer by default)
    let target = agentStats[0];
    if (selectedAgentId) {
      const found = agentStats.find(a => a.id === selectedAgentId);
      if (found) target = found;
    } else {
      // Find top performer by combined score
      target = agentStats.reduce((max, a) => 
        (a.conversionRate + a.followUpRate + a.speedScore) > 
        (max.conversionRate + max.followUpRate + max.speedScore) ? a : max
      , agentStats[0]);
    }

    if (!target) return null;

    return [
      {
        subject: "Call Volume",
        "Team Average": Math.round((avgCalls / maxCalls) * 100),
        [target.name]: Math.round((target.calls / maxCalls) * 100),
        fullMark: 100,
      },
      {
        subject: "Conversion Rate",
        "Team Average": Math.round((avgConversion / maxConversions) * 100),
        [target.name]: Math.round((target.conversionRate / maxConversions) * 100),
        fullMark: 100,
      },
      {
        subject: "Follow-up Adherence",
        "Team Average": Math.round((avgFollowUp / maxFollowUps) * 100),
        [target.name]: Math.round((target.followUpRate / maxFollowUps) * 100),
        fullMark: 100,
      },
      {
        subject: "Response Speed",
        "Team Average": Math.round((avgSpeed / maxSpeedScore) * 100),
        [target.name]: Math.round((target.speedScore / maxSpeedScore) * 100),
        fullMark: 100,
      },
    ];
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
