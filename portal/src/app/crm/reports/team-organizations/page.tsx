"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Eye, EyeOff, CalendarClock, Store } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/ui";
import TeamPerformanceKPIs from "./TeamPerformanceKPIs";
import TeamComparisonChart from "./TeamComparisonChart";
import LeadSourceConversionChart from "./LeadSourceConversionChart";
import LeadIntentAnalytics from "./LeadIntentAnalytics";
import WhatsAppEngagementChart from "./WhatsAppEngagementChart";
import IVRAnalyticsChart from "./IVRAnalyticsChart";
import OrganizationTargetGauge from "./OrganizationTargetGauge";
import TeamPerformanceTrendChart from "./TeamPerformanceTrendChart";
import TeamActivityAreaChart from "./TeamActivityAreaChart";
import AdvancedTeamFilters, { AdvancedTeamFilter } from "./AdvancedTeamFilters";
import TeamExportButtons from "./TeamExportButtons";
import DetailedTeamView from "./DetailedTeamView";
import ScheduleReportModal from "../_components/ScheduleReportModal";
import { ReportScopeBar } from "../_components/ReportScopeBar";
import {
  fetchPerformanceReport,
  fetchTwoBighaInventory,
  formatINR,
  summarize,
  windowParam,
  type PerformanceReport,
  type TeamReportRow,
  type TwoBighaInventory,
} from "../lib/performance-report";

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const DEFAULT_FILTER: AdvancedTeamFilter = { dateRange: "this_month", selectedTeams: [] };

