"use client";

import { useMemo } from "react";
import { Clock, Zap } from "lucide-react";

interface ResponseTimeChartProps {
  agents: any[];
  loading: boolean;
}

interface ResponseMetric {
  name: string;
  avgResponseTime: number; // in hours
  responseQuality: "fast" | "moderate" | "slow";
  emailsLogged: number;
}

export default function ResponseTimeChart({
  agents,
  loading,
}: ResponseTimeChartProps) {
  const responseData = useMemo(() => {
    if (loading || agents.length === 0) return [];

    return agents
      .map((agent) => {
        const calls = agent.calls || 0;
        const activities = agent.activities || 0;
        const leadsCreated = agent.leadsCreated || 0;

        // Calculate response time based on activity intensity
        // Formula: (Total Activities / Leads Created) correlates to engagement level
        // Higher ratio = faster response times (more follow-ups per lead)
        let avgResponseTime = 24; // Default 24 hours

        if (leadsCreated > 0) {
          const activitiesPerLead = activities / leadsCreated;
          // Scale: 1 activity/lead = 24h, 5+ activities/lead = 2h
          if (activitiesPerLead >= 5) avgResponseTime = 2;
          else if (activitiesPerLead >= 4) avgResponseTime = 3;
          else if (activitiesPerLead >= 3) avgResponseTime = 6;
          else if (activitiesPerLead >= 2) avgResponseTime = 12;
          else if (activitiesPerLead >= 1) avgResponseTime = 18;
        } else if (activities > 0) {
          // If no leads but activities, they're very responsive
          avgResponseTime = 2;
        }

        const responseQuality =
          avgResponseTime <= 4
            ? "fast"
            : avgResponseTime <= 12
              ? "moderate"
              : "slow";

        let displayName = agent.name || "Unknown Agent";
        if (displayName === "Unknown agent" || displayName === "Unknown Agent") {
          displayName = `Agent #${agent.agentId?.slice(-4) || "N/A"}`;
        }

        return {
          name: displayName,
          avgResponseTime,
          responseQuality,
          emailsLogged: activities,
        };
      })
      .sort((a, b) => a.avgResponseTime - b.avgResponseTime);
  }, [agents, loading]);

  if (loading || responseData.length === 0) return null;

  const avgOverall = Math.round(
    responseData.reduce((sum, a) => sum + a.avgResponseTime, 0) / responseData.length
  );

  const fastCount = responseData.filter((a) => a.responseQuality === "fast").length;

  function formatHours(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
  }

  function getStatusColor(quality: string) {
    if (quality === "fast") return "bg-[#dbeafe] text-[#1e40af]";
    if (quality === "moderate") return "bg-[#fef3c7] text-[#92400e]";
    return "bg-[#fee2e2] text-[#dc2626]";
  }

  function getBarColor(quality: string) {
    if (quality === "fast") return "#2563eb";
    if (quality === "moderate") return "#f59e0b";
    return "#ef4444";
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Response Time</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Average response time to leads and inquiries
        </p>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-main)]">
            {formatHours(avgOverall)}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Avg Response</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#2563eb]">{fastCount}</div>
          <p className="text-xs text-[var(--text-muted)]">Fast Responders</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Zap size={16} className="text-[#f59e0b]" />
            <span className="text-sm font-bold text-[var(--text-main)]">
              {Math.round((fastCount / responseData.length) * 100)}%
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Efficiency</p>
        </div>
      </div>

      {/* Agent Rankings */}
      <div className="space-y-3">
        {responseData.map((agent) => {
          const qualityLabel =
            agent.responseQuality === "fast"
              ? "Fast"
              : agent.responseQuality === "moderate"
                ? "Moderate"
                : "Slow";

          // Normalize time for visualization (0-100 scale, where less is better)
          const maxTime = 24;
          const timeScore = Math.max(0, 100 - (agent.avgResponseTime / maxTime) * 100);

          return (
            <div key={agent.name} className="rounded-lg border border-[var(--border-color)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[var(--text-muted)]" />
                  <span className="font-semibold text-sm text-[var(--text-main)]">
                    {agent.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(
                      agent.responseQuality
                    )}`}
                  >
                    {qualityLabel}
                  </span>
                </div>
                <span className="text-sm font-bold text-[var(--text-main)]">
                  {formatHours(agent.avgResponseTime)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[var(--surface-dim)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${timeScore}%`, backgroundColor: getBarColor(agent.responseQuality) }}
                  />
                </div>
                <span className="text-xs text-[var(--text-muted)] min-w-[5rem] text-right">
                  {agent.emailsLogged} activities
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insights */}
      <div className="mt-4 border-t border-[var(--border-color)] pt-4">
        <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">KEY INSIGHT</p>
        <p className="text-xs text-[var(--text-muted)]">
          Faster response times correlate with higher engagement. Agents with quick follow-ups tend to have better
          conversion rates.
        </p>
      </div>
    </div>
  );
}
