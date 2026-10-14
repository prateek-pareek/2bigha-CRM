"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SECONDARY,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import { formatDuration, type PerformanceReport, type TeamReportRow } from "../lib/performance-report";

interface IVRAnalyticsChartProps {
  ivr: PerformanceReport["engagement"]["ivr"] | null;
  trend: PerformanceReport["trend"];
  teams: TeamReportRow[];
  loading: boolean;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-bold" style={{ color: tone || "var(--text-main)" }}>
        {value}
      </p>
    </div>
  );
}

/** IVR engagement (FRD §14.2): call volume, incoming/outgoing, connected, missed calls, talk time. */
export default function IVRAnalyticsChart({ ivr, trend, teams, loading }: IVRAnalyticsChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const daily = useMemo(
    () =>
      trend.map((d) => ({
        date: d.date.slice(5),
        outgoing: d.outgoingCalls,
        incoming: d.incomingCalls,
        missed: d.missedCalls,
      })),
    [trend],
  );
  const teamRows = useMemo(() => teams.filter((t) => t.calls > 0).sort((a, b) => b.calls - a.calls), [teams]);

  if (loading) return <ReportChartSkeleton type="bar" height="350px" />;
  const c = ivr;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? "fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl" : ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">IVR Call Analytics</h3>
          <p className="text-xs text-[var(--text-muted)]">Call volume, connected and missed calls (Kommuno IVR + logged calls)</p>
        </div>
        <button
          type="button"
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
          title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-[var(--surface-dim)] p-3 sm:grid-cols-6">
        <Stat label="Total calls" value={c?.total ?? 0} />
        <Stat label="Outgoing" value={c?.outgoing ?? 0} />
        <Stat label="Incoming" value={c?.incoming ?? 0} />
        <Stat label={`Connected (${c?.connectRate ?? 0}%)`} value={c?.connected ?? 0} tone="#10b981" />
        <Stat label="Missed" value={c?.missed ?? 0} tone="#ef4444" />
        <Stat label="Avg talk time" value={formatDuration(c?.avgCallDurationSec)} />
      </div>

      {!c || c.total === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">No calls in this period.</p>
      ) : (
        <>
          <div className={`${isFullScreen ? "h-[50vh]" : "h-[220px]"} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                <XAxis dataKey="date" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="outgoing" name="Outgoing" stackId="a" fill={CRM_CHART_PRIMARY} />
                <Bar dataKey="incoming" name="Incoming" stackId="a" fill={CRM_CHART_SECONDARY} />
                <Bar dataKey="missed" name="Missed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {teamRows.length > 1 ? (
            <div className="mt-4 space-y-2 border-t border-[var(--border-color)] pt-3">
              {teamRows.slice(0, 8).map((t) => (
                <div key={t.teamId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-[var(--text-main)]">{t.teamName}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">
                    {t.calls} calls · {t.connectedCalls} connected · {t.missedCalls} missed · {formatDuration(t.avgCallDurationSec)} avg
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
            Missed counts include unanswered inbound IVR calls; outgoing calls that did not connect show as not-connected (
            {c.notConnected}).
          </p>
        </>
      )}
    </div>
  );
}
