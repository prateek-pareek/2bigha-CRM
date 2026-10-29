"use client";

import { X, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import CRMDateRangePicker from "@/components/crm/CRMDateRangePicker";

export type AdvancedAgentFilter = {
  /** Preset key (`this_month`, `all_time`, …) or `custom` with start/end dates. */
  dateRange: string;
  customDateStart?: string;
  customDateEnd?: string;
  selectedAgents: string[];
  /** Team ids (team = the members' manager); applied server-side. */
  selectedTeams?: string[];
  selectedDepartments?: string[];
  performanceLevel?: "all" | "high" | "medium" | "low";
  targetStatus?: "all" | "achieved" | "on_track" | "behind";
  conversionRateRange?: [number, number];
  leadsCreatedMin?: number;
  followUpAdherenceMin?: number;
  searchTerm?: string;
};

type AgentData = {
  agentId: string;
  name: string;
  department?: string;
  conversionRate?: number;
  followUpAdherence?: number;
  leadsCreated?: number;
};

type Props = {
  agents: AgentData[];
  teams?: Array<{ teamId: string; teamName: string }>;
  filter: AdvancedAgentFilter;
  onFilterChange: (filter: AdvancedAgentFilter) => void;
  onClearFilters: () => void;
};

export default function AdvancedReportFilters({
  agents,
  teams = [],
  filter,
  onFilterChange,
  onClearFilters,
}: Props) {
  const [agentSearch, setAgentSearch] = useState("");

  const departments = useMemo(() => {
    const depts = new Set(agents.map((a) => a.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [agents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => a.name.toLowerCase().includes(agentSearch.toLowerCase()));
  }, [agents, agentSearch]);

  const activeFilterCount = [
    filter.selectedAgents.length > 0,
    (filter.selectedTeams?.length || 0) > 0,
    filter.selectedDepartments?.length,
    filter.performanceLevel && filter.performanceLevel !== "all",
    filter.targetStatus && filter.targetStatus !== "all",
    filter.conversionRateRange && filter.conversionRateRange[0] > 0,
    filter.leadsCreatedMin,
    filter.followUpAdherenceMin,
    filter.searchTerm,
    filter.dateRange !== "this_month",
  ].filter(Boolean).length;

  const dateWindow =
    filter.dateRange === "custom" && filter.customDateStart && filter.customDateEnd
      ? `${filter.customDateStart},${filter.customDateEnd}`
      : filter.dateRange;

  const handleWindowChange = (windowKey: string) => {
    if (windowKey.includes(",")) {
      const [from, to] = windowKey.split(",", 2);
      onFilterChange({
        ...filter,
        dateRange: "custom",
        customDateStart: from,
        customDateEnd: to,
      });
      return;
    }
    onFilterChange({
      ...filter,
      dateRange: windowKey,
      customDateStart: undefined,
      customDateEnd: undefined,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-2 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-2 pl-2 border-r border-[var(--border-color)] pr-3 mr-1">
        <Filter size={16} className="text-[var(--text-muted)]" />
        <span className="text-sm font-bold text-[var(--text-main)]">Filters</span>
      </div>

      <CRMDateRangePicker
        value={dateWindow}
        onWindowChange={handleWindowChange}
        className="z-50"
      />

      {/* Agents Dropdown */}
      <div className="relative group">
        <select
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (!val) return;
            const updated = filter.selectedAgents.includes(val)
              ? filter.selectedAgents.filter((id) => id !== val)
              : [...filter.selectedAgents, val];
            onFilterChange({ ...filter, selectedAgents: updated });
          }}
          className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
        >
          <option value="">+ Add Agent Filter</option>
          {filteredAgents.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.name} {filter.selectedAgents.includes(a.agentId) ? "✓" : ""}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-muted)]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
          </svg>
        </div>
      </div>

      {/* Teams Dropdown */}
      {teams.length > 1 || (filter.selectedTeams?.length || 0) > 0 ? (
        <div className="relative group">
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const cur = filter.selectedTeams || [];
              const updated = cur.includes(val) ? cur.filter((id) => id !== val) : [...cur, val];
              onFilterChange({ ...filter, selectedTeams: updated });
            }}
            className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
          >
            <option value="">+ Add Team Filter</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName} {filter.selectedTeams?.includes(t.teamId) ? "✓" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Performance Dropdown */}
      <div className="relative group">
        <select
          value={filter.performanceLevel || "all"}
          onChange={(e) => onFilterChange({ ...filter, performanceLevel: e.target.value as any })}
          className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
        >
          <option value="all">Performance: All</option>
          <option value="high">High (&gt;20% Conv)</option>
          <option value="medium">Medium (10-20% Conv)</option>
          <option value="low">Low (&lt;10% Conv)</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-muted)]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
          </svg>
        </div>
      </div>

      {/* Target Status Dropdown */}
      <div className="relative group">
        <select
          value={filter.targetStatus || "all"}
          onChange={(e) => onFilterChange({ ...filter, targetStatus: e.target.value as any })}
          className="h-10 appearance-none rounded-[3px] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 pr-8 text-sm font-bold text-[var(--text-main)] outline-none hover:border-[var(--text-muted)]/30 transition-colors cursor-pointer"
        >
          <option value="all">Targets: All</option>
          <option value="achieved">Achieved (&gt;100%)</option>
          <option value="on_track">On Track (80-99%)</option>
          <option value="behind">Behind (&lt;80%)</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-muted)]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
          </svg>
        </div>
      </div>

      {/* Name search lives in the page header (see page.tsx). */}
      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="h-10 flex items-center gap-1 px-3 ml-auto rounded-[3px] hover:bg-red-500/10 text-red-500 text-sm font-bold transition-colors"
        >
          <X size={14} /> Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ""}
        </button>
      )}

      {/* Active Badges for Agents/Teams */}
      {(filter.selectedAgents.length > 0 || (filter.selectedTeams?.length || 0) > 0) && (
        <div className="w-full flex flex-wrap gap-2 pt-2 border-t border-[var(--border-color)]">
          {(filter.selectedTeams || []).map((id) => (
            <span key={`team-${id}`} className="flex items-center gap-1 bg-[var(--primary-light)] text-[var(--primary)] px-2 py-1 rounded-[4px] text-xs font-bold">
              Team: {teams.find((t) => t.teamId === id)?.teamName || "Unknown"}
              <button onClick={() => onFilterChange({ ...filter, selectedTeams: (filter.selectedTeams || []).filter((t) => t !== id) })} className="hover:text-red-500">
                <X size={12} />
              </button>
            </span>
          ))}
          {filter.selectedAgents.map(id => {
            const agent = agents.find(a => a.agentId === id);
            return (
              <span key={id} className="flex items-center gap-1 bg-[var(--primary-light)] text-[var(--primary)] px-2 py-1 rounded-[4px] text-xs font-bold">
                {agent?.name || "Unknown"}
                <button onClick={() => onFilterChange({ ...filter, selectedAgents: filter.selectedAgents.filter(a => a !== id) })} className="hover:text-red-500">
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
