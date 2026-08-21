"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";

type AgentRow = {
  agentId: string;
  name: string;
  calls: number;
  activities: number;
  leadsCreated: number;
  leadsConverted: number;
  target: { leadsTarget: number; callsTarget: number; dealsTarget: number; propertiesTarget: number } | null;
};

type PropertyCounts = Record<string, { propertyCount: number; farmCount: number }>;

const WINDOWS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
];

function progressPct(actual: number, target: number): number | null {
  if (!target) return null;
  return Math.min(100, Math.round((actual / target) * 100));
}

/**
 * Agent Performance baseline (human agents) — calls made, activities, leads
 * created/converted, properties+farms listed, and target-vs-actual, per the
 * FRD's Section 6. Replaces the previous dead redirect to the AI copilot's
 * activity page (a different, unrelated concept).
 */
export default function AgentPerformancePage() {
  const { hasAccess } = usePermissions();
  const canSetTargets = hasAccess("settings:admin");
  const [window_, setWindow] = useState("this_month");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [propertyCounts, setPropertyCounts] = useState<PropertyCounts>({});
  const [loading, setLoading] = useState(true);
  const [targetAgent, setTargetAgent] = useState<AgentRow | null>(null);
  const [targetForm, setTargetForm] = useState({ leadsTarget: "0", callsTarget: "0", dealsTarget: "0", propertiesTarget: "0" });
  const [savingTarget, setSavingTarget] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leaderboardRes, propertiesRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/reports/agents?window=${window_}`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`${CRM_API_URL}/crm/property-listings/counts-by-agent`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      const leaderboard = leaderboardRes.ok ? await leaderboardRes.json() : { agents: [] };
      const properties = propertiesRes.ok ? await propertiesRes.json() : {};
      setAgents(Array.isArray(leaderboard.agents) ? leaderboard.agents : []);
      setPropertyCounts(properties || {});
    } catch {
      setAgents([]);
      setPropertyCounts({});
    } finally {
      setLoading(false);
    }
  }, [window_, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Agent Performance"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Reports" }, { label: "Agent Performance" }]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWindow(w.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              window_ === w.key
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--primary)]/50"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-2.5">Agent</th>
              <th className="px-4 py-2.5">Calls</th>
              <th className="px-4 py-2.5">Activities</th>
              <th className="px-4 py-2.5">Leads created</th>
              <th className="px-4 py-2.5">Leads converted</th>
              <th className="px-4 py-2.5">Properties</th>
              <th className="px-4 py-2.5">Farms</th>
              <th className="px-4 py-2.5">Target vs actual</th>
              {canSetTargets ? <th className="px-4 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  <Loader2 size={16} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No agent activity recorded for this window yet.
                </td>
              </tr>
            ) : (
              agents.map((agent) => {
                const counts = propertyCounts[agent.agentId] || { propertyCount: 0, farmCount: 0 };
                const leadsPct = agent.target ? progressPct(agent.leadsCreated, agent.target.leadsTarget) : null;
                const callsPct = agent.target ? progressPct(agent.calls, agent.target.callsTarget) : null;
                return (
                  <tr key={agent.agentId} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">{agent.name}</td>
                    <td className="px-4 py-2.5">{agent.calls}</td>
                    <td className="px-4 py-2.5">{agent.activities}</td>
                    <td className="px-4 py-2.5">{agent.leadsCreated}</td>
                    <td className="px-4 py-2.5">{agent.leadsConverted}</td>
                    <td className="px-4 py-2.5">{counts.propertyCount}</td>
                    <td className="px-4 py-2.5">{counts.farmCount}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                      {agent.target ? (
                        <div className="space-y-0.5">
                          {leadsPct != null ? <div>Leads: {leadsPct}% of {agent.target.leadsTarget}</div> : null}
                          {callsPct != null ? <div>Calls: {callsPct}% of {agent.target.callsTarget}</div> : null}
                        </div>
                      ) : (
                        "No target set"
                      )}
                    </td>
                    {canSetTargets ? (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          title="Set target"
                          onClick={() => {
                            setTargetForm({
                              leadsTarget: String(agent.target?.leadsTarget ?? 0),
                              callsTarget: String(agent.target?.callsTarget ?? 0),
                              dealsTarget: String(agent.target?.dealsTarget ?? 0),
                              propertiesTarget: String(agent.target?.propertiesTarget ?? 0),
                            });
                            setTargetAgent(agent);
                          }}
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
                        >
                          <Target size={14} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {targetAgent ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
            <h3 className="mb-3 text-sm font-bold text-[var(--text-main)]">Set targets — {targetAgent.name}</h3>
            <div className="space-y-3">
              {([
                ["leadsTarget", "Leads target"],
                ["callsTarget", "Calls target"],
                ["dealsTarget", "Deals target"],
                ["propertiesTarget", "Properties/farms target"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">{label}</label>
                  <input
                    type="number"
                    min={0}
                    value={targetForm[key]}
                    onChange={(e) => setTargetForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <CrmButton type="button" variant="secondary" onClick={() => setTargetAgent(null)} disabled={savingTarget}>
                Cancel
              </CrmButton>
              <CrmButton
                type="button"
                disabled={savingTarget}
                onClick={async () => {
                  if (!targetAgent) return;
                  setSavingTarget(true);
                  try {
                    const res = await fetch(`${CRM_API_URL}/crm/agent-targets/${targetAgent.agentId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...authHeaders() },
                      body: JSON.stringify({
                        leadsTarget: Number(targetForm.leadsTarget) || 0,
                        callsTarget: Number(targetForm.callsTarget) || 0,
                        dealsTarget: Number(targetForm.dealsTarget) || 0,
                        propertiesTarget: Number(targetForm.propertiesTarget) || 0,
                      }),
                    });
                    if (!res.ok) {
                      toast.error("Could not save targets");
                      return;
                    }
                    toast.success("Targets updated");
                    setTargetAgent(null);
                    void load();
                  } catch {
                    toast.error("Network error");
                  } finally {
                    setSavingTarget(false);
                  }
                }}
              >
                {savingTarget ? <Loader2 size={14} className="animate-spin" /> : "Save"}
              </CrmButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
