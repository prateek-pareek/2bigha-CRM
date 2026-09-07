"use client";

import { Calendar, Filter, X } from "lucide-react";
import { useState } from "react";

export type AgentFilter = {
  agentId?: string;
  dateRange: "today" | "this_week" | "this_month" | "custom";
  customDateStart?: string;
  customDateEnd?: string;
};

type Props = {
  agents: Array<{ agentId: string; name: string }>;
  filter: AgentFilter;
  onFilterChange: (filter: AgentFilter) => void;
  onClearFilters: () => void;
};

export default function ReportFilters({ agents, filter, onFilterChange, onClearFilters }: Props) {
  const [showCustomDates, setShowCustomDates] = useState(filter.dateRange === "custom");

  const activeFilterCount = [filter.agentId, filter.dateRange !== "this_month"].filter(Boolean).length;

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-bold text-white">
              {activeFilterCount} active
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Date Range */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">Date Range</label>
          <select
            value={filter.dateRange}
            onChange={(e) => {
              const val = e.target.value as AgentFilter["dateRange"];
              setShowCustomDates(val === "custom");
              onFilterChange({
                ...filter,
                dateRange: val,
              });
            }}
            className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
          >
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </div>

        {/* Custom Dates */}
        {showCustomDates && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">From</label>
              <input
                type="date"
                value={filter.customDateStart || ""}
                onChange={(e) => onFilterChange({ ...filter, customDateStart: e.target.value })}
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">To</label>
              <input
                type="date"
                value={filter.customDateEnd || ""}
                onChange={(e) => onFilterChange({ ...filter, customDateEnd: e.target.value })}
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </>
        )}

        {/* Agent Filter */}
        {!showCustomDates && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">Agent</label>
            <select
              value={filter.agentId || ""}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  agentId: e.target.value || undefined,
                })
              }
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
