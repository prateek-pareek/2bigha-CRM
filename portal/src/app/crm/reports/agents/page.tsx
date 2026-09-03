"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Target, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";
import AgentPerformanceKPIs from "./AgentPerformanceKPIs";
import AgentComparisonChart from "./AgentComparisonChart";
import ConversionFunnelChart from "./ConversionFunnelChart";
import TargetVsActualChart from "./TargetVsActualChart";
import FollowUpAdherenceChart from "./FollowUpAdherenceChart";
import ResponseTimeChart from "./ResponseTimeChart";
import RevenueAttributionChart from "./RevenueAttributionChart";
import AdvancedReportFilters, { AdvancedAgentFilter } from "./AdvancedReportFilters";
import ExportButtons from "./ExportButtons";
import DetailedAgentView from "./DetailedAgentView";
import { AgentReportData } from "../lib/export-reports";

type AgentRow = {
  agentId: string;
  name: string;
  calls: number;
  activities: number;
  leadsCreated: number;
  leadsConverted: number;
  target: { leadsTarget: number; callsTarget: number; propertiesTarget: number } | null;
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
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [propertyCounts, setPropertyCounts] = useState<PropertyCounts>({});
  const [loading, setLoading] = useState(true);
  const [targetAgent, setTargetAgent] = useState<AgentRow | null>(null);
  const [targetForm, setTargetForm] = useState({ leadsTarget: "0", callsTarget: "0", propertiesTarget: "0" });
  const [savingTarget, setSavingTarget] = useState(false);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [filter, setFilter] = useState<AdvancedAgentFilter>({
    dateRange: "this_month",
    selectedAgents: [],
  });

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
        fetch(`${CRM_API_URL}/crm/reports/agents?window=${filter.dateRange}`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`${CRM_API_URL}/crm/property-listings/counts-by-agent`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      const leaderboard = leaderboardRes.ok ? await leaderboardRes.json() : { agents: [] };
      const properties = propertiesRes.ok ? await propertiesRes.json() : {};
      const allAgents = Array.isArray(leaderboard.agents) ? leaderboard.agents : [];
      setAgents(allAgents);
      setPropertyCounts(properties || {});
    } catch {
      setAgents([]);
      setPropertyCounts({});
    } finally {
      setLoading(false);
    }
  }, [filter, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAgents = agents.filter((agent) => {
    // Agent selection filter
    if (filter.selectedAgents.length > 0 && !filter.selectedAgents.includes(agent.agentId)) {
      return false;
    }

    // Name search filter
    if (filter.searchTerm && !agent.name.toLowerCase().includes(filter.searchTerm.toLowerCase())) {
      return false;
    }

    // Minimum leads created filter
    if (filter.leadsCreatedMin && agent.leadsCreated < filter.leadsCreatedMin) {
      return false;
    }

    // Conversion rate range filter
    const conversionRate = agent.leadsCreated > 0 ? (agent.leadsConverted / agent.leadsCreated) * 100 : 0;
    if (filter.conversionRateRange) {
      if (conversionRate < filter.conversionRateRange[0] || conversionRate > filter.conversionRateRange[1]) {
        return false;
      }
    }

    // Follow-up adherence minimum filter
    const followUpAdherence = agent.leadsCreated > 0 ? (agent.activities / (agent.leadsCreated * 3)) * 100 : 0;
    if (filter.followUpAdherenceMin && followUpAdherence < filter.followUpAdherenceMin) {
      return false;
    }

    // Performance level filter
    if (filter.performanceLevel && filter.performanceLevel !== "all") {
      if (filter.performanceLevel === "high" && conversionRate <= 20) return false;
      if (filter.performanceLevel === "medium" && (conversionRate < 10 || conversionRate > 20)) return false;
      if (filter.performanceLevel === "low" && conversionRate >= 10) return false;
    }

    // Target status filter
    if (filter.targetStatus && filter.targetStatus !== "all" && agent.target) {
      const targetProgress = (agent.leadsConverted / agent.target.leadsTarget) * 100;
      if (filter.targetStatus === "achieved" && targetProgress < 100) return false;
      if (filter.targetStatus === "on_track" && (targetProgress < 80 || targetProgress >= 100)) return false;
      if (filter.targetStatus === "behind" && targetProgress >= 80) return false;
    }

    return true;
  });

  // Build export data with calculated metrics
  const exportData: AgentReportData[] = filteredAgents.map((agent) => {
    const counts = propertyCounts[agent.agentId] || { propertyCount: 0, farmCount: 0 };
    const conversionRate = agent.leadsCreated > 0 ? Math.round((agent.leadsConverted / agent.leadsCreated) * 100) : 0;
    const followUpAdherence =
      agent.leadsCreated > 0
        ? Math.round((agent.activities / (agent.leadsCreated * 3)) * 100)
        : 0;
    const avgResponseTime =
      agent.leadsCreated > 0
        ? agent.activities / agent.leadsCreated >= 2
          ? "Fast"
          : agent.activities / agent.leadsCreated >= 1
            ? "Moderate"
            : "Slow"
        : "—";
    const baseRevenue = conversionRate * 50;
    const activityRevenue = agent.activities * 0.02 * 5000;
    const revenue = baseRevenue + activityRevenue;
    const targetProgress = agent.target
      ? Math.min(100, Math.round((agent.leadsConverted / agent.target.leadsTarget) * 100))
      : 0;

    return {
      agentId: agent.agentId,
      name: agent.name,
      calls: agent.calls,
      activities: agent.activities,
      leadsCreated: agent.leadsCreated,
      leadsConverted: agent.leadsConverted,
      conversionRate,
      followUpAdherence,
      responseTime: avgResponseTime,
      revenue,
      properties: counts.propertyCount,
      farms: counts.farmCount,
      leadsTarget: agent.target?.leadsTarget || 0,
      callsTarget: agent.target?.callsTarget || 0,
      targetProgress,
    };
  });

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Agent Performance"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Reports" }, { label: "Agent Performance" }]}
      />

      {/* Advanced Report Filters */}
      <div className="mb-6">
        <AdvancedReportFilters
          agents={agents.map((a) => ({
            agentId: a.agentId,
            name: a.name,
            conversionRate:
              a.leadsCreated > 0 ? Math.round((a.leadsConverted / a.leadsCreated) * 100) : 0,
            followUpAdherence:
              a.leadsCreated > 0 ? Math.round((a.activities / (a.leadsCreated * 3)) * 100) : 0,
            leadsCreated: a.leadsCreated,
          }))}
          filter={filter}
          onFilterChange={setFilter}
          onClearFilters={() =>
            setFilter({
              dateRange: "this_month",
              selectedAgents: [],
            })
          }
        />
      </div>

      {/* KPI Summary Cards */}
      <AgentPerformanceKPIs agents={agents} loading={loading} />

      {/* Core Performance Visualizations */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AgentComparisonChart agents={agents} loading={loading} />
        <ConversionFunnelChart agents={agents} loading={loading} />
      </div>

      {/* Follow-up & Response Time Analytics */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FollowUpAdherenceChart agents={agents} loading={loading} />
        <ResponseTimeChart agents={agents} loading={loading} />
      </div>

      {/* Revenue Attribution */}
      <div className="mb-6">
        <RevenueAttributionChart agents={agents} loading={loading} />
      </div>

      {/* Target Achievement */}
      <div className="mb-6">
        <TargetVsActualChart agents={agents} loading={loading} />
      </div>

      {/* Detailed Performance Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[var(--text-main)]">Detailed Performance</h3>
          <button
            type="button"
            onClick={() => setShowDetailedView(!showDetailedView)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            {showDetailedView ? <EyeOff size={14} /> : <Eye size={14} />}
            {showDetailedView ? "Hide Details" : "Show Details"}
          </button>
        </div>
        <ExportButtons data={exportData} fileName={`Agent_Performance_${filter.dateRange}`} disabled={loading} />
      </div>

      {/* Detailed View or Table */}
      {showDetailedView ? (
        <DetailedAgentView agents={filteredAgents} propertyCounts={propertyCounts} loading={loading} />
      ) : (
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
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No agent activity recorded for this window yet.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => {
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
      )}

      {targetAgent ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
            <h3 className="mb-3 text-sm font-bold text-[var(--text-main)]">Set targets — {targetAgent.name}</h3>
            <div className="space-y-3">
              {([
                ["leadsTarget", "Leads target"],
                ["callsTarget", "Calls target"],
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
