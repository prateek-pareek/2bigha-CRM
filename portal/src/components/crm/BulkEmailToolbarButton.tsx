"use client";

import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  recipientCount: number;
  entityLabel?: string;
  onClick: () => void;
  className?: string;
  /** Outreach-style text button instead of icon-only. */
  variant?: "icon" | "labeled";
};

export function BulkEmailToolbarButton({
  selectedCount,
  recipientCount,
  entityLabel = "record",
  onClick,
  className,
  variant = "icon",
}: Props) {
  if (selectedCount <= 0) return null;

  const disabled = recipientCount === 0;
  const title = disabled
    ? `Selected ${entityLabel}s have no valid email addresses`
    : `Email ${recipientCount} selected ${entityLabel}${recipientCount === 1 ? "" : "s"}`;

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(
          "h-8 px-3 bg-white border border-border/60 text-text-main text-xs font-semibold rounded-lg hover:bg-surface-dim transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none",
          className,
        )}
      >
        <Mail size={13} aria-hidden />
        Bulk Email
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-border/60 bg-white text-text-main shadow-sm transition hover:bg-surface-dim disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <Mail className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
