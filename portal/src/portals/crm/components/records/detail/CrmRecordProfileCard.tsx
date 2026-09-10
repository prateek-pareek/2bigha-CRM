"use client";

import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import CrmRecordQuickActions, { type CrmRecordQuickAction } from "./CrmRecordQuickActions";

type Props = {
  initials: string;
  /** Name line — pass a fragment to inline a verified/status glyph next to it */
  name: ReactNode;
  /** Address / org / email line under the name */
  subtitle?: ReactNode;
  /** Status pills row (private, stage, plan, …) shown under the subtitle */
  badges?: ReactNode;
  quickActions?: CrmRecordQuickAction[];
  secondaryActions?: CrmRecordQuickAction[];
  /** Extra control appended after the quick-action buttons (e.g. a pipeline select) */
  quickActionsExtra?: ReactNode;
  onSettingsClick?: () => void;
  /** Basic/other info rows, tags, and any other sections stacked below the header */
  children?: ReactNode;
  className?: string;
};

/**
 * CRMS-style profile card — banner, centered avatar, name/status, then any
 * number of stacked info sections. Used as the left-column header on record
 * detail pages (leads, contacts) instead of the full-width horizontal hero.
 */
export default function CrmRecordProfileCard({
  initials,
  name,
  subtitle,
  badges,
  quickActions = [],
  secondaryActions,
  quickActionsExtra,
  onSettingsClick,
  children,
  className,
}: Props) {
  const hasActions = quickActions.length > 0 || (secondaryActions?.length ?? 0) > 0 || Boolean(quickActionsExtra);

  return (
    <div
      className={cn(
        "crm-record-profile-card overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]",
        className,
      )}
    >
      <div className="relative h-16 bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_55%,#ff9f43)]">
        {onSettingsClick ? (
          <button
            type="button"
            onClick={onSettingsClick}
            title="Customize layout"
            aria-label="Customize layout"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <Settings2 size={15} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col items-center px-5 pb-5 text-center">
        <div className="relative z-10 -mt-9 flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full border-4 border-[var(--card-bg)] bg-[var(--primary-light)] text-lg font-bold text-[var(--primary)] shadow-md">
          {initials}
        </div>
        <h2 className="mt-3 inline-flex max-w-full items-center gap-1.5 text-base font-bold leading-snug text-[var(--text-main)]">
          {name}
        </h2>
        {subtitle ? (
          <div className="mt-1 max-w-full text-xs font-medium leading-snug text-[var(--text-muted)]">{subtitle}</div>
        ) : null}
        {badges ? <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">{badges}</div> : null}
      </div>

      {hasActions ? (
        <div className="border-t border-[var(--border-color)] px-4 pb-4 pt-3">
          <CrmRecordQuickActions actions={quickActions} secondaryActions={secondaryActions} className="!mt-0 !border-0 !pt-0 justify-center">
            {quickActionsExtra}
          </CrmRecordQuickActions>
        </div>
      ) : null}

      {children ? (
        <div className="divide-y divide-[var(--border-color)] border-t border-[var(--border-color)]">{children}</div>
      ) : null}
    </div>
  );
}

/** One stacked section inside the profile card — e.g. "Basic information" */
export function CrmRecordProfileSection({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3.5 sm:px-5", className)}>
      {title ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</h3>
          {action ?? null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
