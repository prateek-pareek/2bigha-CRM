"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline success / partial / failure indicator for lead (and client) assignment.
 * Toasts vanish in a few seconds and say nothing about partial results — this stays
 * in the dialog / card until the user dismisses it, and spells out what happened.
 */
export type AssignmentResultStatus = "success" | "partial" | "error";

export type AssignmentResult = {
  status: AssignmentResultStatus;
  title: string;
  detail?: string;
};

type Props = {
  result: AssignmentResult;
  className?: string;
  /** Compact variant for small surfaces (e.g. the record Owner card). */
  compact?: boolean;
};

const STYLES: Record<
  AssignmentResultStatus,
  { Icon: typeof CheckCircle2; box: string; icon: string }
> = {
  success: {
    Icon: CheckCircle2,
    box: "border-[var(--success)]/40 bg-[var(--success-light)]",
    icon: "text-[var(--success)]",
  },
  partial: {
    Icon: AlertTriangle,
    box: "border-[var(--warning)]/40 bg-[var(--warning-light)]",
    icon: "text-[var(--warning)]",
  },
  error: {
    Icon: XCircle,
    box: "border-[var(--error)]/40 bg-[var(--error-light)]",
    icon: "text-[var(--error)]",
  },
};

export default function AssignmentResultBanner({ result, className, compact }: Props) {
  const { Icon, box, icon } = STYLES[result.status];
  return (
    <div
      role={result.status === "error" ? "alert" : "status"}
      aria-live={result.status === "error" ? "assertive" : "polite"}
      data-assignment-status={result.status}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border",
        compact ? "px-2.5 py-2" : "px-3 py-3",
        box,
        className,
      )}
    >
      <Icon
        className={cn("shrink-0", compact ? "mt-px h-4 w-4" : "mt-0.5 h-5 w-5", icon)}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold text-[var(--text-main)]",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {result.title}
        </p>
        {result.detail ? (
          <p
            className={cn(
              "mt-0.5 text-[var(--text-muted)]",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            {result.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Turn a bulk-assign response (`POST /crm/leads/bulk-assign`, segment `assign-leads`)
 * into a success / partial / error result.
 * - requested: leads asked for · matched: ones the user may reassign · modified: actually changed.
 */
export function summarizeBulkAssignResult(
  res: {
    requested?: number;
    matched?: number;
    modified?: number;
    truncated?: boolean;
    /** Per-run limit behind `truncated` (default 2,000 — the bulk-assign endpoint's cap). */
    cap?: number;
  },
  ownerLabel: string,
): AssignmentResult {
  const requested = Math.max(0, Number(res.requested ?? 0));
  const matched = Math.max(0, Number(res.matched ?? 0));
  const modified = Math.max(0, Number(res.modified ?? 0));
  const noAccess = Math.max(0, requested - matched);
  const alreadyOwned = Math.max(0, matched - modified);

  if (matched === 0) {
    return {
      status: "error",
      title: "No leads were assigned",
      detail: requested
        ? `You don't have permission to reassign the ${plural(requested, "selected lead")}.`
        : "No matching leads were found.",
    };
  }

  const notes: string[] = [];
  if (alreadyOwned) notes.push(`${plural(alreadyOwned, "lead")} already owned by ${ownerLabel}`);
  if (noAccess) notes.push(`${plural(noAccess, "lead")} skipped — no permission to reassign`);
  if (res.truncated) {
    notes.push(`capped at ${(res.cap ?? 2000).toLocaleString()} leads — run again for the rest`);
  }

  if (noAccess || res.truncated) {
    return {
      status: "partial",
      title: `Assigned ${plural(modified, "lead")} to ${ownerLabel}`,
      detail: notes.join(" · "),
    };
  }
  return {
    status: "success",
    title:
      modified > 0
        ? `Assigned ${plural(modified, "lead")} to ${ownerLabel}`
        : `All selected leads are already owned by ${ownerLabel}`,
    detail: notes.length && modified > 0 ? notes.join(" · ") : undefined,
  };
}

export function assignmentErrorResult(err: unknown, fallback = "Assignment failed"): AssignmentResult {
  return {
    status: "error",
    title: fallback,
    detail: err instanceof Error && err.message ? err.message : "Please try again.",
  };
}
