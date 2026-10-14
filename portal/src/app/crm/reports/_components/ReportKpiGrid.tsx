"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportKpi = {
  label: string;
  value: string | number;
  /** Secondary line under the value (e.g. "42 connected · 61%"). */
  sub?: string;
  /** % change vs the previous equal-length period; null/undefined hides the badge. */
  trend?: number | null;
  icon: React.ReactNode;
};

function TrendBadge({ trend }: { trend: number }) {
  if (trend === 0) {
    return <span className="text-xs font-semibold text-[var(--text-muted)]">No change</span>;
  }
  const up = trend > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-semibold", up ? "text-[#10b981]" : "text-[#ef4444]")}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(trend)}%
    </span>
  );
}

export function ReportKpiGrid({
  kpis,
  loading,
  compareLabel,
}: {
  kpis: ReportKpi[];
  loading: boolean;
  compareLabel?: string;
}) {
  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: kpis.length || 8 }).map((_, i) => (
          <div key={i} className="h-[112px] animate-pulse rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm">
            <div className="mb-4 h-4 w-24 rounded bg-[var(--surface-dim)]" />
            <div className="h-6 w-16 rounded bg-[var(--surface-dim)]" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{kpi.label}</span>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">{kpi.icon}</div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl font-bold text-[var(--text-main)]">{kpi.value}</div>
            {kpi.trend != null ? (
              <span title={compareLabel}>
                <TrendBadge trend={kpi.trend} />
              </span>
            ) : null}
          </div>
          {kpi.sub ? <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{kpi.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
