"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_DANGER,
  CRM_CHART_TOOLTIP
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

interface OrganizationTargetGaugeProps {
  teams: any[];
  loading: boolean;
}

export default function OrganizationTargetGauge({
  teams,
  loading,
}: OrganizationTargetGaugeProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const gaugeData = useMemo(() => {
    if (loading || teams.length === 0) return null;

    // Sum all leads converted vs total target (we'll estimate target for gauge purposes since Team Target API might not exist yet)
    // If teams have no target, we'll establish a baseline goal based on their size (e.g. 10 leads per agent)
    const totalLeadsConverted = teams.reduce((sum, t) => sum + (t.leadsConverted || 0), 0);
    const totalTeamSize = teams.reduce((sum, t) => sum + (t.teamSize || 0), 0);
    
    const macroTarget = Math.max(totalTeamSize * 15, 10); // Example target: 15 conversions per team member
    const pctAchieved = Math.min(100, Math.round((totalLeadsConverted / macroTarget) * 100));
    
    // For a semi-circle gauge (180 degrees), we need two data points that sum to 100
    return {
      achieved: totalLeadsConverted,
      target: macroTarget,
      percentage: pctAchieved,
      chart: [
        { name: "Achieved", value: pctAchieved, color: pctAchieved >= 80 ? CRM_CHART_SUCCESS : pctAchieved >= 50 ? CRM_CHART_PRIMARY : CRM_CHART_DANGER },
        { name: "Remaining", value: 100 - pctAchieved, color: "var(--surface-dim)" }
      ]
    };
  }, [teams, loading]);

  if (loading) {
    return <ReportChartSkeleton type="pie" height="300px" />;
  }

  if (!gaugeData) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-full flex flex-col justify-center items-center text-[var(--text-muted)] min-h-[300px]">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Organization Target
        </h3>
        <p className="text-xs">No active teams found.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : 'h-full'}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Organization Target</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Macro progress toward global lead conversion goal
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

      <div className={`${isFullScreen ? 'flex-1 min-h-[400px]' : 'flex-1 min-h-[250px]'} w-full flex flex-col items-center justify-center relative`}>
        <div className="w-full h-[80%]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData.chart}
                cx="50%"
                cy="80%" // Move down for semi-circle
                startAngle={180}
                endAngle={0}
                innerRadius={isFullScreen ? 150 : 80}
                outerRadius={isFullScreen ? 200 : 110}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {gaugeData.chart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                {...CRM_CHART_TOOLTIP}
                formatter={(value: any) => [`${value}%`, "Progress"] as any}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Needle/Metric Display Overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-4xl font-black" style={{ color: gaugeData.chart[0].color }}>
            {gaugeData.percentage}%
          </p>
          <p className="text-sm font-semibold text-[var(--text-main)] mt-1">
            {gaugeData.achieved} / {gaugeData.target} Conversions
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {gaugeData.percentage >= 100 ? "Goal Exceeded! 🎉" : gaugeData.percentage >= 80 ? "On Track" : "Needs Attention"}
          </p>
        </div>
      </div>
    </div>
  );
}
