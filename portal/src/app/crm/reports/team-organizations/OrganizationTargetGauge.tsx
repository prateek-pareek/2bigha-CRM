"use client";

import Link from "next/link";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import type { PerformanceReport } from "../lib/performance-report";

interface OrganizationTargetGaugeProps {
  targets: PerformanceReport["targets"] | null;
  title?: string;
  loading: boolean;
}

const ROWS: Array<{ key: keyof PerformanceReport["targets"]; label: string }> = [
  { key: "leads", label: "Leads created" },
  { key: "calls", label: "Calls made" },
  { key: "listings", label: "Properties & farms listed" },
];

/**
 * Target progress = actuals in the period vs the sum of the per-agent targets
 * (Agent Performance → set target) for everyone in scope.
 */
export default function OrganizationTargetGauge({ targets, title = "Target Progress", loading }: OrganizationTargetGaugeProps) {
  if (loading) return <ReportChartSkeleton type="pie" height="300px" />;

  const anyTarget = targets && ROWS.some((r) => targets[r.key].target > 0);

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
      <h3 className="text-sm font-bold text-[var(--text-main)]">{title}</h3>
      <p className="mb-5 text-xs text-[var(--text-muted)]">Actual this period vs the sum of agent targets</p>

      {!targets || !anyTarget ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-[var(--text-muted)]">
          <p>No targets are set for the people in this report.</p>
          <Link href="/crm/reports/agents" className="font-semibold text-[var(--primary)] hover:underline">
            Set targets on Agent Performance
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-5">
          {ROWS.map(({ key, label }) => {
            const { actual, target } = targets[key];
            const pct = target > 0 ? Math.round((actual / target) * 100) : null;
            const width = pct == null ? 0 : Math.min(100, pct);
            const tone = pct == null ? "var(--text-muted)" : pct >= 100 ? "#10b981" : pct >= 80 ? "#2563eb" : pct >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div key={key}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text-main)]">{label}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    <span className="text-sm font-bold" style={{ color: tone }}>
                      {pct == null ? "—" : `${pct}%`}
                    </span>{" "}
                    {actual.toLocaleString()} / {target ? target.toLocaleString() : "no target"}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-dim)]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: tone }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
