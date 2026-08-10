"use client";

type Props = {
  ownerLabel?: string | null;
  title?: string;
};

export default function CrmRecordOwnerCard({
  ownerLabel,
  title = "Owner",
}: Props) {
  const owner = String(ownerLabel || "").trim() || "Unassigned";
  const initial = owner.charAt(0).toUpperCase();

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-[var(--crm-shadow-card)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
        {title}
      </h3>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--crm-radius-ui)] bg-[var(--primary)]/10 text-sm font-bold text-[var(--primary)]">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-main)]">{owner}</p>
          <p className="text-xs text-[var(--text-muted)]">Record owner</p>
        </div>
      </div>
    </div>
  );
}
