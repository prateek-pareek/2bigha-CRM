"use client";

import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type KPICard = {
  label: string;
  value: string | number;
  trend?: number | null;
  icon: React.ReactNode;
  valueColor?: string;
};

function TrendBadge({ trend }: { trend: number | null | undefined }) {
  if (trend === null || trend === undefined) return null;
  const isPositive = trend > 0;
  const isNeutral = trend === 0;

  if (isNeutral) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
        No change
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

interface AgentPerformanceKPIsProps {
  agents: any[];
  loading: boolean;
}

export default function AgentPerformanceKPIs({
  agents,
  loading,
}: AgentPerformanceKPIsProps) {
  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-sm h-[104px] animate-pulse">
            <div className="flex justify-between items-start">
              <div className="h-4 bg-[var(--surface-dim)] rounded w-24 mb-4"></div>
              <div className="h-8 w-8 bg-[var(--surface-dim)] rounded"></div>
            </div>
            <div className="h-6 bg-[var(--surface-dim)] rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (agents.length === 0) return null;

  // Calculate aggregate metrics
  const totalCalls = agents.reduce((sum, a) => sum + (a.calls || 0), 0);
  const totalLeadsCreated = agents.reduce((sum, a) => sum + (a.leadsCreated || 0), 0);
  const totalLeadsConverted = agents.reduce((sum, a) => sum + (a.leadsConverted || 0), 0);
  const conversionRate =
    totalLeadsCreated > 0 ? Math.round((totalLeadsConverted / totalLeadsCreated) * 100) : 0;

  // Find top performer using a weighted score: Converted(10) + Created(2) + Calls(1)
  const getScore = (agent: any) => 
    (agent.leadsConverted || 0) * 10 + (agent.leadsCreated || 0) * 2 + (agent.calls || 0);

  const topAgent = agents.reduce((max, agent) => {
    return getScore(agent) > getScore(max) ? agent : max;
  }, agents[0]);

  // Get safe display name for top agent
  const getDisplayName = (agent: any): string => {
    if (!agent) return "N/A";
    if (agent.name && agent.name !== "Unknown agent") {
      return agent.name.split(" ")[0];
    }
    return "Agent";
  };

  // Calculate trend: How much better the top agent is vs the team average
  const totalScore = agents.reduce((sum, agent) => sum + getScore(agent), 0);
  const avgScore = agents.length > 0 ? totalScore / agents.length : 1;
  const topScore = getScore(topAgent);
  const avgTrend =
    avgScore > 0 ? Math.round(((topScore - avgScore) / avgScore) * 100) : 0;

  const kpis: KPICard[] = [
    {
      label: "Total Calls",
      value: totalCalls.toLocaleString(),
      trend: null,
      icon: <TrendingUp className="text-[#2563eb]" size={20} />,
    },
    {
      label: "Leads Created",
      value: totalLeadsCreated.toLocaleString(),
      trend: null,
      icon: <TrendingUp className="text-[#10b981]" size={20} />,
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      trend: null,
      icon: <TrendingUp className="text-[#8b5cf6]" size={20} />,
    },
    {
      label: "Top Performer",
      value: getDisplayName(topAgent),
      trend: avgTrend > 0 ? avgTrend : null,
      icon: <TrendingUp className="text-[#ff9f43]" size={20} />,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
