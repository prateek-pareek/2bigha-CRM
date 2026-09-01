"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CrmRecordQuickAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  title?: string;
  /** Primary filled button (e.g. Email) */
  primary?: boolean;
  external?: boolean;
};

type Props = {
  actions: CrmRecordQuickAction[];
  secondaryActions?: CrmRecordQuickAction[];
  className?: string;
  children?: ReactNode;
};

function ActionButton({
  action,
  compact,
}: {
  action: CrmRecordQuickAction;
  compact?: boolean;
}) {
  const base = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--crm-radius-ui)] text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40",
    compact ? "h-8 w-8 p-0" : "h-9 px-3",
    action.primary
      ? "bg-[var(--primary)] text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]"
      : "border border-[var(--border-color)] bg-white text-[var(--text-main)] hover:bg-[var(--surface-dim)]",
  );

  if (action.href && !action.disabled) {
    return (
      <a
        href={action.href}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noopener noreferrer" : undefined}
        className={base}
        title={action.title || action.label}
        aria-label={action.label}
      >
        {action.icon}
        {!compact ? <span>{action.label}</span> : null}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onClick}
      className={base}
      title={action.title || action.label}
      aria-label={action.label}
    >
      {action.icon}
      {!compact ? <span>{action.label}</span> : null}
    </button>
  );
}

export default function CrmRecordQuickActions({
  actions,
  secondaryActions = [],
  className,
  children,
}: Props) {
  if (!actions.length && !secondaryActions.length && !children) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-[var(--border-color)]/80 pt-3 mt-3 crm-record-quick-actions-scroll",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {actions.map((action) => (
          <ActionButton key={action.id} action={action} />
        ))}
      </div>
      {(secondaryActions.length > 0 || children) ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {secondaryActions.map((action) => (
            <ActionButton key={action.id} action={action} compact />
          ))}
          {children}
        </div>
      ) : null}
    </div>
  );
}