function TwoBighaInventoryCard({ data }: { data: TwoBighaInventory | null }) {
  if (!data || data.restricted) return null;
  const block = (label: string, stats: TwoBighaInventory["properties"]) => (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-bold text-[var(--text-main)]">{stats ? stats.total.toLocaleString() : "—"}</p>
      {stats ? (
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {Object.entries(stats.byStatus)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n.toLocaleString()} ${k.toLowerCase()}`)
            .join(" · ") || "—"}
        </p>
      ) : null}
    </div>
  );
  return (
    <div className="mb-6 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Store size={16} className="text-[var(--primary)]" />
        <h3 className="text-sm font-bold text-[var(--text-main)]">2bigha Marketplace (live)</h3>
        <span className="text-xs text-[var(--text-muted)]">
          {data.connected ? "All listings on 2bigha right now — not limited to the period" : "2bigha API not reachable"}
        </span>
      </div>
      <div className="flex flex-wrap gap-6">
        {block("Properties", data.properties)}
        {block("Farms", data.farms)}
      </div>
    </div>
  );
}

/**
 * Team & Organization reports (FRD §14.2) — team roll-ups, lead source/intent conversion,
 * WhatsApp and IVR engagement. Live and role-scoped: Admin sees every team, a Team Lead
 * their own team, an Agent only themself.
 */
export default function TeamOrganizationsReportsPage() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [inventory, setInventory] = useState<TwoBighaInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Every team seen in unfiltered loads, so the Team picker keeps its options when filtered. */
  const [teamRoster, setTeamRoster] = useState<Map<string, TeamReportRow>>(new Map());
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [filter, setFilter] = useState<AdvancedTeamFilter>(DEFAULT_FILTER);
  const abortRef = useRef<AbortController | null>(null);

  const win = windowParam(filter);
  const teamsKey = filter.selectedTeams.join(",");

  const load = useCallback(
    async (fresh = false) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const data = await fetchPerformanceReport({
          window: win,
          teams: teamsKey ? teamsKey.split(",") : [],
          fresh,
          signal: ctrl.signal,
        });
        setReport(data);
        setError(null);
        setTeamRoster((prev) => {
          const next = new Map(prev);
          for (const t of data.teams) next.set(t.teamId, t);
          return next;
        });
        if (data.scope.tier === "org") {
          void fetchTwoBighaInventory(ctrl.signal).then((inv) => {
            if (!ctrl.signal.aborted) setInventory(inv);
          });
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError("Could not load the team report. Check your connection and permissions, then refresh.");
      } finally {
        if (abortRef.current === ctrl) setLoading(false);
      }
    },
    [win, teamsKey],
  );

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const teams = report?.teams ?? [];
  const clientFiltered = !!(
    filter.searchTerm ||
    filter.teamSizeRange ||
    filter.conversionRateRange ||
    filter.whatsappReadRateMin ||
    filter.callCompletionRateMin ||
    (filter.performanceLevel && filter.performanceLevel !== "all") ||
    (filter.engagementLevel && filter.engagementLevel !== "all")
  );

  const filteredTeams = useMemo(
    () =>
      teams.filter((team) => {
        if (filter.searchTerm && !team.teamName.toLowerCase().includes(filter.searchTerm.toLowerCase())) return false;
        if (filter.teamSizeRange && (team.teamSize < filter.teamSizeRange[0] || team.teamSize > filter.teamSizeRange[1])) return false;
        if (
          filter.conversionRateRange &&
          (team.conversionRate < filter.conversionRateRange[0] || team.conversionRate > filter.conversionRateRange[1])
        )
          return false;
        if (filter.whatsappReadRateMin && team.whatsappReadRate < filter.whatsappReadRateMin) return false;
        if (filter.callCompletionRateMin && team.connectRate < filter.callCompletionRateMin) return false;
        if (filter.performanceLevel && filter.performanceLevel !== "all") {
          // Composite of conversion, WhatsApp read rate and call connect rate (0–100).
          const score = Math.round(team.conversionRate * 0.3 + team.whatsappReadRate * 0.3 + team.connectRate * 0.4);
          if (filter.performanceLevel === "excellent" && score < 80) return false;
          if (filter.performanceLevel === "good" && (score < 60 || score >= 80)) return false;
          if (filter.performanceLevel === "needs_improvement" && score >= 60) return false;
        }
        if (filter.engagementLevel && filter.engagementLevel !== "all") {
          const perMember = team.calls / Math.max(1, team.teamSize);
          if (filter.engagementLevel === "high" && perMember <= 5) return false;
          if (filter.engagementLevel === "medium" && (perMember < 2 || perMember > 5)) return false;
          if (filter.engagementLevel === "low" && perMember >= 2) return false;
        }
        return true;
      }),
    [teams, filter],
  );

  const kpiTotals = report ? (clientFiltered ? summarize(filteredTeams) : report.totals) : null;
  const targets = useMemo(() => {
    if (!report) return null;
    if (!clientFiltered) return report.targets;
    const t = summarize(filteredTeams);
    const sum = (k: "leads" | "calls" | "listings") => filteredTeams.reduce((s, x) => s + (x.targets?.[k] || 0), 0);
    return {
      leads: { actual: t.leadsCreated, target: sum("leads") },
      calls: { actual: t.calls, target: sum("calls") },
      listings: { actual: t.listingsTotal, target: sum("listings") },
    };
  }, [report, clientFiltered, filteredTeams]);

  const teamOptions = useMemo(() => [...teamRoster.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)), [teamRoster]);
  const initial = loading && !report;

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Team & Organizations"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Reports & Analytics" }, { label: "Team & Organizations" }]}
      />

      <div className="mb-2">
        <AdvancedTeamFilters
          teams={teamOptions.map((t) => ({
            teamId: t.teamId,
            teamName: t.teamName,
            teamSize: t.teamSize,
            totalCalls: t.calls,
            totalLeads: t.leadsCreated,
            leadsConverted: t.leadsConverted,
            messagesRead: t.whatsappRead,
            messagesOutbound: t.whatsappSent,
          }))}
          filter={filter}
          onFilterChange={setFilter}
          onClearFilters={() => setFilter(DEFAULT_FILTER)}
        />
      </div>

      <ReportScopeBar report={report} loading={loading} onRefresh={() => void load(true)} error={error} />

      <TeamPerformanceKPIs
        totals={kpiTotals}
        previous={report?.previousTotals ?? null}
        showTrends={!clientFiltered}
        teamCount={filteredTeams.length}
        memberCount={filteredTeams.reduce((s, t) => s + t.teamSize, 0)}
        compareLabel={report?.range.compareLabel}
        loading={initial}
      />

      {report?.scope.tier === "org" ? <TwoBighaInventoryCard data={inventory} /> : null}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <OrganizationTargetGauge
          targets={targets}
          title={report?.scope.tier === "org" ? "Organization Target" : "Team Target"}
          loading={initial}
        />
        <TeamPerformanceTrendChart trendData={report?.teamTrend ?? null} loading={initial} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeamComparisonChart teamData={filteredTeams} loading={initial} />
        <LeadSourceConversionChart sourceData={report?.sources ?? []} loading={initial} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        <LeadIntentAnalytics intentData={report?.intents ?? []} loading={initial} />
        <TeamActivityAreaChart trendData={report?.teamTrend ?? null} loading={initial} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WhatsAppEngagementChart
          engagement={report?.engagement.whatsapp ?? null}
          trend={report?.trend ?? []}
          teams={filteredTeams}
          loading={initial}
        />
        <IVRAnalyticsChart ivr={report?.engagement.ivr ?? null} trend={report?.trend ?? []} teams={filteredTeams} loading={initial} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[var(--text-main)]">Detailed Team Metrics</h3>
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
          <TeamExportButtons
            data={filteredTeams}
            fileName={`Team_Report_${report?.range.from || win}_${report?.range.to || ""}`}
            subtitle={report ? `${report.range.from} to ${report.range.to}` : undefined}
            disabled={loading}
          />
        </div>
      </div>

      {showDetailedView ? (
        <DetailedTeamView teams={filteredTeams} agents={report?.agents ?? []} loading={initial} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Team</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="px-4 py-2.5">Calls</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Converted</th>
                <th className="px-4 py-2.5">Follow-up</th>
                <th className="px-4 py-2.5">Listings</th>
                <th className="px-4 py-2.5">WhatsApp</th>
                <th className="px-4 py-2.5">Read rate</th>
                <th className="px-4 py-2.5">Missed calls</th>
                <th className="px-4 py-2.5">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {initial ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    <Loader2 size={16} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No teams match these filters.
                  </td>
                </tr>
              ) : (
                filteredTeams.map((team) => (
                  <tr key={team.teamId} className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">{team.teamName}</td>
                    <td className="px-4 py-2.5">{team.teamSize}</td>
                    <td className="px-4 py-2.5">
                      {team.calls}
                      <span className="ml-1 text-xs text-[var(--text-muted)]">({team.connectRate}% conn.)</span>
                    </td>
                    <td className="px-4 py-2.5">{team.leadsCreated}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#10b981]">
                      {team.leadsConverted}
                      <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">({team.conversionRate}%)</span>
                    </td>
                    <td className="px-4 py-2.5">{team.followUpAdherence == null ? "—" : `${team.followUpAdherence}%`}</td>
                    <td className="px-4 py-2.5">{team.listingsTotal}</td>
                    <td className="px-4 py-2.5">{team.whatsappSent}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#10b981]">{team.whatsappReadRate}%</td>
                    <td className="px-4 py-2.5 text-[#ef4444]">
                      {team.missedCalls}
                      <span className="ml-1 text-xs text-[var(--text-muted)]">({team.missedRate}%)</span>
                    </td>
                    <td className="px-4 py-2.5">{formatINR(team.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <ScheduleReportModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        reportType="team"
        currentFilters={filter}
      />
    </div>
  );
}
