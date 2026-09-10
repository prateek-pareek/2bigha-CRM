"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CRM_BTN_SECONDARY, CRM_TOOLBAR } from "@/lib/crm/ui";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { CrmSearchInput } from "./CrmField";

type CrmListToolbarProps = {
  /** Filter control — CRMS places Filter immediately left of Search */
  filter?: ReactNode;
  onFilterClick?: () => void;
  filterLabel?: string;
  search?: ReactNode;
  searchProps?: React.ComponentProps<typeof CrmSearchInput>;
  /** Extra controls after search (scope chips, pipeline select, …) */
  leftExtra?: ReactNode;
  /** Optional second row under the main toolbar (email engagement filters, …) */
  secondary?: ReactNode;
  right?: ReactNode;
  className?: string;
  /** Tighter two-row chrome so the list/table can occupy more of the screen. */
  compact?: boolean;
};

/**
 * CRMS list toolbar:
 * Row 1: [Filter] [Search] [extras…] ……………… [views][+ Add]
 * Icons: ti-filter · ti-search
 */
export function CrmListToolbar({
  filter,
  onFilterClick,
  filterLabel = "Filter",
  search,
  searchProps,
  leftExtra,
  secondary,
  right,
  className,
  compact = false,
}: CrmListToolbarProps) {
  const filterControl =
    filter ??
    (onFilterClick ? (
      <button type="button" onClick={onFilterClick} className={CRM_BTN_SECONDARY}>
        <CrmIcon.Filter size={16} aria-hidden />
        {filterLabel}
        <CrmIcon.ChevronDown size={14} aria-hidden />
      </button>
    ) : null);

  const searchControl =
    search ??
    (searchProps ? (
      <CrmSearchInput
        wrapperClassName="relative w-full max-w-[220px]"
        placeholder={searchProps.placeholder ?? "Search"}
        {...searchProps}
      />
    ) : null);

  return (
    <div
      className={cn(
        "crm-list-toolbar shrink-0",
        compact
          ? "relative z-30 mb-1.5 overflow-visible rounded-md bg-white shadow-[var(--crm-shadow-input)]"
          : "mb-2 space-y-2",
        className,
      )}
    >
      <div className={cn(CRM_TOOLBAR, compact ? "justify-between gap-1.5 overflow-visible px-2 py-1" : "justify-between gap-3")}>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center overflow-visible",
            compact ? "flex-nowrap gap-1.5" : "flex-wrap gap-2.5",
          )}
        >
          <div className={cn("flex shrink items-center flex-nowrap", compact ? "gap-1.5" : "gap-2.5", searchControl ? "flex-1 min-w-[150px]" : "min-w-0")}>
            {filterControl ? <div className="shrink-0">{filterControl}</div> : null}
            {searchControl ? <div className="flex-1 min-w-[100px]">{searchControl}</div> : null}
          </div>
          {leftExtra}
        </div>
        {right ? (
          <div className={cn("flex shrink-0 flex-wrap items-center", compact ? "gap-1.5" : "gap-2.5")}>{right}</div>
        ) : null}
      </div>
      {secondary ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            compact
              ? "flex-nowrap overflow-visible bg-[var(--surface-dim)]/35 px-2 py-1 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]"
              : "flex-wrap rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 py-2 shadow-[var(--crm-shadow-input)]",
          )}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
