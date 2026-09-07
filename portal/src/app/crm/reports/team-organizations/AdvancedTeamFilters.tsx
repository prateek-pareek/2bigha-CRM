"use client";

import { X, Search, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import CRMDateRangePicker from "@/components/crm/CRMDateRangePicker";

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
  const [teamSearch, setTeamSearch] = useState("");

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

  const handleDateRangeChange = (range: { from: string; to: string } | null) => {
    if (!range) {
      onFilterChange({ ...filter, dateRange: "this_month", customDateStart: undefined, customDateEnd: undefined });
      return;
    }
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    if (range.from === today && range.to === today) {
      onFilterChange({ ...filter, dateRange: "today", customDateStart: undefined, customDateEnd: undefined });
      return;
    }

    onFilterChange({ 
      ...filter, 
      dateRange: "custom", 
      customDateStart: range.from, 
      customDateEnd: range.to 
    });
  };

  const getInitialLabel = () => {
    if (filter.dateRange === "today") return "Today";
    if (filter.dateRange === "this_week") return "This Week";
    if (filter.dateRange === "this_month") return "This Month";
    if (filter.dateRange === "custom" && filter.customDateStart) return `${filter.customDateStart} - ${filter.customDateEnd}`;
    return "This Month";
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-2 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-2 pl-2 border-r border-[var(--border-color)] pr-3 mr-1">
        <Filter size={16} className="text-[var(--text-muted)]" />
        <span className="text-sm font-bold text-[var(--text-main)]">Filters</span>
      </div>

      <CRMDateRangePicker 
        initialLabel={getInitialLabel()} 
        onChange={handleDateRangeChange}
        className="z-50" 
      />

      {/* Teams Dropdown */}
      <div className="relative group">
        <select
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (!val) return;
            const updated = filter.selectedTeams.includes(val)
              ? filter.selectedTeams.filter((id) => id !== val)
              : [...filter.selectedTeams, val];
            onFilterChange({ ...filter, selectedTeams: updated });
          }}
          className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
        >
          <option value="">+ Add Team Filter</option>
          {filteredTeams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.teamName} {filter.selectedTeams.includes(t.teamId || "") ? "✓" : ""}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-muted)]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
          </svg>
        </div>
      </div>

      {/* Performance Dropdown */}
      <div className="relative group">
        <select
          value={filter.performanceLevel || "all"}
          onChange={(e) => onFilterChange({ ...filter, performanceLevel: e.target.value as any })}
          className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
        >
          <option value="all">Performance: All</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="needs_improvement">Needs Improvement</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-muted)]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
          </svg>
        </div>
      </div>

      {/* Name Search */}
      <div className="relative ml-auto hidden sm:block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search teams..."
          value={filter.searchTerm || ""}
          onChange={(e) => onFilterChange({ ...filter, searchTerm: e.target.value })}
          className="h-10 w-48 rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] pl-8 pr-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
        />
      </div>

      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="h-10 flex items-center gap-1 px-3 ml-2 rounded-[3px] hover:bg-red-500/10 text-red-500 text-sm font-bold transition-colors"
        >
          <X size={14} /> Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ""}
        </button>
      )}

      {/* Active Badges */}
      {filter.selectedTeams.length > 0 && (
        <div className="w-full flex flex-wrap gap-2 pt-2 border-t border-[var(--border-color)]">
          {filter.selectedTeams.map(id => {
            const team = teams.find(t => t.teamId === id);
            return (
              <span key={id} className="flex items-center gap-1 bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded-[4px] text-xs font-bold">
                {team?.teamName || "Unknown"}
                <button onClick={() => onFilterChange({ ...filter, selectedTeams: filter.selectedTeams.filter(t => t !== id) })} className="hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
