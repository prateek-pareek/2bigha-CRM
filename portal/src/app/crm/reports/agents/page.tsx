"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Target, Eye, EyeOff, CalendarClock } from "lucide-react";
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
import AgentSkillRadarChart from "./AgentSkillRadarChart";
import AgentPropertiesChart from "./AgentPropertiesChart";
import AgentPerformanceTrendChart from "./AgentPerformanceTrendChart";
import AdvancedReportFilters, { AdvancedAgentFilter } from "./AdvancedReportFilters";
import ExportButtons from "./ExportButtons";
import DetailedAgentView from "./DetailedAgentView";
import ScheduleReportModal from "../_components/ScheduleReportModal";
import { ReportScopeBar } from "../_components/ReportScopeBar";
import {
  fetchPerformanceReport,
  formatINR,
  formatMinutes,
  summarize,
  windowParam,
  type AgentReportRow,
  type PerformanceReport,
} from "../lib/performance-report";

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const DEFAULT_FILTER: AdvancedAgentFilter = { dateRange: "this_month", selectedAgents: [], selectedTeams: [] };

function progressPct(actual: number, target: number): number | null {
  if (!target) return null;
  return Math.min(100, Math.round((actual / target) * 100));
}

/**
 * Agent Performance (FRD §14.1) — calls, conversions, follow-up adherence, first-response
 * time, properties/farms listed and 2bigha subscription revenue per agent. Live and
 * role-scoped by the API: Admin sees everyone, a Team Lead their team, an Agent themself.
 */
