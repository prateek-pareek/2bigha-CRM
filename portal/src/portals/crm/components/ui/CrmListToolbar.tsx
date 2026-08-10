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
        wrapperClassName="relative w-[220px] max-w-full shrink-0"
        placeholder={searchProps.placeholder ?? "Search"}
        {...searchProps}
      />
    ) : null);

  return (
    <div className={cn("mb-3 shrink-0 space-y-2.5", className)}>
      <div className={cn(CRM_TOOLBAR, "justify-between gap-3")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          {filterControl ? <div className="shrink-0">{filterControl}</div> : null}
          {searchControl ? <div className="shrink-0">{searchControl}</div> : null}
          {leftExtra}
        </div>
        {right ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">{right}</div>
        ) : null}
      </div>
      {secondary ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white px-3 py-2 shadow-[var(--crm-shadow-input)]">
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
