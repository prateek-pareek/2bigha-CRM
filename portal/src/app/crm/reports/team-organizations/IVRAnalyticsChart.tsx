"use client";
// TS-check trigger

import { useMemo, useState } from "react";
import { Clock, PhoneOff, PhoneMissed, Maximize2, Minimize2 } from "lucide-react";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

type TeamData = {
  teamName: string;
  incomingCalls: number;
  missedCalls: number;
  completedCalls: number;
  avgCallDuration: number;
};

interface IVRAnalyticsChartProps {
  teamData: TeamData[];
  loading: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

export default function IVRAnalyticsChart({
  teamData,
  loading,
}: IVRAnalyticsChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const analyticsData = useMemo(() => {
    if (loading || !teamData || teamData.length === 0) return [];

    return teamData
      .map((team) => {
        let displayName = team.teamName || "Team";
        if (displayName.length > 12) {
          displayName = displayName.slice(0, 10) + "...";
        }

        const incoming = team.incomingCalls || 0;
        const missed = team.missedCalls || 0;
        const completed = team.completedCalls || 0;

        const missedRate = incoming > 0 ? Math.round((missed / incoming) * 100) : 0;
        const completionRate = incoming > 0 ? Math.round((completed / incoming) * 100) : 0;

        return {
          name: displayName,
          incoming,
          missed,
          completed,
          missedRate,
          completionRate,
          avgDuration: team.avgCallDuration || 0,
        };
      })
      .sort((a, b) => b.incoming - a.incoming)
      .slice(0, 8);
  }, [teamData, loading]);

  if (loading) {
    return <ReportChartSkeleton type="bar" height="350px" />;
  }

  if (analyticsData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col items-center justify-center relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">IVR Call Analytics</h3>
        <p className="text-xs text-[var(--text-muted)]">No IVR data available</p>
      </div>
    );
  }

  const totalIncoming = analyticsData.reduce((sum, d) => sum + d.incoming, 0);
  const totalMissed = analyticsData.reduce((sum, d) => sum + d.missed, 0);
  const totalCompleted = analyticsData.reduce((sum, d) => sum + d.completed, 0);
  const overallMissedRate = totalIncoming > 0 ? Math.round((totalMissed / totalIncoming) * 100) : 0;
  const overallCompletionRate = totalIncoming > 0 ? Math.round((totalCompleted / totalIncoming) * 100) : 0;
  const avgDuration = analyticsData.length > 0
    ? Math.round(analyticsData.reduce((sum, d) => sum + d.avgDuration, 0) / analyticsData.length)
    : 0;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl flex flex-col' : 'h-full flex flex-col'}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">IVR Call Analytics</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Inbound call metrics and missed call rates
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

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-4 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Total Incoming</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
            {totalIncoming.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Completed</p>
          <p className="mt-1 text-lg font-bold text-[#10b981]">{overallCompletionRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Missed</p>
          <p className="mt-1 text-lg font-bold text-[#ef4444]">{overallMissedRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Avg Duration</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
            {formatDuration(avgDuration)}
          </p>
        </div>
      </div>

      {/* Team Details */}
      <div className={`space-y-3 flex-1 flex flex-col justify-center min-h-[300px] ${isFullScreen ? 'overflow-auto' : ''}`}>
        {analyticsData.map((team) => {
          const completionBarColor = team.completionRate >= 70 ? "#10b981" : team.completionRate >= 50 ? "#f59e0b" : "#ef4444";

          return (
            <div
              key={team.name}
              className="rounded-lg border border-[var(--border-color)] p-4 hover:bg-[var(--surface-dim)] transition-colors"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-sm text-[var(--text-main)]">{team.name}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-bold text-[#10b981]">{team.completionRate}%</p>
                    <p className="text-xs text-[var(--text-muted)]">completion</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-[#ef4444]">{team.missedRate}%</p>
                    <p className="text-xs text-[var(--text-muted)]">missed</p>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                <div className="flex items-center gap-1 text-[var(--text-muted)]">
                  <PhoneOff size={12} />
                  <span>{team.incoming} calls</span>
                </div>
                <div className="flex items-center gap-1 text-[var(--text-muted)]">
                  <Clock size={12} />
                  <span>{formatDuration(team.avgDuration)}</span>
                </div>
                <div className="flex items-center gap-1 text-[var(--text-muted)]">
                  <PhoneMissed size={12} />
                  <span>{team.missed} missed</span>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Completion</span>
                    <span className="text-xs font-bold text-[var(--text-main)]">{team.completionRate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--surface-dim)] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${team.completionRate}%`, backgroundColor: completionBarColor }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border-color)] pt-4 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded bg-[#10b981]" />
          <span>Healthy (70%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded bg-[#f59e0b]" />
          <span>Moderate (50-70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded bg-[#ef4444]" />
          <span>Poor (Below 50%)</span>
        </div>
      </div>
    </div>
  );
}
