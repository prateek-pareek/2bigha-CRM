"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmPageHeader } from "@/components/crm/ui";
import TeamPerformanceKPIs from "./TeamPerformanceKPIs";
import TeamComparisonChart from "./TeamComparisonChart";
import LeadSourceConversionChart from "./LeadSourceConversionChart";
import LeadIntentAnalytics from "./LeadIntentAnalytics";
import WhatsAppEngagementChart from "./WhatsAppEngagementChart";
import IVRAnalyticsChart from "./IVRAnalyticsChart";
import AdvancedTeamFilters, { AdvancedTeamFilter } from "./AdvancedTeamFilters";
import TeamExportButtons from "./TeamExportButtons";
import DetailedTeamView from "./DetailedTeamView";
import { TeamReportData } from "../lib/export-reports";

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

type SourceData = {
  source: string;
  totalLeads: number;
  converted: number;
};

type IntentData = {
  intentLabel: string;
  totalWithIntent: number;
  converted: number;
};

const WINDOWS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
];

export default function TeamOrganizationsReportsPage() {
  const [teamData, setTeamData] = useState<TeamData[]>([]);
  const [sourceData, setSourceData] = useState<SourceData[]>([]);
  const [intentData, setIntentData] = useState<IntentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [filter, setFilter] = useState<AdvancedTeamFilter>({
    dateRange: "this_month",
    selectedTeams: [],
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
      const headers = authHeaders();

      // Fetch team performance metrics
      const teamRes = await fetch(`${CRM_API_URL}/crm/reports/teams?window=${filter.dateRange}`, {
        headers,
        cache: "no-store",
      });
      const teamApiData = teamRes.ok ? await teamRes.json() : { teams: [] };
      const allTeams = (teamApiData.teams || []) as TeamData[];

      // Fetch lead source conversion data
      const sourceRes = await fetch(`${CRM_API_URL}/crm/reports/lead-sources?window=${filter.dateRange}`, {
        headers,
        cache: "no-store",
      });
      const sourceApiData = sourceRes.ok ? await sourceRes.json() : { sources: [] };
      const allSources = (sourceApiData.sources || []) as SourceData[];

      // Fetch lead intent data
      const intentRes = await fetch(`${CRM_API_URL}/crm/reports/lead-intents?window=${filter.dateRange}`, {
        headers,
        cache: "no-store",
      });
      const intentApiData = intentRes.ok ? await intentRes.json() : { intents: [] };
      const allIntents = (intentApiData.intents || []) as IntentData[];

      setTeamData(allTeams);
      setSourceData(allSources);
      setIntentData(allIntents);
    } catch (error) {
      console.error("Error loading team data:", error);
      toast.error("Failed to load team reports");
      setTeamData([]);
      setSourceData([]);
      setIntentData([]);
    } finally {
      setLoading(false);
    }
  }, [filter, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTeams = teamData.filter((team) => {
    // Team selection filter
    if (filter.selectedTeams.length > 0 && !filter.selectedTeams.includes(team.teamId || "")) {
      return false;
    }

    // Name search filter
    if (filter.searchTerm && !team.teamName.toLowerCase().includes(filter.searchTerm.toLowerCase())) {
      return false;
    }

    // Team size range filter
    if (filter.teamSizeRange) {
      if (team.teamSize < filter.teamSizeRange[0] || team.teamSize > filter.teamSizeRange[1]) {
        return false;
      }
    }

    // Conversion rate range filter
    const conversionRate = team.totalLeads > 0 ? (team.leadsConverted / team.totalLeads) * 100 : 0;
    if (filter.conversionRateRange) {
      if (conversionRate < filter.conversionRateRange[0] || conversionRate > filter.conversionRateRange[1]) {
        return false;
      }
    }

    // WhatsApp read rate minimum filter
    const readRate = team.messagesOutbound > 0 ? (team.messagesRead / team.messagesOutbound) * 100 : 0;
    if (filter.whatsappReadRateMin && readRate < filter.whatsappReadRateMin) {
      return false;
    }

    // Call completion rate minimum filter
    const completionRate = team.incomingCalls > 0 ? (team.completedCalls / team.incomingCalls) * 100 : 0;
    if (filter.callCompletionRateMin && completionRate < filter.callCompletionRateMin) {
      return false;
    }

    // Performance level filter (based on composite score)
    if (filter.performanceLevel && filter.performanceLevel !== "all") {
      const teamScore = Math.round(
        (conversionRate * 0.3 + readRate * 0.3 + completionRate * 0.4) / 10
      ) * 10;
      if (filter.performanceLevel === "excellent" && teamScore < 80) return false;
      if (filter.performanceLevel === "good" && (teamScore < 60 || teamScore >= 80)) return false;
      if (filter.performanceLevel === "needs_improvement" && teamScore >= 60) return false;
    }

    // Engagement level filter (based on calls per member)
    if (filter.engagementLevel && filter.engagementLevel !== "all") {
      const callsPerMember = team.totalCalls / Math.max(1, team.teamSize);
      if (filter.engagementLevel === "high" && callsPerMember <= 5) return false;
      if (filter.engagementLevel === "medium" && (callsPerMember < 2 || callsPerMember > 5)) return false;
      if (filter.engagementLevel === "low" && callsPerMember >= 2) return false;
    }

    return true;
  });

  // Build export data with calculated metrics
  const exportData: TeamReportData[] = filteredTeams.map((team) => ({
    teamId: team.teamId || "",
    teamName: team.teamName,
    teamSize: team.teamSize,
    totalCalls: team.totalCalls,
    totalLeads: team.totalLeads,
    leadsConverted: team.leadsConverted,
    conversionRate: team.totalLeads > 0 ? Math.round((team.leadsConverted / team.totalLeads) * 100) : 0,
    messagesOutbound: team.messagesOutbound,
    messagesRead: team.messagesRead,
    readRate: team.messagesOutbound > 0 ? Math.round((team.messagesRead / team.messagesOutbound) * 100) : 0,
    incomingCalls: team.incomingCalls,
    missedCalls: team.missedCalls,
    missedRate: team.incomingCalls > 0 ? Math.round((team.missedCalls / team.incomingCalls) * 100) : 0,
  }));

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Team & Organizations"
        bordered={false}
        breadcrumbs={[
          { label: "Home", href: "/crm" },
          { label: "Reports & Analytics" },
          { label: "Team & Organizations" },
        ]}
      />

      {/* Advanced Report Filters */}
      <div className="mb-6">
        <AdvancedTeamFilters
          teams={teamData.map((t) => ({
            teamId: t.teamId,
            teamName: t.teamName,
            teamSize: t.teamSize,
            totalCalls: t.totalCalls,
            totalLeads: t.totalLeads,
            leadsConverted: t.leadsConverted,
            messagesRead: t.messagesRead,
            messagesOutbound: t.messagesOutbound,
          }))}
          filter={filter}
          onFilterChange={setFilter}
          onClearFilters={() =>
            setFilter({
              dateRange: "this_month",
              selectedTeams: [],
            })
          }
        />
      </div>

      {/* KPI Summary */}
      <TeamPerformanceKPIs teamData={teamData} loading={loading} />

      {/* Team Comparison & Lead Source */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TeamComparisonChart teamData={teamData} loading={loading} />
        <LeadSourceConversionChart sourceData={sourceData} loading={loading} />
      </div>

      {/* Lead Intent & WhatsApp */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeadIntentAnalytics intentData={intentData} loading={loading} />
        <WhatsAppEngagementChart teamData={teamData} loading={loading} />
      </div>

      {/* IVR Analytics */}
      <div className="mb-6">
        <IVRAnalyticsChart teamData={teamData} loading={loading} />
      </div>

      {/* Detailed Team Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[var(--text-main)]">Detailed Team Metrics</h3>
          <button
            type="button"
            onClick={() => setShowDetailedView(!showDetailedView)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            {showDetailedView ? <EyeOff size={14} /> : <Eye size={14} />}
            {showDetailedView ? "Hide Details" : "Show Details"}
          </button>
        </div>
        <TeamExportButtons data={exportData} fileName={`Team_Report_${filter.dateRange}`} disabled={loading} />
      </div>

      {/* Detailed View or Table */}
      {showDetailedView ? (
        <DetailedTeamView teams={filteredTeams} loading={loading} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Team Name</th>
                <th className="px-4 py-2.5">Size</th>
                <th className="px-4 py-2.5">Calls</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Converted</th>
                <th className="px-4 py-2.5">Conv Rate</th>
                <th className="px-4 py-2.5">WhatsApp</th>
                <th className="px-4 py-2.5">Read Rate</th>
                <th className="px-4 py-2.5">Missed Calls</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    <Loader2 size={16} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No team data available for this period
                  </td>
                </tr>
              ) : (
                filteredTeams.map((team) => {
                  const convRate =
                    team.totalLeads > 0
                      ? Math.round((team.leadsConverted / team.totalLeads) * 100)
                      : 0;
                  const readRate =
                    team.messagesOutbound > 0
                      ? Math.round((team.messagesRead / team.messagesOutbound) * 100)
                      : 0;
                  const missedRate =
                    team.incomingCalls > 0
                      ? Math.round((team.missedCalls / team.incomingCalls) * 100)
                      : 0;

                  return (
                    <tr
                      key={team.teamId}
                      className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]"
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">
                        {team.teamName}
                      </td>
                      <td className="px-4 py-2.5">{team.teamSize}</td>
                      <td className="px-4 py-2.5">{team.totalCalls}</td>
                      <td className="px-4 py-2.5">{team.totalLeads}</td>
                      <td className="px-4 py-2.5 font-semibold text-[#10b981]">
                        {team.leadsConverted}
                      </td>
                      <td className="px-4 py-2.5">{convRate}%</td>
                      <td className="px-4 py-2.5">{team.messagesOutbound}</td>
                      <td className="px-4 py-2.5 font-semibold text-[#10b981]">
                        {readRate}%
                      </td>
                      <td className="px-4 py-2.5 text-[#ef4444]">
                        {team.missedCalls} ({missedRate}%)
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
