"use client";

import { cn } from "@/lib/utils";

type CrmScopeToggleProps = {
  allLabel: string;
  mineLabel: string;
  showMineOnly: boolean;
  onShowAll: () => void;
  onShowMine: () => void;
  className?: string;
  /** Match compact list-toolbar control height. */
  compact?: boolean;
};

/**
 * Unified All / My segmented control used on Leads & Contacts toolbars.
 */
export function CrmScopeToggle({
  allLabel,
  mineLabel,
  showMineOnly,
  onShowAll,
  onShowMine,
  className,
  compact = false,
}: CrmScopeToggleProps) {
  const tab =
    "inline-flex h-full flex-1 items-center justify-center px-3 text-xs font-medium whitespace-nowrap transition-colors";

  return (
    <div
      role="tablist"
      aria-label="Lead scope"
      className={cn(
        "crm-scope-toggle inline-flex shrink-0 items-stretch overflow-hidden rounded-md bg-white shadow-[var(--crm-shadow-input)]",
        compact ? "h-8" : "h-[38px]",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={!showMineOnly}
        onClick={onShowAll}
        className={cn(
          tab,
          !showMineOnly
            ? "bg-[var(--primary-light)] text-[var(--primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]",
        )}
      >
        {allLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={showMineOnly}
        onClick={onShowMine}
        className={cn(
          tab,
          "border-l border-[color-mix(in_srgb,var(--border-color)_70%,transparent)]",
          showMineOnly
            ? "bg-[var(--primary-light)] text-[var(--primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]",
        )}
      >
        {mineLabel}
      </button>
    </div>
  );
}
