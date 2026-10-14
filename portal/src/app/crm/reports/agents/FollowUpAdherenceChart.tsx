"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { CRM_CHART_DANGER, CRM_CHART_PRIMARY } from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import type { AgentReportRow } from "../lib/performance-report";

interface FollowUpAdherenceChartProps {
  agents: AgentReportRow[];
  loading: boolean;
}

type Status = "excellent" | "good" | "needs-attention";

/**
 * Follow-up adherence = follow-ups that came due in the period (lead next-follow-up dates
 * + task due dates) and were actioned (lead called on/after the due day, task completed).
 */
export default function FollowUpAdherenceChart({ agents, loading }: FollowUpAdherenceChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const rows = useMemo(
    () =>
      agents
        .filter((a) => a.followUpsDue > 0)
        .map((a) => {
          const rate = a.followUpAdherence ?? 0;
          const status: Status = rate >= 75 ? "excellent" : rate >= 50 ? "good" : "needs-attention";
          return {
            id: a.agentId,
            name: a.name,
            rate,
            due: a.followUpsDue,
            done: a.followUpsDone,
            overdue: a.followUpsOverdue,
            status,
          };
        })
        .sort((x, y) => y.rate - x.rate),
    [agents],
  );

  if (loading) return <ReportChartSkeleton type="bar" height="350px" />;

  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const overall = totalDue > 0 ? Math.round((totalDone / totalDue) * 100) : 0;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? "fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl" : "flex flex-col"}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Follow-up Adherence</h3>
          <p className="text-xs text-[var(--text-muted)]">Follow-ups due in this period that were actioned</p>
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

      <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-main)]">{totalDue > 0 ? `${overall}%` : "—"}</div>
          <p className="text-xs text-[var(--text-muted)]">Adherence</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#10b981]">
            {totalDone}/{totalDue}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Done / due</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#ef4444]">{totalOverdue}</div>
          <p className="text-xs text-[var(--text-muted)]">Overdue</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">No follow-ups or task due dates fell in this period.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const barColor = r.status === "excellent" ? CRM_CHART_PRIMARY : r.status === "good" ? "#f59e0b" : CRM_CHART_DANGER;
            const badge =
              r.status === "excellent"
                ? "bg-[#dbeafe] text-[#1e40af]"
                : r.status === "good"
                  ? "bg-[#fef3c7] text-[#92400e]"
                  : "bg-[#fee2e2] text-[#dc2626]";
            return (
              <div key={r.id} className="rounded-lg border border-[var(--border-color)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--text-main)]">{r.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
                      {r.status === "excellent" ? "Excellent" : r.status === "good" ? "Good" : "Needs Attention"}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-[var(--text-main)]">{r.rate}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-dim)]">
                    <div className="h-full transition-all duration-300" style={{ width: `${r.rate}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="min-w-[7rem] text-right text-xs text-[var(--text-muted)]">
                    {r.done}/{r.due} done{r.overdue ? ` · ${r.overdue} overdue` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border-color)] pt-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CRM_CHART_PRIMARY }} />
          <span className="text-xs text-[var(--text-muted)]">Excellent (75%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded bg-[#f59e0b]" />
          <span className="text-xs text-[var(--text-muted)]">Good (50–74%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CRM_CHART_DANGER }} />
          <span className="text-xs text-[var(--text-muted)]">Needs attention (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}
