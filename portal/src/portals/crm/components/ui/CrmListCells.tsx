"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmStageAccent } from "@/lib/crm/stage-accent";
import { CrmIcon } from "@/lib/crm/shared/icons";
import { CrmKanbanAvatar, crmKanbanAvatarTone } from "./CrmKanban";

/** CRMS list status pill — solid colored badge (`.badge-status` 12/500) */
export function CrmListStatusBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const text = (label || "").trim() || "—";
  if (text === "—") {
    return <span className="crm-list-muted-text text-[14px] font-normal text-[#707070]">—</span>;
  }
  return (
    <span
      className={cn(
        "crm-list-status-badge inline-flex items-center rounded-[6px] px-[6px] py-[5px] text-[12px] font-medium leading-[12px] text-white",
        className,
      )}
      style={{ backgroundColor: crmStageAccent(text) }}
    >
      {text}
    </span>
  );
}

type CrmSoftTone = "primary" | "success" | "warning" | "info" | "danger" | "secondary";

const SOFT_TONE: Record<CrmSoftTone, string> = {
  primary: "bg-[#fce9e6] text-[#e41f07]",
  success: "bg-[#e8f9e8] text-[#1abe17]",
  warning: "bg-[#fff0e1] text-[#ff9f43]",
  info: "bg-[#eaf2fd] text-[#2f80ed]",
  danger: "bg-[#fce9e6] text-[#e41f07]",
  secondary: "bg-[#f0f2f5] text-[#707070]",
};

/** Soft pill — companies/contacts tags (`.badge-tag` 12/500 · pad 5×6) */
export function CrmSoftBadge({
  label,
  tone = "primary",
  className,
}: {
  label: string;
  tone?: CrmSoftTone;
  className?: string;
}) {
  const text = (label || "").trim();
  if (!text) return <span className="crm-list-muted-text text-[14px] font-normal text-[#707070]">—</span>;
  return (
    <span
      className={cn(
        "crm-soft-badge inline-flex items-center rounded-[6px] px-[6px] py-[5px] text-[12px] font-medium leading-[12px]",
        SOFT_TONE[tone],
        className,
      )}
    >
      {text}
    </span>
  );
}

/** Muted table text — body color #707070 · 14/400 (email, phone, dates, owner) */
export function CrmListMutedText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("crm-list-muted-text text-[14px] font-normal leading-[1.5] text-[#707070]", className)}>
      {children || "—"}
    </span>
  );
}

/** Lead / contact name — Dreams `h6.fs-14.fw-medium` (14/500 #1F2020) */
export function CrmListPersonCell({
  name,
  initials,
  subtitle,
  trailing,
  className,
  toneSeed,
}: {
  name: ReactNode;
  initials: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  toneSeed?: string;
}) {
  const chars = (initials || "?").slice(0, 2).toUpperCase();
  const tone = crmKanbanAvatarTone(toneSeed || chars);
  return (
    <div className={cn("crm-list-person-cell flex min-w-0 max-w-[280px] items-center gap-2", className)}>
      <CrmKanbanAvatar tone={tone}>{chars}</CrmKanbanAvatar>
      <div className="min-w-0 flex-1">
        <div className="crm-list-name truncate text-[14px] font-medium leading-[1.2] text-[#1f2020] group-hover:text-[var(--primary)]">
          {name}
        </div>
        {subtitle ? (
          <div className="crm-list-sub truncate mt-0.5 text-[13px] font-normal leading-[1.5] text-[#707070]">{subtitle}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** Company column — 40px mark + `fs-14 fw-medium` name */
export function CrmListOrgCell({
  name,
  subtitle,
  mark,
  className,
}: {
  name: ReactNode;
  subtitle?: ReactNode;
  mark?: string;
  className?: string;
}) {
  const label = typeof name === "string" ? name : "";
  const letter = (mark || label?.[0] || "—").toString().slice(0, 1).toUpperCase();
  const empty = !label || label === "—";

  if (empty) {
    return <span className="crm-list-muted-text text-[14px] font-normal text-[#707070]">—</span>;
  }

  return (
    <div className={cn("crm-list-org-cell flex min-w-0 max-w-[240px] items-center gap-2", className)}>
      <span
        className="crm-list-org-mark inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-white p-1 text-[14px] font-semibold text-[#1f2020]"
        aria-hidden
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="crm-list-name truncate text-[14px] font-medium leading-[1.2] text-[#1f2020]">{name}</div>
        {subtitle ? (
          <div className="crm-list-sub mt-1 truncate text-[13px] font-normal leading-[1.5] text-[#707070]">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Owner column — avatar + body-color name (14/400 #707070) */
export function CrmListOwnerCell({
  name,
  initials,
  className,
}: {
  name: string;
  initials?: string;
  className?: string;
}) {
  const label = (name || "").trim();
  if (!label) return <span className="crm-list-muted-text text-[14px] font-normal text-[#707070]">—</span>;
  const chars =
    initials ||
    label
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2);

  return (
    <div className={cn("crm-list-owner-cell flex min-w-0 items-center gap-2", className)}>
      <CrmKanbanAvatar size="sm">{chars.toUpperCase()}</CrmKanbanAvatar>
      <span className="truncate text-[14px] font-normal leading-[1.5] text-[#707070]">{label}</span>
    </div>
  );
}

/** CRMS form-check style checkbox (16×16) */
export function CrmTableCheck({
  checked,
  onChange,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: (e: React.MouseEvent | React.ChangeEvent) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(e);
      }}
      className={cn(
        "crm-table-check-input mx-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-[3.25px] border border-[#e2e8f0] bg-white transition-colors",
        checked && "border-[var(--primary)] bg-[var(--primary)] text-white",
        !checked && "hover:border-[var(--primary)]/50",
        className,
      )}
    >
      {checked ? <Check size={10} strokeWidth={3.5} /> : null}
    </button>
  );
}

type CrmTableActionMenuProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  onEmail?: () => void;
  className?: string;
};

/** Always-visible CRMS `action-icon btn-xs outline` ⋮ menu */
export function CrmTableActionMenu({
  onEdit,
  onDelete,
  onClone,
  onEmail,
  className,
}: CrmTableActionMenuProps) {
  return (
    <div className={cn("crm-table-action-menu relative inline-flex", className)}>
      <details className="group/menu relative">
        <summary
          className="crm-table-action-btn list-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] marker:content-none [&::-webkit-details-marker]:hidden"
          onClick={(e) => e.stopPropagation()}
          aria-label="Row actions"
        >
          <CrmIcon.DotsVertical size={12} />
        </summary>
        <div
          className="absolute right-0 top-full z-40 mt-1 min-w-[140px] rounded-[5px] border border-[#e2e8f0] bg-white py-1 shadow-[var(--crm-shadow-raised)]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
              onClick={onEdit}
            >
              <CrmIcon.Pencil size={13} className="text-[#2f80ed]" />
              Edit
            </button>
          ) : null}
          {onEmail ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
              onClick={onEmail}
            >
              <CrmIcon.Mail size={13} className="text-[#2f80ed]" />
              Email
            </button>
          ) : null}
          {onClone ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
              onClick={onClone}
            >
              <CrmIcon.Copy size={13} className="text-[#2f80ed]" />
              Clone
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
              onClick={onDelete}
            >
              <CrmIcon.Trash size={13} className="text-[#ef1e1e]" />
              Delete
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
