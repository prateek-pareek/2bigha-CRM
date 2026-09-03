"use client";

import { useMemo } from "react";
import { CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import {
  CRM_CHART_SUCCESS,
  CRM_CHART_DANGER,
  CRM_CHART_PRIMARY,
} from "@/portals/crm/lib/shared/chart-theme";

interface FollowUpAdherenceChartProps {
  agents: any[];
  loading: boolean;
}

interface AdherenceMetric {
  name: string;
  adherenceRate: number;
  activities: number;
  leadsCreated: number;
  status: "excellent" | "good" | "needs-attention";
}

export default function FollowUpAdherenceChart({
  agents,
  loading,
}: FollowUpAdherenceChartProps) {
  const adheranceData = useMemo(() => {
    if (loading || agents.length === 0) return [];

    return agents
      .map((agent) => {
        const leadsCreated = agent.leadsCreated || 0;
        const leadsConverted = agent.leadsConverted || 0;
        const activities = agent.activities || 0;

        // Follow-up adherence formula:
        // (Activities / (Leads Created * Expected Activities per Lead)) * 100
        // Expected: 3 activities per lead (initial contact + 2 follow-ups minimum)
        // For converted leads, expect higher activity
        const expectedActivities = leadsCreated * 3;
        const adherenceRate =
          expectedActivities > 0 ? Math.min(100, Math.round((activities / expectedActivities) * 100)) : 0;

        const status =
          adherenceRate >= 75
            ? "excellent"
            : adherenceRate >= 50
              ? "good"
              : "needs-attention";

        let displayName = agent.name || "Unknown Agent";
        if (displayName === "Unknown agent" || displayName === "Unknown Agent") {
          displayName = `Agent #${agent.agentId?.slice(-4) || "N/A"}`;
        }

        return {
          name: displayName,
          adherenceRate,
          activities,
          leadsCreated,
          status,
        };
      })
      .sort((a, b) => b.adherenceRate - a.adherenceRate);
  }, [agents, loading]);

  if (loading || adheranceData.length === 0) return null;

  const avgAdherence = Math.round(
    adheranceData.reduce((sum, a) => sum + a.adherenceRate, 0) / adheranceData.length
  );

  const excellentCount = adheranceData.filter((a) => a.status === "excellent").length;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Follow-up Adherence</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Activity engagement per lead created across team
        </p>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-main)]">{avgAdherence}%</div>
          <p className="text-xs text-[var(--text-muted)]">Avg Adherence</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#10b981]">{excellentCount}</div>
          <p className="text-xs text-[var(--text-muted)]">Excellent</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-main)]">
            {adheranceData.length}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Agents</p>
        </div>
      </div>

      {/* Agent Rankings */}
      <div className="space-y-3">
        {adheranceData.map((agent) => {
          const bgColor =
            agent.status === "excellent"
              ? "bg-[#dbeafe]"
              : agent.status === "good"
                ? "bg-[#fef3c7]"
                : "bg-[#fee2e2]";
          const textColor =
            agent.status === "excellent"
              ? "text-[#1e40af]"
              : agent.status === "good"
                ? "text-[#92400e]"
                : "text-[#dc2626]";
          const barColor =
            agent.status === "excellent" ? CRM_CHART_PRIMARY : agent.status === "good" ? "#f59e0b" : CRM_CHART_DANGER;

          return (
            <div key={agent.name} className="rounded-lg border border-[var(--border-color)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--text-main)]">{agent.name}</span>
                  <span className={`rounded-full ${bgColor} px-2 py-0.5 text-xs font-semibold ${textColor}`}>
                    {agent.status === "excellent"
                      ? "Excellent"
                      : agent.status === "good"
                        ? "Good"
                        : "Needs Attention"}
                  </span>
                </div>
                <span className="text-sm font-bold text-[var(--text-main)]">{agent.adherenceRate}%</span>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[var(--surface-dim)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${agent.adherenceRate}%`, backgroundColor: barColor }}
                  />
                </div>
                <span className="text-xs text-[var(--text-muted)] min-w-[6rem] text-right">
                  {agent.activities} activities / {agent.leadsCreated} leads
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border-color)] pt-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CRM_CHART_PRIMARY }} />
          <span className="text-xs text-[var(--text-muted)]">Excellent (70%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded bg-[#f59e0b]" />
          <span className="text-xs text-[var(--text-muted)]">Good (50-70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CRM_CHART_DANGER }} />
          <span className="text-xs text-[var(--text-muted)]">Needs Attention (Below 50%)</span>
        </div>
      </div>
    </div>
  );
}
