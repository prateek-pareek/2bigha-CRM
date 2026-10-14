"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  formatDuration,
  formatINR,
  formatMinutes,
  type AgentReportRow,
} from "../lib/performance-report";

type Props = {
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

function TargetBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  if (!target) return null;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const tone = pct >= 100 ? "#10b981" : pct >= 80 ? "#f59e0b" : "#ef4444";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-muted)]">
          {label}: {actual}/{target}
        </span>
        <span className="font-bold" style={{ color: tone }}>
          {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--border-color)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}

const adherenceTone = (v: number | null) =>
  v == null ? undefined : v >= 75 ? "text-[#10b981]" : v >= 50 ? "text-[#f59e0b]" : "text-[#ef4444]";

/** Drill-down: every metric for each agent, straight from the live report rows. */
export default function DetailedAgentView({ agents, loading }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">Loading detailed agent data...</div>;
  }
  if (agents.length === 0) {
    return <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">No agent data available</div>;
  }

  return (
    <div className="space-y-3">
      {agents.map((a) => {
        const open = expanded === a.agentId;
        return (
          <div key={a.agentId} className="overflow-hidden rounded-lg border border-[var(--border-color)]">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : a.agentId)}
              className="w-full bg-[var(--card-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-dim)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-[var(--text-main)]">{a.name}</h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      {a.teamName} · {a.calls} calls · {a.leadsCreated} leads · {a.conversionRate}% conversion
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-right text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Revenue</p>
                    <p className="font-semibold text-[var(--text-main)]">{formatINR(a.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Listings</p>
                    <p className="font-semibold text-[var(--text-main)]">{a.listingsTotal}</p>
                  </div>
                </div>
              </div>
            </button>

            {open && (
              <div className="border-t border-[var(--border-color)] bg-[var(--surface-dim)] p-4">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">CALLS (IVR)</p>
                    <div className="space-y-1">
                      <Line label="Total calls" value={a.calls} />
                      <Line label="Outgoing / incoming" value={`${a.outgoingCalls} / ${a.incomingCalls}`} />
                      <Line label="Connected" value={`${a.connectedCalls} (${a.connectRate}%)`} tone="text-[#10b981]" />
                      <Line label="Missed" value={a.missedCalls} tone="text-[#ef4444]" />
                      <Line label="Avg talk time" value={formatDuration(a.avgCallDurationSec)} />
                      <TargetBar label="Calls target" actual={a.calls} target={a.target?.callsTarget || 0} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LEADS</p>
                    <div className="space-y-1">
                      <Line label="Created" value={a.leadsCreated} />
                      <Line label="Contacted" value={`${a.leadsContacted} (${a.contactRate}%)`} />
                      <Line label="Qualified" value={a.leadsQualified} />
                      <Line label="Converted" value={`${a.leadsConverted} (${a.conversionRate}%)`} tone="text-[#10b981]" />
                      <Line label="Lost" value={a.leadsLost} />
                      <TargetBar label="Leads target" actual={a.leadsCreated} target={a.target?.leadsTarget || 0} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">FOLLOW-UP & ENGAGEMENT</p>
                    <div className="space-y-1">
                      <Line
                        label="Follow-up adherence"
                        value={a.followUpAdherence == null ? "—" : `${a.followUpAdherence}%`}
                        tone={adherenceTone(a.followUpAdherence)}
                      />
                      <Line label="Follow-ups done / due" value={`${a.followUpsDone} / ${a.followUpsDue}`} />
                      <Line label="Avg first response" value={formatMinutes(a.avgResponseMins)} />
                      <Line label="Tasks done" value={`${a.tasksCompleted} / ${a.tasksCreated}`} />
                      <Line label="Activities" value={a.activities} />
                      <Line label="WhatsApp sent / read" value={`${a.whatsappSent} / ${a.whatsappRead}`} />
                      <Line label="WhatsApp avg reply" value={formatMinutes(a.whatsappAvgReplyMins)} />
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">LISTINGS & REVENUE</p>
                    <div className="space-y-1">
                      <Line label="Properties" value={a.properties} />
                      <Line label="Farms" value={a.farms} />
                      {a.pmListings ? <Line label="PM properties" value={a.pmListings} /> : null}
                      <Line
                        label="Approved / pending / rejected"
                        value={`${a.listingsApproved} / ${a.listingsPending} / ${a.listingsRejected}`}
                      />
                      <Line label="Subscription sales" value={a.subscriptionSales} />
                      <Line label="Revenue" value={formatINR(a.revenue)} tone="text-[#10b981]" />
                      <Line label="Subscribed leads" value={a.subscribedLeads} />
                      <TargetBar label="Listings target" actual={a.listingsTotal} target={a.target?.propertiesTarget || 0} />
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
