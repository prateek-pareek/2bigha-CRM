"use client";

import { Filter, X, ChevronDown, Search } from "lucide-react";
import { useState, useMemo } from "react";

export type AdvancedTeamFilter = {
  dateRange: "today" | "this_week" | "this_month" | "custom";
  customDateStart?: string;
  customDateEnd?: string;
  selectedTeams: string[];
  teamSizeRange?: [number, number];
  performanceLevel?: "all" | "excellent" | "good" | "needs_improvement";
  conversionRateRange?: [number, number];
  whatsappReadRateMin?: number;
  callCompletionRateMin?: number;
  searchTerm?: string;
  engagementLevel?: "all" | "high" | "medium" | "low";
};

type TeamData = {
  teamId?: string;
  teamName: string;
  teamSize: number;
  totalCalls?: number;
  totalLeads?: number;
  leadsConverted?: number;
  messagesRead?: number;
  messagesOutbound?: number;
};

type Props = {
  teams: TeamData[];
  filter: AdvancedTeamFilter;
  onFilterChange: (filter: AdvancedTeamFilter) => void;
  onClearFilters: () => void;
};

export default function AdvancedTeamFilters({
  teams,
  filter,
  onFilterChange,
  onClearFilters,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [showCustomDates, setShowCustomDates] = useState(filter.dateRange === "custom");

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => t.teamName.toLowerCase().includes(teamSearch.toLowerCase()));
  }, [teams, teamSearch]);

  const activeFilterCount = [
    filter.selectedTeams.length > 0,
    filter.teamSizeRange && (filter.teamSizeRange[0] > 1 || filter.teamSizeRange[1] < 100),
    filter.performanceLevel !== "all",
    filter.conversionRateRange && filter.conversionRateRange[0] > 0,
    filter.whatsappReadRateMin,
    filter.callCompletionRateMin,
    filter.searchTerm,
    filter.engagementLevel !== "all",
    filter.dateRange !== "this_month",
  ].filter(Boolean).length;

  const toggleTeam = (teamId: string) => {
    const updated = filter.selectedTeams.includes(teamId)
      ? filter.selectedTeams.filter((id) => id !== teamId)
      : [...filter.selectedTeams, teamId];
    onFilterChange({ ...filter, selectedTeams: updated });
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--primary)]/10 p-2.5">
            <Filter size={18} className="text-[var(--primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-main)]">Advanced Filters</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {activeFilterCount > 0
                ? `${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} applied`
                : "No filters applied"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)] transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors flex items-center gap-1.5"
          >
            {showAdvanced ? "Hide" : "Show"} filters
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Panels */}
      {showAdvanced && (
        <div className="space-y-4">
          {/* Row 1: Date & Performance */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Date Range */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📅 Date Range
              </label>
              <select
                value={filter.dateRange}
                onChange={(e) => {
                  const val = e.target.value as AdvancedTeamFilter["dateRange"];
                  setShowCustomDates(val === "custom");
                  onFilterChange({ ...filter, dateRange: val });
                }}
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              >
                <option value="today">Today</option>
                <option value="this_week">This week</option>
                <option value="this_month">This month</option>
                <option value="custom">Custom range</option>
              </select>

              {showCustomDates && (
                <div className="mt-3 space-y-2">
                  <input
                    type="date"
                    value={filter.customDateStart || ""}
                    onChange={(e) => onFilterChange({ ...filter, customDateStart: e.target.value })}
                    className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
                    placeholder="From date"
                  />
                  <input
                    type="date"
                    value={filter.customDateEnd || ""}
                    onChange={(e) => onFilterChange({ ...filter, customDateEnd: e.target.value })}
                    className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
                    placeholder="To date"
                  />
                </div>
              )}
            </div>

            {/* Performance Level */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📊 Performance Level
              </label>
              <select
                value={filter.performanceLevel || "all"}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    performanceLevel: e.target.value as AdvancedTeamFilter["performanceLevel"],
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              >
                <option value="all">All levels</option>
                <option value="excellent">🟢 Excellent (80 and above)</option>
                <option value="good">🟡 Good (60-79)</option>
                <option value="needs_improvement">🔴 Needs Improvement (below 60)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Teams & Size */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Team Selection */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                👥 Select Teams
                {filter.selectedTeams.length > 0 && (
                  <span className="ml-2 inline-block rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs text-white font-bold">
                    {filter.selectedTeams.length}
                  </span>
                )}
              </label>

              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] pl-9 pr-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
                />
              </div>

              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-2.5">
                {filteredTeams.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-4">No teams found</p>
                ) : (
                  filteredTeams.map((team) => (
                    <label
                      key={team.teamId}
                      className="flex items-center gap-2.5 cursor-pointer rounded-md hover:bg-[var(--card-bg)] p-2 text-sm transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={filter.selectedTeams.includes(team.teamId || "")}
                        onChange={() => toggleTeam(team.teamId || "")}
                        className="rounded w-4 h-4 accent-[var(--primary)]"
                      />
                      <span className="text-[var(--text-main)] font-medium flex-1">{team.teamName}</span>
                      <span className="text-xs text-[var(--text-muted)]">({team.teamSize})</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Team Size Range */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                👫 Team Size Range
              </label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[var(--text-main)] font-semibold">
                  <span>{filter.teamSizeRange?.[0] || 1} members</span>
                  <span>{filter.teamSizeRange?.[1] || 100} members</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={filter.teamSizeRange?.[0] || 1}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      teamSizeRange: [Number(e.target.value), filter.teamSizeRange?.[1] || 100],
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={filter.teamSizeRange?.[1] || 100}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      teamSizeRange: [filter.teamSizeRange?.[0] || 1, Number(e.target.value)],
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Conversion & Engagement */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Conversion Rate */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📈 Conversion Rate Range
              </label>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[var(--text-main)] font-semibold">
                  <span>{filter.conversionRateRange?.[0] || 0}%</span>
                  <span>{filter.conversionRateRange?.[1] || 100}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filter.conversionRateRange?.[0] || 0}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      conversionRateRange: [Number(e.target.value), filter.conversionRateRange?.[1] || 100],
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filter.conversionRateRange?.[1] || 100}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      conversionRateRange: [filter.conversionRateRange?.[0] || 0, Number(e.target.value)],
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
              </div>
            </div>

            {/* Engagement Level */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                ⚡ Engagement Level
              </label>
              <select
                value={filter.engagementLevel || "all"}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    engagementLevel: e.target.value as AdvancedTeamFilter["engagementLevel"],
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              >
                <option value="all">All levels</option>
                <option value="high">🟢 High (above 5 calls/member)</option>
                <option value="medium">🟡 Medium (2-5 calls/member)</option>
                <option value="low">🔴 Low (below 2 calls/member)</option>
              </select>
            </div>
          </div>

          {/* Row 4: WhatsApp & Calls */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* WhatsApp Read Rate */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                💬 Min WhatsApp Read Rate
              </label>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-[var(--text-main)]">{filter.whatsappReadRateMin || 0}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filter.whatsappReadRateMin || 0}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      whatsappReadRateMin: Number(e.target.value) || undefined,
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
              </div>
            </div>

            {/* Call Completion Rate */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                ☎️ Min Call Completion Rate
              </label>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-[var(--text-main)]">{filter.callCompletionRateMin || 0}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filter.callCompletionRateMin || 0}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      callCompletionRateMin: Number(e.target.value) || undefined,
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Row 5: Search */}
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
            <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              🔍 Search by Team Name
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search team names..."
                value={filter.searchTerm || ""}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    searchTerm: e.target.value || undefined,
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] pl-9 pr-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 p-3">
          {filter.dateRange !== "this_month" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              📅 {filter.dateRange}
              <button
                onClick={() => onFilterChange({ ...filter, dateRange: "this_month" })}
                className="hover:text-[var(--primary)]/70"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {filter.selectedTeams.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              👥 {filter.selectedTeams.length} team{filter.selectedTeams.length !== 1 ? "s" : ""}
              <button
                onClick={() => onFilterChange({ ...filter, selectedTeams: [] })}
                className="hover:text-[var(--primary)]/70"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {filter.performanceLevel && filter.performanceLevel !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              📊 {filter.performanceLevel}
              <button
                onClick={() => onFilterChange({ ...filter, performanceLevel: "all" })}
                className="hover:text-[var(--primary)]/70"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {filter.engagementLevel && filter.engagementLevel !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              ⚡ {filter.engagementLevel}
              <button
                onClick={() => onFilterChange({ ...filter, engagementLevel: "all" })}
                className="hover:text-[var(--primary)]/70"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
