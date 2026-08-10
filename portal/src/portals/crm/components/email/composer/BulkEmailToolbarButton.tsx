"use client";

import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui/CrmButton";

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
      <CrmButton
        type="button"
        variant="secondary"
        onClick={onClick}
        disabled={disabled}
        title={title}
        leftIcon={<Mail size={14} aria-hidden />}
        className={className}
      >
        Bulk Email
      </CrmButton>
    );
  }

  return (
    <CrmButton
      type="button"
      variant="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      leftIcon={<Mail className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
      className={cn("text-[var(--text-main)]", className)}
    />
  );
}
