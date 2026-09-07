"use client";

import { useMemo } from "react";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_SECONDARY,
} from "@/portals/crm/lib/shared/chart-theme";

interface ConversionFunnelChartProps {
  agents: any[];
  loading: boolean;
}

interface FunnelStage {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export default function ConversionFunnelChart({
  agents,
  loading,
}: ConversionFunnelChartProps) {
  const funnelData = useMemo(() => {
    if (loading || agents.length === 0) return null;

    // Aggregate metrics across all agents
    const totalCalls = agents.reduce((sum, a) => sum + (a.calls || 0), 0);
    const totalLeadsCreated = agents.reduce((sum, a) => sum + (a.leadsCreated || 0), 0);
    const totalLeadsConverted = agents.reduce((sum, a) => sum + (a.leadsConverted || 0), 0);

    if (totalCalls === 0) return null;

    const stages: FunnelStage[] = [
      {
        name: "Calls Made",
        value: totalCalls,
        percentage: 100,
        color: CRM_CHART_PRIMARY,
      },
      {
        name: "Leads Created",
        value: totalLeadsCreated,
        percentage: Math.round((totalLeadsCreated / totalCalls) * 100),
        color: CRM_CHART_SUCCESS,
      },
      {
        name: "Leads Converted",
        value: totalLeadsConverted,
        percentage: Math.round((totalLeadsConverted / totalCalls) * 100),
        color: CRM_CHART_SECONDARY,
      },
    ];

    return stages;
  }, [agents, loading]);

  if (loading) return null;

  if (!funnelData) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--card-bg)] p-6">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">Lead Conversion Funnel</h3>
        <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
          <p className="text-xs">No conversion data available for this period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Lead Conversion Funnel</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Call → Lead Created → Conversion flow across all agents
        </p>
      </div>

      <div className="space-y-4">
        {funnelData.map((stage, index) => {
          // Calculate width percentage for visual representation
          const width = (stage.percentage / 100) * 100;
          // Calculate drop-off from previous stage
          const dropOff = index === 0 ? 0 : funnelData[index - 1].value - stage.value;
          const dropOffPct =
            index === 0 ? 0 : Math.round((dropOff / funnelData[index - 1].value) * 100);

          return (
            <div key={stage.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-[var(--text-main)]">
                    {stage.name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {stage.value.toLocaleString()} ({stage.percentage}%)
                  </span>
                </div>
                {index > 0 && (
                  <div className="text-right">
                    <span className="inline-block rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-semibold text-[#dc2626]">
                      ↓ {dropOffPct}%
                    </span>
                  </div>
                )}
              </div>

              {/* Funnel bar */}
              <div className="relative h-12 overflow-hidden rounded-lg bg-[var(--surface-dim)]">
                <div
                  className="flex items-center justify-end pr-4 transition-all duration-300"
                  style={{
                    width: `${width}%`,
                    backgroundColor: stage.color,
                    height: "100%",
                  }}
                >
                  <span className="text-xs font-bold text-white">{stage.percentage}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary insights */}
      <div className="mt-6 border-t border-[var(--border-color)] pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-[var(--surface-dim)] p-3">
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Leads from Calls
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
              {funnelData[1].percentage}%
            </p>
          </div>
          <div className="rounded-lg bg-[var(--surface-dim)] p-3">
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Conversion Rate
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
              {funnelData[2].percentage}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
