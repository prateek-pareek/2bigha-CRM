"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

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
  messagesFailed: number;
  incomingCalls: number;
  missedCalls: number;
  completedCalls: number;
  avgCallDuration: number;
};

type Props = {
  teams: TeamData[];
  loading: boolean;
};

export default function DetailedTeamView({ teams, loading }: Props) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        Loading detailed team data...
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        No team data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const teamId = team.teamId || "";
        const isExpanded = expandedTeam === teamId;

        const conversionRate = team.totalLeads > 0 ? ((team.leadsConverted / team.totalLeads) * 100).toFixed(1) : "0";
        const readRate = team.messagesOutbound > 0 ? ((team.messagesRead / team.messagesOutbound) * 100).toFixed(1) : "0";
        const failureRate = team.messagesOutbound > 0 ? ((team.messagesFailed / team.messagesOutbound) * 100).toFixed(1) : "0";
        const missedCallRate = team.incomingCalls > 0 ? ((team.missedCalls / team.incomingCalls) * 100).toFixed(1) : "0";
        const completionRate = team.incomingCalls > 0 ? ((team.completedCalls / team.incomingCalls) * 100).toFixed(1) : "0";

        return (
          <div key={teamId} className="overflow-hidden rounded-lg border border-[var(--border-color)]">
            {/* Summary Row */}
            <button
              type="button"
              onClick={() => setExpandedTeam(isExpanded ? null : teamId)}
              className="w-full bg-[var(--card-bg)] px-4 py-3 text-left hover:bg-[var(--surface-dim)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-4">
                  <ChevronDown
                    size={16}
                    className={`text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-[var(--text-main)]">{team.teamName}</h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      {team.teamSize} members • {team.totalCalls} calls • {conversionRate}% conversion
                    </p>
                  </div>
                </div>

                {/* Key Metrics Summary */}
                <div className="flex gap-4 text-right text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Messages</p>
                    <p className="font-semibold text-[var(--text-main)]">{team.messagesOutbound}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Read Rate</p>
                    <p className={`font-semibold ${Number(readRate) >= 80 ? "text-[#10b981]" : Number(readRate) >= 60 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                      {readRate}%
                    </p>
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
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Incoming Calls</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.incomingCalls}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Completed</span>
                        <span className="font-semibold text-[#10b981]">{team.completedCalls}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Missed</span>
                        <span className="font-semibold text-[#ef4444]">{team.missedCalls}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Completion Rate</span>
                        <span className={`font-semibold ${Number(completionRate) >= 90 ? "text-[#10b981]" : Number(completionRate) >= 70 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                          {completionRate}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Avg Duration</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.avgCallDuration}s</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-[var(--border-color)]">
                        <div
                          className={`h-full rounded-full transition-all ${Number(missedCallRate) <= 20 ? "bg-[#10b981]" : Number(missedCallRate) <= 40 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`}
                          style={{ width: `${100 - Number(missedCallRate)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-muted)] text-right">Missed: {missedCallRate}%</p>
                    </div>
                  </div>

                  {/* Lead Metrics */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LEAD METRICS</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Total Leads</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.totalLeads}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Converted</span>
                        <span className="font-semibold text-[#10b981]">{team.leadsConverted}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Conversion Rate</span>
                        <span className={`font-semibold ${Number(conversionRate) >= 20 ? "text-[#10b981]" : Number(conversionRate) >= 10 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                          {conversionRate}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Leads per member</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {(team.totalLeads / Math.max(1, team.teamSize)).toFixed(1)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-[var(--border-color)]">
                        <div
                          className={`h-full rounded-full transition-all ${Number(conversionRate) >= 20 ? "bg-[#10b981]" : Number(conversionRate) >= 10 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`}
                          style={{ width: `${Math.min(100, (Number(conversionRate) / 50) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp Engagement */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">WHATSAPP ENGAGEMENT</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Messages Sent</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.messagesOutbound}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Read</span>
                        <span className="font-semibold text-[#10b981]">{team.messagesRead}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Failed</span>
                        <span className="font-semibold text-[#ef4444]">{team.messagesFailed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Read Rate</span>
                        <span className={`font-semibold ${Number(readRate) >= 80 ? "text-[#10b981]" : Number(readRate) >= 60 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                          {readRate}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Failure Rate</span>
                        <span className={`font-semibold ${Number(failureRate) <= 5 ? "text-[#10b981]" : Number(failureRate) <= 15 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                          {failureRate}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-[var(--border-color)]">
                        <div
                          className={`h-full rounded-full transition-all ${Number(readRate) >= 80 ? "bg-[#10b981]" : Number(readRate) >= 60 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`}
                          style={{ width: `${Number(readRate)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Team Info */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">TEAM INFO</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Team Size</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.teamSize}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Total Activities</span>
                        <span className="font-semibold text-[var(--text-main)]">{team.totalActivities}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Avg Activity/member</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {(team.totalActivities / Math.max(1, team.teamSize)).toFixed(0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Calls per member</span>
                        <span className="font-semibold text-[var(--text-main)]">
                          {(team.totalCalls / Math.max(1, team.teamSize)).toFixed(1)}
                        </span>
                      </div>
                      <div className="mt-3 rounded-md bg-[var(--card-bg)] p-2">
                        <p className="text-xs font-semibold text-[var(--text-main)]">Team Score</p>
                        <p className="text-lg font-bold text-[#10b981]">
                          {Math.round(
                            (Number(conversionRate) * 0.3 +
                              Number(readRate) * 0.3 +
                              Number(completionRate) * 0.4) /
                              10
                          ) * 10}
                          /100
                        </p>
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
