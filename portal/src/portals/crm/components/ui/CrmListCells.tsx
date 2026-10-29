"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmStageAccent } from "@/lib/crm/stage-accent";
import { CrmIcon, CrmNavIcon } from "@/lib/crm/shared/icons";
import { CrmKanbanAvatar, crmKanbanAvatarTone } from "./CrmKanban";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("crm-list-muted-text text-[14px] font-normal leading-[1.5] text-[#707070]", className)}
    >
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
  multiline = false,
}: {
  name: ReactNode;
  initials: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  toneSeed?: string;
  multiline?: boolean;
}) {
  const chars = (initials || "?").slice(0, 2).toUpperCase();
  const tone = crmKanbanAvatarTone(toneSeed || chars);
  return (
    <div
      className={cn(
        "crm-list-person-cell flex min-w-0 items-center gap-2",
        multiline ? "max-w-[320px]" : "max-w-[240px]",
        className,
      )}
    >
      <CrmKanbanAvatar tone={tone}>{chars}</CrmKanbanAvatar>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "crm-list-name text-[14px] font-medium leading-[1.3] text-[#1f2020] group-hover:text-[var(--primary)]",
            multiline ? "line-clamp-2 break-words" : "truncate",
          )}
        >
          {name}
        </div>
        {subtitle ? (
          <div
            className={cn(
              "crm-list-sub mt-0.5 text-[13px] font-normal leading-[1.4] text-[#707070]",
              multiline ? "line-clamp-2 break-words" : "truncate",
            )}
          >
            {subtitle}
          </div>
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
  multiline = false,
}: {
  name: ReactNode;
  subtitle?: ReactNode;
  mark?: string;
  className?: string;
  multiline?: boolean;
}) {
  const label = typeof name === "string" ? name : "";
  const letter = (mark || label?.[0] || "—").toString().slice(0, 1).toUpperCase();
  const empty = !label || label === "—";

  if (empty) {
    return <span className="crm-list-muted-text text-[14px] font-normal text-[#707070]">—</span>;
  }

  return (
    <div
      className={cn(
        "crm-list-org-cell flex min-w-0 items-center gap-2",
        multiline ? "max-w-[360px]" : "max-w-[240px]",
        className,
      )}
    >
      <span
        className="crm-list-org-mark inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e2e8f0] bg-white p-1 text-[14px] font-semibold text-[#1f2020]"
        aria-hidden
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "crm-list-name text-[14px] font-medium leading-[1.3] text-[#1f2020]",
            multiline ? "line-clamp-2 break-words" : "truncate",
          )}
        >
          {name}
        </div>
        {subtitle ? (
          <div
            className={cn(
              "crm-list-sub mt-0.5 text-[13px] font-normal leading-[1.4] text-[#707070]",
              multiline ? "line-clamp-2 break-words" : "truncate",
            )}
          >
            {subtitle}
          </div>
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
  multiline = false,
}: {
  name: string;
  initials?: string;
  className?: string;
  multiline?: boolean;
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
      <span
        className={cn(
          "text-[14px] font-normal leading-[1.4] text-[#707070]",
          multiline ? "line-clamp-2 break-words" : "truncate",
        )}
      >
        {label}
      </span>
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
  onCall?: () => void;
  onWhatsApp?: () => void;
  onReassign?: () => void;
  onNotes?: () => void;
  /** Read-only detail view — distinct from Edit (Lead Action Menu). */
  onView?: () => void;
  /** Opens the Call Activity Form to log a disposition ("Set Activity"). */
  onSetActivity?: () => void;
  /** Opens this record's call history panel. */
  onCallHistory?: () => void;
  /** Full ownership transfer — distinct from bulk Reassign; may be blocked server-side once properties/farms are listed. */
  onTransfer?: () => void;
  /** Add Property — also reachable as an always-visible row icon; listed here too per the Lead Action Menu spec. */
  onAddProperty?: () => void;
  /** Add Farm — also reachable as an always-visible row icon; listed here too per the Lead Action Menu spec. */
  onAddFarm?: () => void;
  /** Opens the per-record field-change history (audit log) panel. */
  onUpdateHistory?: () => void;
  className?: string;
  /** Which edge the dropdown hangs from. "right" pins the panel to the trigger and opens it left, over the table. */
  menuAlign?: "left" | "right";
  /** Fired after the menu opens or closes. Not called on the first render. */
  onOpenChange?: (open: boolean) => void;
};

const ACTION_MENU_GAP = 4;
const ACTION_MENU_PAD = 8;
const ACTION_MENU_MIN_WIDTH = 220;
/** Fixed theme-customizer gear sitting on the viewport's right edge. */
const THEME_GEAR_WIDTH = 52;

function clipsOverflow(value: string) {
  return value === "auto" || value === "scroll" || value === "hidden" || value === "clip";
}

/** Nearest real clipper (table shell, not the row cell), intersected with the viewport. */
function actionMenuBounds(trigger: HTMLElement) {
  let top = ACTION_MENU_PAD;
  let bottom = window.innerHeight - ACTION_MENU_PAD;
  let left = ACTION_MENU_PAD;
  let right = Math.min(window.innerWidth - ACTION_MENU_PAD, window.innerWidth - THEME_GEAR_WIDTH);
  let lockedY = false;
  let lockedX = false;

  let node: HTMLElement | null = trigger.parentElement;
  while (node && node !== document.body && (!lockedY || !lockedX)) {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    // Skip the action cell itself — it is too small to be the menu's box.
    if (clipsOverflow(style.overflowY) && !lockedY && rect.height >= 120) {
      top = Math.max(top, rect.top + ACTION_MENU_PAD);
      bottom = Math.min(bottom, rect.bottom - ACTION_MENU_PAD);
      lockedY = true;
    }
    if (clipsOverflow(style.overflowX) && !lockedX && rect.width >= 160) {
      left = Math.max(left, rect.left + ACTION_MENU_PAD);
      right = Math.min(right, rect.right - ACTION_MENU_PAD);
      lockedX = true;
    }
    node = node.parentElement;
  }

  return { top, bottom, left, right };
}

function actionMenuStyle(
  trigger: HTMLElement,
  menu: HTMLElement,
  align: "left" | "right",
): CSSProperties | null {
  const rect = trigger.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const bounds = actionMenuBounds(trigger);
  // Row left the table — close instead of leaving the menu over the toolbar or pagination.
  if (rect.bottom <= bounds.top + 2 || rect.top >= bounds.bottom - 2) return null;
  if (rect.right <= bounds.left + 2 || rect.left >= window.innerWidth - 4) return null;

  const naturalHeight = menu.scrollHeight || menu.offsetHeight || 40;
  const width = Math.max(menu.scrollWidth, menu.offsetWidth, ACTION_MENU_MIN_WIDTH);
  // A short table (1–2 rows) is smaller than the menu: the menu is a fixed-position portal,
  // so let it use the viewport rather than squeezing it into a scrollbar.
  const tableSpace = Math.max(40, bounds.bottom - bounds.top);
  const fitsTable = naturalHeight <= tableSpace;
  const vTop = fitsTable ? bounds.top : ACTION_MENU_PAD;
  const vBottom = fitsTable ? bounds.bottom : window.innerHeight - ACTION_MENU_PAD;
  const available = Math.max(40, vBottom - vTop);
  const height = Math.min(naturalHeight, available);
  const needsScroll = naturalHeight > available + 1;

  // Keep every action inside the table: below the ⋮, then above, then shift to fit.
  const belowTop = rect.bottom + ACTION_MENU_GAP;
  const aboveTop = rect.top - ACTION_MENU_GAP - height;
  let top: number;
  if (belowTop + height <= vBottom) top = belowTop;
  else if (aboveTop >= vTop) top = aboveTop;
  else top = Math.max(vTop, vBottom - height);

  // Open over the table, to the left of the ⋮, clear of the theme gear.
  const limitRight = Math.min(bounds.right, window.innerWidth - THEME_GEAR_WIDTH);
  let left = align === "left" ? rect.left : Math.min(rect.right, limitRight) - width;
  if (align === "left" && rect.left + width > limitRight - 8) {
    left = Math.min(rect.right, limitRight) - width;
  }
  left = Math.max(bounds.left, Math.min(left, Math.max(bounds.left, limitRight - width)));

  return {
    position: "fixed",
    top,
    left,
    width,
    maxHeight: needsScroll ? height : undefined,
    zIndex: 200,
    visibility: "visible",
  };
}

/** Always-visible CRMS `action-icon btn-xs outline` ⋮ menu */
export function CrmTableActionMenu({
  onEdit,
  onDelete,
  onClone,
  onEmail,
  onCall,
  onWhatsApp,
  onReassign,
  onNotes,
  onView,
  onSetActivity,
  onCallHistory,
  onTransfer,
  onUpdateHistory,
  onAddProperty,
  onAddFarm,
  className,
  menuAlign = "right",
  onOpenChange,
}: CrmTableActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const openedOnce = useRef(false);
  useEffect(() => {
    if (!openedOnce.current) {
      openedOnce.current = true;
      return;
    }
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const placeMenu = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const next = actionMenuStyle(button, menu, menuAlign);
    if (!next) {
      setOpen(false);
      return;
    }
    setMenuStyle(next);
  }, [menuAlign]);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    const onMove = () => placeMenu();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const runAndClose = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    fn?.();
  };

  return (
    <div ref={containerRef} className={cn("crm-table-action-menu relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        className="crm-table-action-btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)]"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Row actions"
        aria-expanded={open}
      >
        <CrmIcon.DotsVertical size={14} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="crm-action-menu-panel overflow-x-hidden overflow-y-auto rounded-[5px] border border-[#e2e8f0] bg-white py-1 shadow-[var(--crm-shadow-raised)]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
            {onView ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onView)}
              >
                <CrmIcon.Eye size={13} className="text-[#2f80ed]" />
                View
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onEdit)}
              >
                <CrmIcon.Pencil size={13} className="text-[#2f80ed]" />
                Edit
              </button>
            ) : null}
            {onEmail ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onEmail)}
              >
                <CrmIcon.Mail size={13} className="text-[#2f80ed]" />
                Email
              </button>
            ) : null}
            {onCall ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onCall)}
              >
                <CrmIcon.PhoneCall size={13} className="text-[#2f80ed]" />
                Call
              </button>
            ) : null}
            {onWhatsApp ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onWhatsApp)}
              >
                <CrmNavIcon.WhatsApp size={13} className="text-[#25d366]" />
                WhatsApp
              </button>
            ) : null}
            {onNotes ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onNotes)}
              >
                <CrmIcon.Activity size={13} className="text-[#2f80ed]" />
                Notes &amp; follow-up
              </button>
            ) : null}
            {onSetActivity ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onSetActivity)}
              >
                <CrmIcon.Target size={13} className="text-[#2f80ed]" />
                Set Activity
              </button>
            ) : null}
            {onCallHistory ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onCallHistory)}
              >
                <CrmIcon.Timer size={13} className="text-[#2f80ed]" />
                Call History
              </button>
            ) : null}
            {onAddProperty ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onAddProperty)}
              >
                <CrmNavIcon.Building size={13} className="text-[#2f80ed]" />
                Add Property
              </button>
            ) : null}
            {onAddFarm ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onAddFarm)}
              >
                <CrmIcon.MapPin size={13} className="text-[#2f80ed]" />
                Add Farm
              </button>
            ) : null}
            {onUpdateHistory ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onUpdateHistory)}
              >
                <CrmIcon.GitBranch size={13} className="text-[#2f80ed]" />
                Update History
              </button>
            ) : null}
            {onReassign ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onReassign)}
              >
                <CrmIcon.Users size={13} className="text-[#2f80ed]" />
                Reassign
              </button>
            ) : null}
            {onTransfer ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onTransfer)}
              >
                <CrmIcon.ArrowRight size={13} className="text-[#2f80ed]" />
                Transfer
              </button>
            ) : null}
            {onClone ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onClone)}
              >
                <CrmIcon.Copy size={13} className="text-[#2f80ed]" />
                Clone
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-[#1f2020] hover:bg-[#f7f8f9]"
                onClick={runAndClose(onDelete)}
              >
                <CrmIcon.Trash size={13} className="text-[#ef1e1e]" />
                Delete
              </button>
            ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type CrmHoverActionIconProps = {
  icon: ReactNode;
  label: string;
  /** Omit to keep the number private — the icon then shows only its label on hover. */
  value?: string;
  onClick?: () => void;
  tone?: "primary" | "whatsapp";
  className?: string;
};

/** Always-visible row-action icon that shows the underlying number in a hover card, matching the reference CRM's Call/WhatsApp icons. */
export function CrmHoverActionIcon({
  icon,
  label,
  value,
  onClick,
  tone = "primary",
  className,
}: CrmHoverActionIconProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          aria-label={value ? `${label}: ${value}` : label}
          className={cn(
            "crm-table-action-btn inline-flex h-5 w-5 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white shadow-[0_4px_4px_0_rgba(219,219,219,0.25)]",
            tone === "whatsapp" ? "text-[#25d366]" : "text-[#2f80ed]",
            className,
          )}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        sideOffset={6}
        className="w-auto px-3 py-2"
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
          {value ? (
            <>
              <span className="font-medium text-[#707070]">{label}:</span>
              <span className="font-semibold text-[#1f2020]">{value}</span>
            </>
          ) : (
            <span className="font-medium text-[#707070]">{label}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const HOVER_BLOCK_GEAR = 52;

type MenuWithOpenChange = ReactElement<{ onOpenChange?: (open: boolean) => void }>;

type CrmRowQuickActionsProps = {
  /** True while this lead row is hovered (parent clears it after five seconds or on leave). */
  active?: boolean;
  /** Table is scrolled to the horizontal end — icons sit in the Action column instead of the hover block. */
  pinned?: boolean;
  /** Quick icons (Call / WhatsApp / Property / Farm). */
  quick: ReactNode;
  /** ⋮ menu. Edit and the other items open only after this is clicked. */
  menu: ReactNode;
  /** Unused. Visibility is capped at five seconds by the parent. */
  lingerMs?: number;
  /** Called when the pointer leaves the block without opening the menu. */
  onDismiss?: () => void;
  className?: string;
};

function isInside(node: Node | null, el: Element | null | undefined) {
  return Boolean(node && el && el.contains(node));
}

/** Pointer moved onto the ⋮ menu or an icon tooltip — keep the hover block up. */
function staysWithActions(node: Node | null) {
  if (!(node instanceof Element)) return false;
  return Boolean(
    node.closest(".crm-action-menu-panel") ||
    node.closest("[data-radix-popper-content-wrapper]"),
  );
}

/**
 * Leads row actions. The parent marks the hovered row for up to five seconds.
 * Phone, WhatsApp, property, farm, and ⋮ then float as a small block.
 * View / Edit and the rest open only after the ⋮ is clicked.
 */
export function CrmRowQuickActions({
  active = false,
  pinned = false,
  quick,
  menu,
  onDismiss,
  className,
}: CrmRowQuickActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockStyle, setBlockStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = !pinned && (active || menuOpen);

  const placeBlock = useCallback(() => {
    const row = rootRef.current?.closest("tr");
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    if (rowRect.height < 2) return;
    const scrollRoot = row.closest(".crm-table-scroll");
    const scrollRight = scrollRoot?.getBoundingClientRect().right ?? window.innerWidth;
    const right = Math.max(HOVER_BLOCK_GEAR + 8, window.innerWidth - Math.min(scrollRight, window.innerWidth) + 8);
    setBlockStyle({
      position: "fixed",
      top: rowRect.top + rowRect.height / 2,
      right,
      transform: "translateY(-50%)",
      zIndex: 250,
    });
  }, []);

  const handleMenuOpenChange = useCallback((next: boolean) => {
    setMenuOpen(next);
  }, []);

  useLayoutEffect(() => {
    if (!shown) return;
    placeBlock();
    const scrollRoot = rootRef.current?.closest(".crm-table-scroll");
    const onMove = () => placeBlock();
    scrollRoot?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      scrollRoot?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [placeBlock, shown]);

  const menuNode = isValidElement(menu)
    ? cloneElement(menu as MenuWithOpenChange, { onOpenChange: handleMenuOpenChange })
    : menu;

  const cluster = (
    <>
      <div className="crm-row-actions__inline">{quick}</div>
      <div className="crm-row-actions__menu shrink-0">{menuNode}</div>
    </>
  );

  return (
    <div ref={rootRef} className={cn("crm-row-actions crm-row-actions--pinned", className)} onClick={(e) => e.stopPropagation()}>
      {cluster}
      {!pinned && shown && blockStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              className="crm-row-actions__hover-block"
              style={blockStyle}
              onMouseLeave={(e) => {
                if (menuOpen) return;
                const next = e.relatedTarget as Node | null;
                const row = rootRef.current?.closest("tr");
                if (isInside(next, row) || staysWithActions(next)) return;
                onDismiss?.();
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {cluster}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
