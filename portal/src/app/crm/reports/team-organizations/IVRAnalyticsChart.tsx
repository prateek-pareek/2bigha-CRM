"use client";

import { useMemo } from "react";
import { Clock, PhoneOff, PhoneMissed } from "lucide-react";

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

  if (loading || analyticsData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--card-bg)] p-6">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">IVR Call Analytics</h3>
        <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
          <p className="text-xs">No IVR data available</p>
        </div>
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
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">IVR Call Analytics</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Inbound call metrics and missed call rates
        </p>
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
      <div className="space-y-3">
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
