"use client";

import { ArrowUpRight, ArrowDownRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type TeamData = {
  teamId?: string;
  teamName: string;
  teamSize: number;
  totalCalls: number;
  totalLeads: number;
  leadsConverted: number;
  totalActivities: number;
  messagesOutbound: number;
  messagesRead: number;
  incomingCalls: number;
  missedCalls: number;
};

type KPICard = {
  label: string;
  value: string | number;
  trend?: number | null;
  icon: React.ReactNode;
};

function TrendBadge({ trend }: { trend: number | null | undefined }) {
  if (trend === null || trend === undefined) return null;
  const isPositive = trend > 0;
  const isNeutral = trend === 0;

  if (isNeutral) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
        Stable
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-semibold",
        isPositive ? "text-[#10b981]" : "text-[#ef4444]"
      )}
    >
      {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(trend)}%
    </span>
  );
}

interface TeamPerformanceKPIsProps {
  teamData: TeamData[];
  loading: boolean;
}

export default function TeamPerformanceKPIs({
  teamData,
  loading,
}: TeamPerformanceKPIsProps) {
  if (loading || teamData.length === 0) return null;

  // Aggregate metrics across all teams
  const totalTeams = teamData.length;
  const totalTeamMembers = teamData.reduce((sum, t) => sum + (t.teamSize || 0), 0);
  const totalCalls = teamData.reduce((sum, t) => sum + (t.totalCalls || 0), 0);
  const totalLeadsConverted = teamData.reduce((sum, t) => sum + (t.leadsConverted || 0), 0);
  const totalLeads = teamData.reduce((sum, t) => sum + (t.totalLeads || 0), 0);
  const conversionRate = totalLeads > 0 ? Math.round((totalLeadsConverted / totalLeads) * 100) : 0;

  // WhatsApp metrics
  const totalMessagesOutbound = teamData.reduce((sum, t) => sum + (t.messagesOutbound || 0), 0);
  const totalMessagesRead = teamData.reduce((sum, t) => sum + (t.messagesRead || 0), 0);
  const readRate = totalMessagesOutbound > 0 ? Math.round((totalMessagesRead / totalMessagesOutbound) * 100) : 0;

  // IVR metrics
  const totalIncomingCalls = teamData.reduce((sum, t) => sum + (t.incomingCalls || 0), 0);
  const totalMissedCalls = teamData.reduce((sum, t) => sum + (t.missedCalls || 0), 0);
  const missedCallRate = totalIncomingCalls > 0 ? Math.round((totalMissedCalls / totalIncomingCalls) * 100) : 0;

  const kpis: KPICard[] = [
    {
      label: "Active Teams",
      value: totalTeams,
      trend: null,
      icon: <Users className="text-[#2563eb]" size={20} />,
    },
    {
      label: "Team Members",
      value: totalTeamMembers,
      trend: null,
      icon: <Users className="text-[#10b981]" size={20} />,
    },
    {
      label: "Total Calls",
      value: totalCalls.toLocaleString(),
      trend: null,
      icon: <Users className="text-[#8b5cf6]" size={20} />,
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      trend: null,
      icon: <Users className="text-[#ff9f43]" size={20} />,
    },
    {
      label: "WhatsApp Read Rate",
      value: `${readRate}%`,
      trend: null,
      icon: <Users className="text-[#06b6d4]" size={20} />,
    },
    {
      label: "Missed Call Rate",
      value: `${missedCallRate}%`,
      trend: null,
      icon: <Users className="text-[#ef4444]" size={20} />,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {kpi.label}
            </span>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">{kpi.icon}</div>
          </div>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold text-[var(--text-main)]">{kpi.value}</div>
          </div>
          {kpi.trend !== null && <TrendBadge trend={kpi.trend} />}
        </div>
      ))}
    </div>
  );
}
