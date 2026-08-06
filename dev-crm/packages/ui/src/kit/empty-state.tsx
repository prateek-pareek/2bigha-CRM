"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "../utils";
import { CRM_PANEL } from "./tokens";

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

/** Enterprise empty state — list / panel pattern */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        CRM_PANEL,
        "flex flex-col items-center text-center",
        compact ? "px-6 py-10" : "px-8 py-14",
        className,
      )}
    >
      <div
        className={cn(
          "mb-4 flex items-center justify-center rounded-2xl bg-[var(--surface-dim)] text-[var(--text-muted)]",
          compact ? "h-12 w-12" : "h-16 w-16",
        )}
      >
        {icon ?? <Inbox className={compact ? "h-5 w-5" : "h-7 w-7"} strokeWidth={1.5} />}
      </div>
      <h3 className="text-base font-semibold text-[var(--text-main)]">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** @deprecated Prefer `EmptyState` — CRM alias for existing call sites */
export const CrmEmptyState = EmptyState;
export type CrmEmptyStateProps = EmptyStateProps;
