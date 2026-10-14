"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";
import { formatMinutes, type PerformanceReport, type TeamReportRow } from "../lib/performance-report";

interface WhatsAppEngagementChartProps {
  engagement: PerformanceReport["engagement"]["whatsapp"] | null;
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

/** WhatsApp engagement (FRD §14.2): messages sent / delivered / read / failed, inbound, reply time. */
export default function WhatsAppEngagementChart({ engagement, trend, teams, loading }: WhatsAppEngagementChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const daily = useMemo(
    () => trend.map((d) => ({ date: d.date.slice(5), sent: d.whatsappSent, read: d.whatsappRead })),
    [trend],
  );
  const teamRows = useMemo(
    () => teams.filter((t) => t.messagesOutbound > 0).sort((a, b) => b.messagesOutbound - a.messagesOutbound),
    [teams],
  );

  if (loading) return <ReportChartSkeleton type="bar" height="350px" />;
  const e = engagement;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? "fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl" : ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">WhatsApp Engagement</h3>
          <p className="text-xs text-[var(--text-muted)]">Messages sent and read, inbound replies and response time</p>
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
        <Stat label="Sent" value={e?.sent ?? 0} />
        <Stat label="Delivered" value={e?.delivered ?? 0} />
        <Stat label={`Read (${e?.readRate ?? 0}%)`} value={e?.read ?? 0} tone={CRM_CHART_SUCCESS} />
        <Stat label="Failed" value={e?.failed ?? 0} tone="#ef4444" />
        <Stat label="Inbound" value={e?.inbound ?? 0} />
        <Stat label="Avg reply" value={formatMinutes(e?.avgReplyMins)} />
      </div>

      {!e || (e.sent === 0 && e.inbound === 0) ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">No WhatsApp messages in this period.</p>
      ) : (
        <>
          <div className={`${isFullScreen ? "h-[50vh]" : "h-[220px]"} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CRM_CHART_GRID} vertical={false} />
                <XAxis dataKey="date" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...CRM_CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="sent" name="Sent" fill={CRM_CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                <Line dataKey="read" name="Read" stroke={CRM_CHART_SUCCESS} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {teamRows.length > 1 ? (
            <div className="mt-4 space-y-2 border-t border-[var(--border-color)] pt-3">
              {teamRows.slice(0, 8).map((t) => (
                <div key={t.teamId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-[var(--text-main)]">{t.teamName}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">
                    {t.messagesOutbound} sent · {t.messagesRead} read ({t.whatsappReadRate}%) · {t.messagesFailed} failed
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
