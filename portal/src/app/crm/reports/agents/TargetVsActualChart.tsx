"use client";

import { useMemo } from "react";
import { CheckCircle2, AlertCircle, Circle } from "lucide-react";
import {
  CRM_CHART_SUCCESS,
  CRM_CHART_DANGER,
  CRM_CHART_PRIMARY,
} from "@/portals/crm/lib/shared/chart-theme";
import { cn } from "@/lib/utils";

interface TargetVsActualChartProps {
  agents: any[];
  loading: boolean;
}

interface AgentTargetStatus {
  name: string;
  callsProgress: number;
  leadsProgress: number;
  callsTarget: number;
  callsActual: number;
  leadsTarget: number;
  leadsActual: number;
  callsStatus: "completed" | "on-track" | "behind";
  leadsStatus: "completed" | "on-track" | "behind";
}

export default function TargetVsActualChart({
  agents,
  loading,
}: TargetVsActualChartProps) {
  const targetData = useMemo(() => {
    if (loading || agents.length === 0) return [];

    return agents
      .filter((agent) => agent.target) // Only agents with targets
      .map((agent) => {
        const callsProgress = Math.min(
          100,
          Math.round((agent.calls / agent.target.callsTarget) * 100)
        );
        const leadsProgress = Math.min(
          100,
          Math.round((agent.leadsCreated / agent.target.leadsTarget) * 100)
        );

        const callsStatus =
          callsProgress >= 100 ? "completed" : callsProgress >= 80 ? "on-track" : "behind";
        const leadsStatus =
          leadsProgress >= 100 ? "completed" : leadsProgress >= 80 ? "on-track" : "behind";

        let displayName = agent.name || "Unknown Agent";
        if (displayName === "Unknown agent" || displayName === "Unknown Agent") {
          displayName = `Agent #${agent.agentId?.slice(-4) || "N/A"}`;
        }

        return {
          name: displayName,
          callsProgress,
          leadsProgress,
          callsTarget: agent.target.callsTarget || 0,
          callsActual: agent.calls || 0,
          leadsTarget: agent.target.leadsTarget || 0,
          leadsActual: agent.leadsCreated || 0,
          callsStatus,
          leadsStatus,
        };
      })
      .sort((a, b) => {
        // Sort: completed > on-track > behind, then by progress
        const statusOrder = { completed: 3, "on-track": 2, behind: 1 };
        const aOrder = statusOrder[a.callsStatus as keyof typeof statusOrder];
        const bOrder = statusOrder[b.callsStatus as keyof typeof statusOrder];
        if (aOrder !== bOrder) return bOrder - aOrder;
        return b.callsProgress - a.callsProgress;
      });
  }, [agents, loading]);

  if (loading || targetData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Target vs Actual</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {loading ? "Loading..." : "No agents with targets set yet"}
        </p>
      </div>
    );
  }

  function StatusIcon({ status }: { status: string }) {
    if (status === "completed") {
      return <CheckCircle2 size={16} className="text-[#10b981]" />;
    }
    if (status === "on-track") {
      return <Circle size={16} className="text-[#2563eb] fill-[#2563eb]" />;
    }
    return <AlertCircle size={16} className="text-[#ef4444]" />;
  }

  function ProgressBar({
    actual,
    target,
    status,
  }: {
    actual: number;
    target: number;
    status: string;
  }) {
    const percentage = Math.min(100, (actual / target) * 100);
    const bgColor =
      status === "completed" ? CRM_CHART_SUCCESS : status === "on-track" ? CRM_CHART_PRIMARY : "#fca5a5";

    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-[var(--surface-dim)] rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${percentage}%`, backgroundColor: bgColor }}
          />
        </div>
        <span className="text-xs font-semibold text-[var(--text-muted)] min-w-[3rem] text-right">
          {Math.round(percentage)}%
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Target Achievement</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Agent progress toward goals (calls & leads)
        </p>
      </div>

      <div className="space-y-4">
        {targetData.map((agent) => (
          <div
            key={agent.name}
            className="rounded-lg border border-[var(--border-color)] p-4 hover:bg-[var(--surface-dim)] transition-colors"
          >
            {/* Agent name and overall status */}
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-sm text-[var(--text-main)]">{agent.name}</span>
              <div className="flex gap-2">
                <div
                  className="flex items-center gap-1.5 rounded-full bg-[var(--surface-dim)] px-2.5 py-1"
                  title="Calls target status"
                >
                  <StatusIcon status={agent.callsStatus} />
                  <span className="text-xs font-medium text-[var(--text-muted)]">Calls</span>
                </div>
                <div
                  className="flex items-center gap-1.5 rounded-full bg-[var(--surface-dim)] px-2.5 py-1"
                  title="Leads target status"
                >
                  <StatusIcon status={agent.leadsStatus} />
                  <span className="text-xs font-medium text-[var(--text-muted)]">Leads</span>
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Calls target */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Calls</span>
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    {agent.callsActual} / {agent.callsTarget}
                  </span>
                </div>
                <ProgressBar
                  actual={agent.callsActual}
                  target={agent.callsTarget}
                  status={agent.callsStatus}
                />
              </div>

              {/* Leads target */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Leads</span>
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    {agent.leadsActual} / {agent.leadsTarget}
                  </span>
                </div>
                <ProgressBar
                  actual={agent.leadsActual}
                  target={agent.leadsTarget}
                  status={agent.leadsStatus}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--border-color)] pt-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-[#10b981]" />
          <span className="text-xs text-[var(--text-muted)]">Target Achieved</span>
        </div>
        <div className="flex items-center gap-2">
          <Circle size={14} className="text-[#2563eb] fill-[#2563eb]" />
          <span className="text-xs text-[var(--text-muted)]">On Track (80%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-[#ef4444]" />
          <span className="text-xs text-[var(--text-muted)]">Behind (Below 80%)</span>
        </div>
      </div>
    </div>
  );
}
