"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  formatDuration,
  formatINR,
  formatMinutes,
  type AgentReportRow,
  type TeamReportRow,
} from "../lib/performance-report";

type Props = {
  teams: TeamReportRow[];
  agents: AgentReportRow[];
  loading: boolean;
};

function Line({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className={`font-semibold ${tone || "text-[var(--text-main)]"}`}>{value}</span>
    </div>
  );
}

/** Team drill-down: roll-up metrics + every member's numbers (FRD §14.2 / §14.3 drill-down). */
export default function DetailedTeamView({ teams, agents, loading }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">Loading detailed team data...</div>;
  }
  if (teams.length === 0) {
    return <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">No team data available</div>;
  }

  return (
    <div className="space-y-3">
      {teams.map((t) => {
        const open = expanded === t.teamId;
        const members = agents.filter((a) => a.teamId === t.teamId);
        return (
          <div key={t.teamId} className="overflow-hidden rounded-lg border border-[var(--border-color)]">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : t.teamId)}
              className="w-full bg-[var(--card-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-dim)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-[var(--text-main)]">{t.teamName}</h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      {t.teamSize} members · {t.calls} calls · {t.leadsCreated} leads · {t.conversionRate}% conversion
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-right text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">WhatsApp read</p>
                    <p className="font-semibold text-[var(--text-main)]">{t.whatsappReadRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Revenue</p>
                    <p className="font-semibold text-[var(--text-main)]">{formatINR(t.revenue)}</p>
                  </div>
                </div>
              </div>
            </button>

            {open && (
              <div className="border-t border-[var(--border-color)] bg-[var(--surface-dim)] p-4">
                <div className="mb-5 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">CALLS (IVR)</p>
                    <Line label="Total" value={t.calls} />
                    <Line label="Outgoing / incoming" value={`${t.outgoingCalls} / ${t.incomingCalls}`} />
                    <Line label="Connected" value={`${t.connectedCalls} (${t.connectRate}%)`} tone="text-[#10b981]" />
                    <Line label="Missed" value={t.missedCalls} tone="text-[#ef4444]" />
                    <Line label="Avg talk time" value={formatDuration(t.avgCallDurationSec)} />
                  </div>
                  <div className="space-y-1">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LEADS</p>
                    <Line label="Created" value={t.leadsCreated} />
                    <Line label="Contacted" value={`${t.leadsContacted} (${t.contactRate}%)`} />
                    <Line label="Converted" value={`${t.leadsConverted} (${t.conversionRate}%)`} tone="text-[#10b981]" />
                    <Line label="Follow-up adherence" value={t.followUpAdherence == null ? "—" : `${t.followUpAdherence}%`} />
                    <Line label="Avg first response" value={formatMinutes(t.avgResponseMins)} />
                  </div>
                  <div className="space-y-1">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">WHATSAPP</p>
                    <Line label="Sent" value={t.whatsappSent} />
                    <Line label="Delivered" value={t.whatsappDelivered} />
                    <Line label="Read" value={`${t.whatsappRead} (${t.whatsappReadRate}%)`} tone="text-[#10b981]" />
                    <Line label="Failed" value={t.whatsappFailed} tone="text-[#ef4444]" />
                    <Line label="Avg reply" value={formatMinutes(t.whatsappAvgReplyMins)} />
                  </div>
                  <div className="space-y-1">
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LISTINGS, TASKS & SALES</p>
                    <Line label="Properties / farms" value={`${t.properties} / ${t.farms}`} />
                    <Line label="Approved" value={t.listingsApproved} />
                    <Line label="Tasks done" value={`${t.tasksCompleted} / ${t.tasksCreated}`} />
                    <Line label="Subscription sales" value={t.subscriptionSales} />
                    <Line label="Revenue" value={formatINR(t.revenue)} tone="text-[#10b981]" />
                  </div>
                </div>

                {members.length ? (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
                    <table className="w-full min-w-[760px] text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          <th className="px-3 py-2">Member</th>
                          <th className="px-3 py-2">Calls</th>
                          <th className="px-3 py-2">Connected</th>
                          <th className="px-3 py-2">Leads</th>
                          <th className="px-3 py-2">Converted</th>
                          <th className="px-3 py-2">Follow-up</th>
                          <th className="px-3 py-2">Listings</th>
                          <th className="px-3 py-2">WhatsApp</th>
                          <th className="px-3 py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.agentId} className="border-b border-[var(--border-color)] last:border-0">
                            <td className="px-3 py-2 font-medium text-[var(--text-main)]">{m.name}</td>
                            <td className="px-3 py-2">{m.calls}</td>
                            <td className="px-3 py-2">{m.connectedCalls}</td>
                            <td className="px-3 py-2">{m.leadsCreated}</td>
                            <td className="px-3 py-2">
                              {m.leadsConverted} ({m.conversionRate}%)
                            </td>
                            <td className="px-3 py-2">{m.followUpAdherence == null ? "—" : `${m.followUpAdherence}%`}</td>
                            <td className="px-3 py-2">{m.listingsTotal}</td>
                            <td className="px-3 py-2">
                              {m.whatsappSent} / {m.whatsappRead} read
                            </td>
                            <td className="px-3 py-2">{formatINR(m.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
