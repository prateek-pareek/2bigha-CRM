"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";
import {
  CRM_CHART_GRID,
  CRM_CHART_PRIMARY,
  CRM_CHART_SUCCESS,
  CRM_CHART_WARNING,
  CRM_CHART_TOOLTIP,
  CRM_CHART_TICK,
} from "@/portals/crm/lib/shared/chart-theme";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

type TeamData = {
  teamName: string;
  messagesOutbound: number;
  messagesRead: number;
  messagesFailed: number;
};

interface WhatsAppEngagementChartProps {
  teamData: TeamData[];
  loading: boolean;
}

export default function WhatsAppEngagementChart({
  teamData,
  loading,
}: WhatsAppEngagementChartProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const chartData = useMemo(() => {
    if (loading || !teamData || teamData.length === 0) return [];

    return teamData
      .map((team) => {
        let displayName = team.teamName || "Team";
        if (displayName.length > 12) {
          displayName = displayName.slice(0, 10) + "...";
        }

        const sent = team.messagesOutbound || 0;
        const read = team.messagesRead || 0;
        const failed = team.messagesFailed || 0;
        const readRate = sent > 0 ? Math.round((read / sent) * 100) : 0;
        const failureRate = sent > 0 ? Math.round((failed / sent) * 100) : 0;

        return {
          name: displayName,
          sent,
          read,
          failed,
          readRate,
          failureRate,
        };
      })
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 8);
  }, [teamData, loading]);

  if (loading) {
    return <ReportChartSkeleton type="bar" height="350px" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col items-center justify-center relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">WhatsApp Engagement</h3>
        <p className="text-xs text-[var(--text-muted)]">No WhatsApp data available</p>
      </div>
    );
  }

  const totalSent = chartData.reduce((sum, d) => sum + d.sent, 0);
  const totalRead = chartData.reduce((sum, d) => sum + d.read, 0);
  const totalFailed = chartData.reduce((sum, d) => sum + d.failed, 0);
  const overallReadRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;
  const overallFailureRate = totalSent > 0 ? Math.round((totalFailed / totalSent) * 100) : 0;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl flex flex-col' : ''}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">WhatsApp Engagement</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Message delivery and read rates by team
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

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-4 gap-3 rounded-lg bg-[var(--surface-dim)] p-4">
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Total Sent</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">
            {totalSent.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Read</p>
          <p className="mt-1 text-lg font-bold text-[#10b981]">{overallReadRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Failed</p>
          <p className="mt-1 text-lg font-bold text-[#ef4444]">{overallFailureRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Teams</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-main)]">{chartData.length}</p>
        </div>
      </div>

      {/* Chart */}
      <div className={`${isFullScreen ? 'flex-1 min-h-[400px]' : 'h-[300px]'} w-full mb-4 transition-all`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CRM_CHART_GRID} />
            <XAxis
              dataKey="name"
              tick={CRM_CHART_TICK}
              axisLine={false}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={CRM_CHART_TICK} axisLine={false} tickLine={false} />
            <Tooltip {...CRM_CHART_TOOLTIP} />
            <Legend wrapperStyle={{ paddingTop: 20, fontSize: 11, fontWeight: 600 }} />
            <Bar dataKey="sent" fill={CRM_CHART_PRIMARY} radius={[6, 6, 0, 0]} />
            <Bar dataKey="read" fill={CRM_CHART_SUCCESS} radius={[6, 6, 0, 0]} />
            <Bar dataKey="failed" fill={CRM_CHART_WARNING} radius={[6, 6, 0, 0]} />
            <Line type="monotone" dataKey="readRate" stroke="#2563eb" strokeWidth={2} yAxisId="right" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Team Details */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--text-muted)] mb-3">TEAM BREAKDOWN</p>
        {chartData.slice(0, 5).map((team) => (
          <div
            key={team.name}
            className="flex items-center justify-between rounded-lg border border-[var(--border-color)] p-3"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--text-main)]">{team.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {team.sent} sent • {team.readRate}% read • {team.failureRate}% failed
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[#10b981]">{team.readRate}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
