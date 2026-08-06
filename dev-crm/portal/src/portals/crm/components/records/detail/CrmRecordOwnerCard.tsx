"use client";

import { cn } from "@/lib/utils";

type Props = {
  ownerLabel?: string | null;
  title?: string;
  /** When true, render without outer card (for nesting inside Lead Information) */
  embedded?: boolean;
};

export default function CrmRecordOwnerCard({
  ownerLabel,
  title = "Owner",
  embedded = false,
}: Props) {
  const owner = String(ownerLabel || "").trim() || "Unassigned";
  const initial = owner.charAt(0).toUpperCase();

  const body = (
    <>
      <h3
        className={cn(
          embedded
            ? "mb-3 text-xs font-bold uppercase tracking-wider text-text-muted"
            : "text-xs font-bold uppercase tracking-wider text-text-muted mb-3",
        )}
      >
        {title}
      </h3>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-primary/20 text-sm font-extrabold text-primary">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text-primary">{owner}</p>
          <p className="text-xs font-medium text-text-muted">Record owner</p>
        </div>
      </div>
    </>
  );

  if (embedded) return <div>{body}</div>;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      {body}
    </div>
  );
}
