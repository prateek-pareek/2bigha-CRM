"use client";

import { useState, useMemo } from "react";
import { Clock, Maximize2, Minimize2 } from "lucide-react";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import { formatMinutes, type AgentReportRow } from "../lib/performance-report";

interface ResponseTimeChartProps {
  agents: AgentReportRow[];
  loading: boolean;
}

type Quality = "fast" | "moderate" | "slow";

/** ≤ 1h fast, ≤ 24h moderate, slower = slow. */
function qualityOf(mins: number): Quality {
  if (mins <= 60) return "fast";
  if (mins <= 24 * 60) return "moderate";
  return "slow";
}

const BADGE: Record<Quality, string> = {
  fast: "bg-[#dbeafe] text-[#1e40af]",
  moderate: "bg-[#fef3c7] text-[#92400e]",
  slow: "bg-[#fee2e2] text-[#dc2626]",
};
const BAR: Record<Quality, string> = { fast: "#2563eb", moderate: "#f59e0b", slow: "#ef4444" };

/**
 * Average first-response time: lead created → first call (IVR/manual), contact activity
 * (call/email/meeting) or outbound WhatsApp on that lead.
 */
export default function ResponseTimeChart({ agents, loading }: ResponseTimeChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const rows = useMemo(
    () =>
      agents
        .filter((a) => a.respondedLeads > 0 || a.pendingResponseLeads > 0)
        .map((a) => ({
          id: a.agentId,
          name: a.name,
          mins: a.avgResponseMins,
          responded: a.respondedLeads,
          pending: a.pendingResponseLeads,
          quality: a.avgResponseMins == null ? null : qualityOf(a.avgResponseMins),
        }))
        .sort((x, y) => (x.mins ?? Infinity) - (y.mins ?? Infinity)),
    [agents],
  );

  if (loading) return <ReportChartSkeleton type="bar" height="350px" />;

  const responded = rows.reduce((s, r) => s + r.responded, 0);
  const pending = rows.reduce((s, r) => s + r.pending, 0);
  const weighted = rows.reduce((s, r) => s + (r.mins ?? 0) * r.responded, 0);
  const overall = responded > 0 ? weighted / responded : null;
  const fast = rows.filter((r) => r.quality === "fast").length;
  const worst = Math.max(60, ...rows.map((r) => r.mins ?? 0));

  return (
    <div className={`flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? "fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl" : ""}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Response Time</h3>
          <p className="text-xs text-[var(--text-muted)]">Lead created → first call, email, meeting or WhatsApp</p>
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
          <div className="text-2xl font-bold text-[var(--text-main)]">{formatMinutes(overall)}</div>
          <p className="text-xs text-[var(--text-muted)]">Avg first response</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#2563eb]">{fast}</div>
          <p className="text-xs text-[var(--text-muted)]">Agents ≤ 1h</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#ef4444]">{pending}</div>
          <p className="text-xs text-[var(--text-muted)]">Leads not contacted</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">No leads were created in this period.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const score = r.mins == null ? 0 : Math.max(4, 100 - (r.mins / worst) * 100);
            return (
              <div key={r.id} className="rounded-lg border border-[var(--border-color)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Clock size={14} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="truncate text-sm font-semibold text-[var(--text-main)]">{r.name}</span>
                    {r.quality ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.quality]}`}>
                        {r.quality === "fast" ? "Fast" : r.quality === "moderate" ? "Moderate" : "Slow"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-[var(--surface-dim)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                        No contact yet
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-[var(--text-main)]">{formatMinutes(r.mins)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-dim)]">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${score}%`, backgroundColor: r.quality ? BAR[r.quality] : "transparent" }}
                    />
                  </div>
                  <span className="min-w-[8rem] text-right text-xs text-[var(--text-muted)]">
                    {r.responded} contacted · {r.pending} pending
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
