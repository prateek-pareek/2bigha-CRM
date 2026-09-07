"use client";

import { useMemo } from "react";
import {
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_SECONDARY,
} from "@/portals/crm/lib/shared/chart-theme";

type SourceData = {
  source: string;
  totalLeads: number;
  converted: number;
};

interface LeadSourceConversionChartProps {
  sourceData: SourceData[];
  loading: boolean;
}

export default function LeadSourceConversionChart({
  sourceData,
  loading,
}: LeadSourceConversionChartProps) {
  const funnelData = useMemo(() => {
    if (loading || !sourceData || sourceData.length === 0) return [];

    return sourceData
      .map((source) => {
        const conversionRate = source.totalLeads > 0
          ? Math.round((source.converted / source.totalLeads) * 100)
          : 0;

        return {
          source: source.source,
          leads: source.totalLeads,
          converted: source.converted,
          rate: conversionRate,
        };
      })
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 6);
  }, [sourceData, loading]);

  if (loading || funnelData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--card-bg)] p-6">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">Lead Source Conversion</h3>
        <div className="h-48 flex items-center justify-center text-[var(--text-muted)]">
          <p className="text-xs">No lead source data available</p>
        </div>
      </div>
    );
  }

  const totalLeads = funnelData.reduce((sum, f) => sum + f.leads, 0);
  const totalConverted = funnelData.reduce((sum, f) => sum + f.converted, 0);
  const overallConversion = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <div className="mb-6">
        <h3 className="text-sm font-bold text-[var(--text-main)]">Lead Source Conversion</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Conversion rates by lead source channel
        </p>
      </div>

      <div className="space-y-4">
        {funnelData.map((source, index) => {
          const dropoff = index === 0 ? 0 : funnelData[index - 1].leads - source.leads;
          const dropoffPct = index === 0 ? 0 : Math.round((dropoff / funnelData[index - 1].leads) * 100);

          return (
            <div key={source.source} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-[var(--text-main)]">
                    {source.source}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {source.leads} leads → {source.converted} converted ({source.rate}%)
                  </span>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-md bg-[#dbeafe] px-2 py-1 text-xs font-semibold text-[#1e40af]">
                    {source.rate}%
                  </span>
                </div>
              </div>

              {/* Conversion bar */}
              <div className="relative h-8 overflow-hidden rounded-lg bg-[var(--surface-dim)]">
                <div
                  className="flex items-center justify-end pr-3 transition-all duration-300"
                  style={{
                    width: `${source.rate}%`,
                    backgroundColor: CRM_CHART_SUCCESS,
                    height: "100%",
                  }}
                >
                  {source.rate > 20 && (
                    <span className="text-xs font-bold text-white">{source.rate}%</span>
                  )}
                </div>
                {source.rate <= 20 && (
                  <span className="absolute inset-0 flex items-center justify-end pr-3 text-xs font-bold text-[var(--text-muted)]">
                    {source.rate}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 border-t border-[var(--border-color)] pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-[var(--surface-dim)] p-3">
            <p className="text-xs font-semibold text-[var(--text-muted)]">Total Leads</p>
            <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
              {totalLeads.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--surface-dim)] p-3">
            <p className="text-xs font-semibold text-[var(--text-muted)]">Overall Conversion</p>
            <p className="mt-1 text-lg font-bold text-[#10b981]">{overallConversion}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
