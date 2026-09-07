"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_SECONDARY,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

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
  const [isFullScreen, setIsFullScreen] = useState(false);

  const funnelData = useMemo(() => {
    if (loading || agents.length === 0) return null;

    // Aggregate metrics across all agents
    const totalCalls = agents.reduce((sum, a) => sum + (a.calls || 0), 0);
    const totalLeadsCreated = agents.reduce((sum, a) => sum + (a.leadsCreated || 0), 0);
    const totalLeadsConverted = agents.reduce((sum, a) => sum + (a.leadsConverted || 0), 0);

    if (totalCalls === 0 && totalLeadsCreated === 0 && totalLeadsConverted === 0) return null;

    // The funnel's 100% width is the maximum volume among the stages (usually Calls)
    const maxVolume = Math.max(totalCalls, totalLeadsCreated, totalLeadsConverted, 1);

    const stages: FunnelStage[] = [
      {
        name: "Calls Made",
        value: totalCalls,
        percentage: Math.round((totalCalls / maxVolume) * 100),
        color: CRM_CHART_PRIMARY,
      },
      {
        name: "Leads Created",
        value: totalLeadsCreated,
        percentage: Math.round((totalLeadsCreated / maxVolume) * 100),
        color: CRM_CHART_SUCCESS,
      },
      {
        name: "Leads Converted",
        value: totalLeadsConverted,
        percentage: Math.round((totalLeadsConverted / maxVolume) * 100),
        color: CRM_CHART_SECONDARY,
      },
    ];

    return stages;
  }, [agents, loading]);

  if (loading) {
    return <ReportChartSkeleton type="bar" height="350px" />;
  }

  if (!funnelData) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col justify-center items-center text-[var(--text-muted)] relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Aggregate Conversion Funnel
        </h3>
        <p className="text-xs">No volume data to construct funnel.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : ''}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Lead Conversion Funnel</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Call → Lead Created → Conversion flow across all agents
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

      <div className="space-y-6 flex flex-col items-center justify-center py-4 relative">
        {/* Central connecting line behind the funnel */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--border-color)] left-1/2 -translate-x-1/2 z-0" />

        {funnelData.map((stage, index) => {
          const width = Math.max(stage.percentage, 5); // Minimum 5% width so label is visible
          
          // Calculate drop-off from previous stage
          const dropOff = index === 0 ? 0 : funnelData[index - 1].value - stage.value;
          let dropOffPct = 0;
          if (index > 0 && funnelData[index - 1].value > 0) {
            dropOffPct = Math.round((dropOff / funnelData[index - 1].value) * 100);
          } else if (index > 0 && funnelData[index - 1].value === 0 && stage.value > 0) {
            // Edge case: Previous was 0, but current is > 0 (invalid funnel flow, e.g. mock data)
            dropOffPct = 0; // Don't show negative infinity
          }

          return (
            <div key={stage.name} className="w-full flex flex-col items-center z-10 group relative">
              <div className="w-full max-w-sm relative">
                {/* Stage Info */}
                <div className="absolute -top-5 left-0 right-0 flex justify-between items-end px-2">
                  <span className="text-xs font-semibold text-[var(--text-main)]">
                    {stage.name} ({stage.value.toLocaleString()})
                  </span>
                  {index > 0 && dropOffPct !== 0 && (
                    <span className="text-[10px] font-bold text-[#dc2626]">
                      {dropOffPct > 0 ? `↓ ${dropOffPct}% drop` : `↑ ${Math.abs(dropOffPct)}% increase`}
                    </span>
                  )}
                </div>

                {/* Funnel Bar (Centered) */}
                <div className="w-full h-10 flex justify-center mt-2 group-hover:scale-[1.02] transition-transform">
                  <div
                    className="h-full rounded-md flex items-center justify-center relative overflow-hidden transition-all duration-500 ease-out shadow-sm"
                    style={{
                      width: `${width}%`,
                      backgroundColor: stage.color,
                    }}
                  >
                    <span className="text-xs font-bold text-white z-10 drop-shadow-sm">
                      {stage.percentage}%
                    </span>
                    {/* Glossy overlay effect for professional look */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                  </div>
                </div>

                {/* Tooltip on Hover */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none w-48 rounded-md bg-[var(--card-bg)] border border-[var(--border-color)] p-3 shadow-lg">
                  <p className="text-xs font-bold text-[var(--text-main)] mb-1">{stage.name}</p>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--text-muted)]">Count:</span>
                    <span className="font-semibold">{stage.value.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Of Max:</span>
                    <span className="font-semibold">{stage.percentage}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary insights */}
      <div className="mt-8 border-t border-[var(--border-color)] pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-[var(--surface-dim)] p-3 border border-[var(--border-color)]">
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Leads from Calls
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
              {funnelData[0].value > 0 ? Math.round((funnelData[1].value / funnelData[0].value) * 100) : 0}%
            </p>
          </div>
          <div className="rounded-lg bg-[var(--surface-dim)] p-3 border border-[var(--border-color)]">
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Overall Conversion
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
              {funnelData[1].value > 0 ? Math.round((funnelData[2].value / funnelData[1].value) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
