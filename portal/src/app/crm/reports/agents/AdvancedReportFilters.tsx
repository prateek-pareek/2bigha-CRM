"use client";

import { Filter, X, ChevronDown, Search } from "lucide-react";
import { useState, useMemo } from "react";

export type AdvancedAgentFilter = {
  dateRange: "today" | "this_week" | "this_month" | "custom";
  customDateStart?: string;
  customDateEnd?: string;
  selectedAgents: string[];
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
  filter: AdvancedAgentFilter;
  onFilterChange: (filter: AdvancedAgentFilter) => void;
  onClearFilters: () => void;
};

export default function AdvancedReportFilters({
  agents,
  filter,
  onFilterChange,
  onClearFilters,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [showCustomDates, setShowCustomDates] = useState(filter.dateRange === "custom");

  const departments = useMemo(() => {
    const depts = new Set(agents.map((a) => a.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [agents]);

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => a.name.toLowerCase().includes(agentSearch.toLowerCase()));
  }, [agents, agentSearch]);

  const activeFilterCount = [
    filter.selectedAgents.length > 0,
    filter.selectedDepartments?.length,
    filter.performanceLevel !== "all",
    filter.targetStatus !== "all",
    filter.conversionRateRange && filter.conversionRateRange[0] > 0,
    filter.leadsCreatedMin,
    filter.followUpAdherenceMin,
    filter.searchTerm,
    filter.dateRange !== "this_month",
  ].filter(Boolean).length;

  const toggleAgent = (agentId: string) => {
    const updated = filter.selectedAgents.includes(agentId)
      ? filter.selectedAgents.filter((id) => id !== agentId)
      : [...filter.selectedAgents, agentId];
    onFilterChange({ ...filter, selectedAgents: updated });
  };

  const toggleDepartment = (dept: string) => {
    const updated = (filter.selectedDepartments || []).includes(dept)
      ? (filter.selectedDepartments || []).filter((d) => d !== dept)
      : [...(filter.selectedDepartments || []), dept];
    onFilterChange({ ...filter, selectedDepartments: updated });
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
            {/* Date Range Section */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📅 Date Range
              </label>
              <select
                value={filter.dateRange}
                onChange={(e) => {
                  const val = e.target.value as AdvancedAgentFilter["dateRange"];
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
                    performanceLevel: e.target.value as AdvancedAgentFilter["performanceLevel"],
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              >
                <option value="all">All levels</option>
                <option value="high">🟢 High (above 20%)</option>
                <option value="medium">🟡 Medium (10-20%)</option>
                <option value="low">🔴 Low (below 10%)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Agents & Departments */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Agent Selection */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                👥 Select Agents
                {filter.selectedAgents.length > 0 && (
                  <span className="ml-2 inline-block rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs text-white font-bold">
                    {filter.selectedAgents.length}
                  </span>
                )}
              </label>

              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] pl-9 pr-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
                />
              </div>

              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)] p-2.5">
                {filteredAgents.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-4">No agents found</p>
                ) : (
                  filteredAgents.map((agent) => (
                    <label
                      key={agent.agentId}
                      className="flex items-center gap-2.5 cursor-pointer rounded-md hover:bg-[var(--card-bg)] p-2 text-sm transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={filter.selectedAgents.includes(agent.agentId)}
                        onChange={() => toggleAgent(agent.agentId)}
                        className="rounded w-4 h-4 accent-[var(--primary)]"
                      />
                      <span className="text-[var(--text-main)] font-medium">{agent.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Target Status */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                🎯 Target Status
              </label>
              <select
                value={filter.targetStatus || "all"}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    targetStatus: e.target.value as AdvancedAgentFilter["targetStatus"],
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              >
                <option value="all">All statuses</option>
                <option value="achieved">✓ Achieved (100% and above)</option>
                <option value="on_track">◆ On track (80-99%)</option>
                <option value="behind">⚠ Behind (below 80%)</option>
              </select>
            </div>
          </div>

          {/* Row 3: Conversion Rate & Leads */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Conversion Rate Range */}
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

            {/* Minimum Leads */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📊 Minimum Leads Created
              </label>
              <input
                type="number"
                min="0"
                value={filter.leadsCreatedMin || 0}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    leadsCreatedMin: Number(e.target.value) || undefined,
                  })
                }
                className="h-10 w-full rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
              />
            </div>
          </div>

          {/* Row 4: Follow-up & Search */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Follow-up Adherence */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                📞 Min Follow-up Adherence
              </label>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-[var(--text-main)]">{filter.followUpAdherenceMin || 0}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filter.followUpAdherenceMin || 0}
                  onChange={(e) =>
                    onFilterChange({
                      ...filter,
                      followUpAdherenceMin: Number(e.target.value) || undefined,
                    })
                  }
                  className="h-2 w-full rounded-lg bg-[var(--border-color)] outline-none accent-[var(--primary)]"
                />
              </div>
            </div>

            {/* Name Search */}
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                🔍 Search by Name
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search agent names..."
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
          {filter.selectedAgents.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              👥 {filter.selectedAgents.length} agent{filter.selectedAgents.length !== 1 ? "s" : ""}
              <button
                onClick={() => onFilterChange({ ...filter, selectedAgents: [] })}
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
          {filter.targetStatus && filter.targetStatus !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--primary)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
              🎯 {filter.targetStatus}
              <button
                onClick={() => onFilterChange({ ...filter, targetStatus: "all" })}
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