export default function AgentPerformancePage() {
  const { hasAccess } = usePermissions();
  const canSetTargets = hasAccess("settings:admin");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Everyone seen in unfiltered loads, so the Agent/Team pickers keep their options when filtered. */
  const [roster, setRoster] = useState<Map<string, AgentReportRow>>(new Map());
  const [targetAgent, setTargetAgent] = useState<AgentReportRow | null>(null);
  const [targetForm, setTargetForm] = useState({ leadsTarget: "0", callsTarget: "0", propertiesTarget: "0" });
  const [savingTarget, setSavingTarget] = useState(false);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [filter, setFilter] = useState<AdvancedAgentFilter>(DEFAULT_FILTER);
  const abortRef = useRef<AbortController | null>(null);

  const win = windowParam(filter);
  const agentsKey = filter.selectedAgents.join(",");
  const teamsKey = (filter.selectedTeams || []).join(",");

  const load = useCallback(async (fresh = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const data = await fetchPerformanceReport({
        window: win,
        agents: agentsKey ? agentsKey.split(",") : [],
        teams: teamsKey ? teamsKey.split(",") : [],
        fresh,
        signal: ctrl.signal,
      });
      setReport(data);
      setError(null);
      setRoster((prev) => {
        const next = new Map(prev);
        for (const a of data.agents) next.set(a.agentId, a);
        return next;
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setError("Could not load the agent report. Check your connection and permissions, then refresh.");
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, [win, agentsKey, teamsKey]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const agents = report?.agents ?? [];

  const agentOptions = useMemo(
    () =>
      [...roster.values()]
        .sort((x, y) => x.name.localeCompare(y.name))
        .map((a) => ({ agentId: a.agentId, name: a.name, conversionRate: a.conversionRate, leadsCreated: a.leadsCreated })),
    [roster],
  );
  const teamOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of roster.values()) m.set(a.teamId, a.teamName);
    return [...m.entries()].map(([teamId, teamName]) => ({ teamId, teamName })).sort((x, y) => x.teamName.localeCompare(y.teamName));
  }, [roster]);

  // Client-side refinements (search / performance level / target status) on top of the server scope.
  const clientFiltered = !!(
    filter.searchTerm ||
    (filter.performanceLevel && filter.performanceLevel !== "all") ||
    (filter.targetStatus && filter.targetStatus !== "all")
  );
  const filteredAgents = useMemo(
    () =>
      agents.filter((a) => {
        if (filter.searchTerm && !a.name.toLowerCase().includes(filter.searchTerm.toLowerCase())) return false;
        if (filter.performanceLevel && filter.performanceLevel !== "all") {
          const c = a.conversionRate;
          if (filter.performanceLevel === "high" && c <= 20) return false;
          if (filter.performanceLevel === "medium" && (c < 10 || c > 20)) return false;
          if (filter.performanceLevel === "low" && c >= 10) return false;
        }
        if (filter.targetStatus && filter.targetStatus !== "all") {
          const p = a.target ? progressPct(a.leadsCreated, a.target.leadsTarget) : null;
          if (p == null) return false;
          if (filter.targetStatus === "achieved" && p < 100) return false;
          if (filter.targetStatus === "on_track" && (p < 80 || p >= 100)) return false;
          if (filter.targetStatus === "behind" && p >= 80) return false;
        }
        return true;
      }),
    [agents, filter.searchTerm, filter.performanceLevel, filter.targetStatus],
  );

  // Unfiltered → server totals (include records not linked to an agent); filtered → sum of shown rows.
  const kpiTotals = report ? (clientFiltered ? summarize(filteredAgents) : report.totals) : null;
  const periodLabel = report ? `${report.range.from} to ${report.range.to}` : "";

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Agent Performance"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Reports" }, { label: "Agent Performance" }]}
      />

      <div className="mb-2">
        <AdvancedReportFilters
          agents={agentOptions}
          teams={teamOptions}
          filter={filter}
          onFilterChange={setFilter}
          onClearFilters={() => setFilter(DEFAULT_FILTER)}
        />
      </div>

      <ReportScopeBar report={report} loading={loading} onRefresh={() => void load(true)} error={error} />

      <AgentPerformanceKPIs
        totals={kpiTotals}
        previous={report?.previousTotals ?? null}
        showTrends={!clientFiltered}
        compareLabel={report?.range.compareLabel}
        loading={loading && !report}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AgentPerformanceTrendChart trendData={report?.trend ?? []} loading={loading && !report} />
        <AgentComparisonChart agents={filteredAgents} loading={loading && !report} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AgentSkillRadarChart agents={filteredAgents} loading={loading && !report} />
        <ConversionFunnelChart agents={filteredAgents} loading={loading && !report} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FollowUpAdherenceChart agents={filteredAgents} loading={loading && !report} />
        <ResponseTimeChart agents={filteredAgents} loading={loading && !report} />
        <AgentPropertiesChart agents={filteredAgents} loading={loading && !report} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueAttributionChart agents={filteredAgents} loading={loading && !report} />
        <TargetVsActualChart agents={filteredAgents} loading={loading && !report} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[var(--text-main)]">Detailed Performance</h3>
          <button
            type="button"
            onClick={() => setShowDetailedView(!showDetailedView)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            {showDetailedView ? <EyeOff size={14} /> : <Eye size={14} />}
            {showDetailedView ? "Hide Details" : "Show Details"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScheduleModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <CalendarClock size={14} />
            Schedule
          </button>
          <ExportButtons
            data={filteredAgents}
            fileName={`Agent_Performance_${report?.range.from || win}_${report?.range.to || ""}`}
            subtitle={periodLabel}
            disabled={loading}
          />
        </div>
      </div>

      {showDetailedView ? (
        <DetailedAgentView agents={filteredAgents} loading={loading && !report} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Agent</th>
                <th className="px-4 py-2.5">Team</th>
                <th className="px-4 py-2.5">Calls</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Converted</th>
                <th className="px-4 py-2.5">Follow-up</th>
                <th className="px-4 py-2.5">Avg response</th>
                <th className="px-4 py-2.5">Properties</th>
                <th className="px-4 py-2.5">Farms</th>
                <th className="px-4 py-2.5">WhatsApp</th>
                <th className="px-4 py-2.5">Revenue</th>
                <th className="px-4 py-2.5">Target vs actual</th>
                {canSetTargets ? <th className="px-4 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {loading && !report ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    <Loader2 size={16} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No agents match these filters.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => {
                  const leadsPct = agent.target ? progressPct(agent.leadsCreated, agent.target.leadsTarget) : null;
                  const callsPct = agent.target ? progressPct(agent.calls, agent.target.callsTarget) : null;
                  const listPct = agent.target ? progressPct(agent.listingsTotal, agent.target.propertiesTarget) : null;
                  return (
                    <tr key={agent.agentId} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">{agent.name}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{agent.teamName}</td>
                      <td className="px-4 py-2.5">
                        {agent.calls}
                        <span className="ml-1 text-xs text-[var(--text-muted)]">({agent.connectedCalls} conn.)</span>
                      </td>
                      <td className="px-4 py-2.5">{agent.leadsCreated}</td>
                      <td className="px-4 py-2.5">
                        {agent.leadsConverted}
                        <span className="ml-1 text-xs text-[var(--text-muted)]">({agent.conversionRate}%)</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {agent.followUpAdherence == null ? "—" : `${agent.followUpAdherence}%`}
                        {agent.followUpsDue ? (
                          <span className="ml-1 text-xs text-[var(--text-muted)]">
                            ({agent.followUpsDone}/{agent.followUpsDue})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">{formatMinutes(agent.avgResponseMins)}</td>
                      <td className="px-4 py-2.5">{agent.properties}</td>
                      <td className="px-4 py-2.5">{agent.farms}</td>
                      <td className="px-4 py-2.5">
                        {agent.whatsappSent}
                        <span className="ml-1 text-xs text-[var(--text-muted)]">({agent.whatsappRead} read)</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {formatINR(agent.revenue)}
                        {agent.subscriptionSales ? (
                          <span className="ml-1 text-xs text-[var(--text-muted)]">({agent.subscriptionSales})</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {agent.target && (leadsPct != null || callsPct != null || listPct != null) ? (
                          <div className="space-y-0.5">
                            {leadsPct != null ? <div>Leads: {leadsPct}% of {agent.target.leadsTarget}</div> : null}
                            {callsPct != null ? <div>Calls: {callsPct}% of {agent.target.callsTarget}</div> : null}
                            {listPct != null ? <div>Listings: {listPct}% of {agent.target.propertiesTarget}</div> : null}
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
                    const token = getCrmAuthToken();
                    const res = await fetch(`${CRM_API_URL}/crm/agent-targets/${targetAgent.agentId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
                    void load(true);
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

      <ScheduleReportModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        reportType="agent"
        currentFilters={filter}
      />
    </div>
  );
}
