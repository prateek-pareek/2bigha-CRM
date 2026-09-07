"use client";

import { ChevronDown, TrendingUp, TrendingDown, Target } from "lucide-react";
import { useState } from "react";

type AgentData = {
  agentId: string;
  name: string;
  calls: number;
  activities: number;
  leadsCreated: number;
  leadsConverted: number;
  target: { leadsTarget: number; callsTarget: number; propertiesTarget: number } | null;
};

type PropertyCounts = Record<string, { propertyCount: number; farmCount: number }>;

type Props = {
  agents: AgentData[];
  propertyCounts: PropertyCounts;
  loading: boolean;
};

export default function DetailedAgentView({ agents, propertyCounts, loading }: Props) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        Loading detailed agent data...
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        No agent data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => {
        const counts = propertyCounts[agent.agentId] || { propertyCount: 0, farmCount: 0 };
        const isExpanded = expandedAgent === agent.agentId;

        const conversionRate = agent.leadsCreated > 0 ? ((agent.leadsConverted / agent.leadsCreated) * 100).toFixed(1) : "0";
        const followUpAdherence =
          agent.leadsCreated > 0
            ? ((agent.activities / (agent.leadsCreated * 3)) * 100).toFixed(1)
            : "0";
        const responseTimeCategory =
          agent.leadsCreated > 0
            ? agent.activities / agent.leadsCreated >= 2
              ? "Fast"
              : agent.activities / agent.leadsCreated >= 1
                ? "Moderate"
                : "Slow"
            : "—";

        const baseRevenue = Number(conversionRate) * 50; // Per conversion
        const activityRevenue = agent.activities * 0.02 * 5000; // Activity-based revenue
        const totalRevenue = baseRevenue + activityRevenue;

        const leadsProgress = agent.target
          ? Math.min(100, Math.round((agent.leadsConverted / agent.target.leadsTarget) * 100))
          : 0;
        const callsProgress = agent.target
          ? Math.min(100, Math.round((agent.calls / agent.target.callsTarget) * 100))
          : 0;

        return (
          <div key={agent.agentId} className="overflow-hidden rounded-lg border border-[var(--border-color)]">
            {/* Summary Row */}
            <button
              type="button"
              onClick={() => setExpandedAgent(isExpanded ? null : agent.agentId)}
              className="w-full bg-[var(--card-bg)] px-4 py-3 text-left hover:bg-[var(--surface-dim)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-4">
                  <ChevronDown
                    size={16}
                    className={`text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-[var(--text-main)]">{agent.name}</h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      {agent.calls} calls • {agent.leadsCreated} leads • {conversionRate}% conversion
                    </p>
                  </div>
                </div>

                {/* Key Metrics Summary */}
                <div className="flex gap-4 text-right text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Revenue</p>
                    <p className="font-semibold text-[var(--text-main)]">₹{Math.round(totalRevenue).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Properties</p>
                    <p className="font-semibold text-[var(--text-main)]">{counts.propertyCount}</p>
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="border-t border-[var(--border-color)] bg-[var(--surface-dim)] p-4">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {/* Call Metrics */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">CALL METRICS</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Total Calls</span>
                        <span className="font-semibold text-[var(--text-main)]">{agent.calls}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Avg per day</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {(agent.calls / 30).toFixed(1)}
                        </span>
                      </div>
                      {agent.target?.callsTarget && (
                        <>
                          <div className="mt-2 flex justify-between">
                            <span className="text-xs text-[var(--text-muted)]">Target: {agent.target.callsTarget}</span>
                            <span
                              className={`text-xs font-bold ${callsProgress >= 100 ? "text-[#10b981]" : callsProgress >= 80 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}
                            >
                              {callsProgress}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--border-color)]">
                            <div
                              className={`h-full rounded-full transition-all ${callsProgress >= 100 ? "bg-[#10b981]" : callsProgress >= 80 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`}
                              style={{ width: `${Math.min(100, callsProgress)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Lead Metrics */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LEAD METRICS</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Created</span>
                        <span className="font-semibold text-[var(--text-main)]">{agent.leadsCreated}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Converted</span>
                        <span className="font-semibold text-[#10b981]">{agent.leadsConverted}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Conversion</span>
                        <span className="font-semibold text-[var(--text-main)]">{conversionRate}%</span>
                      </div>
                      {agent.target?.leadsTarget && (
                        <>
                          <div className="mt-2 flex justify-between">
                            <span className="text-xs text-[var(--text-muted)]">Target: {agent.target.leadsTarget}</span>
                            <span
                              className={`text-xs font-bold ${leadsProgress >= 100 ? "text-[#10b981]" : leadsProgress >= 80 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}
                            >
                              {leadsProgress}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--border-color)]">
                            <div
                              className={`h-full rounded-full transition-all ${leadsProgress >= 100 ? "bg-[#10b981]" : leadsProgress >= 80 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`}
                              style={{ width: `${Math.min(100, leadsProgress)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Engagement Metrics */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">ENGAGEMENT</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Activities</span>
                        <span className="font-semibold text-[var(--text-main)]">{agent.activities}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Avg per lead</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {(agent.activities / Math.max(1, agent.leadsCreated)).toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Follow-up adherence</span>
                        <span
                          className={`font-semibold ${Number(followUpAdherence) >= 75 ? "text-[#10b981]" : Number(followUpAdherence) >= 50 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}
                        >
                          {followUpAdherence}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Response time</span>
                        <span className="font-semibold text-[var(--text-main)]">{responseTimeCategory}</span>
                      </div>
                    </div>
                  </div>

                  {/* Listings & Revenue */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">REVENUE & LISTINGS</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Total Revenue</span>
                        <span className="font-semibold text-[#10b981]">₹{Math.round(totalRevenue).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Conversion-based</span>
                        <span className="text-[var(--text-main)]">₹{Math.round(baseRevenue).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Activity-based</span>
                        <span className="text-[var(--text-main)]">₹{Math.round(activityRevenue).toLocaleString()}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-[var(--text-muted)]">Properties</p>
                          <p className="font-semibold text-[var(--text-main)]">{counts.propertyCount}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-[var(--text-muted)]">Farms</p>
                          <p className="font-semibold text-[var(--text-main)]">{counts.farmCount}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
