"use client";

import { cn } from "@/lib/utils";
import { CrmIcon } from "@/lib/crm/shared/icons";

type CrmScopeToggleProps = {
  allLabel: string;
  mineLabel: string;
  showMineOnly: boolean;
  onShowAll: () => void;
  onShowMine: () => void;
  /** Clear search/filters when on All scope */
  onClearAll?: () => void;
  className?: string;
};

/**
 * CRMS-style All / My scope chips used on Leads & Contacts toolbars.
 */
export function CrmScopeToggle({
  allLabel,
  mineLabel,
  showMineOnly,
  onShowAll,
  onShowMine,
  onClearAll,
  className,
}: CrmScopeToggleProps) {
  return (
    <div className={cn("flex h-[38px] shrink-0 items-stretch gap-0.5", className)}>
      <div
        className={cn(
          "flex min-h-[38px] shrink-0 items-stretch gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-0.5 shadow-[var(--crm-shadow-input)]",
          !showMineOnly && "ring-1 ring-[var(--primary)]/15",
        )}
      >
        <button
          type="button"
          onClick={onShowAll}
          className={cn(
            "rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors",
            !showMineOnly
              ? "bg-[var(--primary-light)] text-[var(--primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
          )}
        >
          {allLabel}
        </button>
        {!showMineOnly && onClearAll ? (
          <button
            type="button"
            title="Clear search and filters"
            aria-label="Clear search and filters"
            onClick={onClearAll}
            className="flex w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--error)]"
          >
            <CrmIcon.X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onShowMine}
        className={cn(
          "h-[38px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium shadow-[var(--crm-shadow-input)] transition-colors",
          showMineOnly
            ? "bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--primary)]/15"
            : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
        )}
      >
        {mineLabel}
      </button>
    </div>
  );
}
