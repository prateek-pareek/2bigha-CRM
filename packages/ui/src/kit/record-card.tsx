"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";

/**
 * CRM-style record card grid — measured from
 * https://crms.dreamstechnologies.com/html/companies.html
 *
 * Reusable across products (contacts, companies, deals, people lists, …).
 *
 * .card                     (border · 5px radius · 20px body)
 *   head: 48px mark + fs-14 name + trailing + actions
 *   meta: icon + text-default #707070 rows
 *   .border-top.pt-3        (footer left + right)
 */

const CARD =
  "mx-record-card group relative flex h-full flex-col rounded-[5px] border border-[#e2e8f0] bg-white p-5 shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-shadow hover:shadow-[0_6px_12px_0_rgba(219,219,219,0.35)]";

const MARK_TONES: Record<string, string> = {
  info: "bg-[#eaf2fd] text-[#2f80ed]",
  danger: "bg-[#fde9e9] text-[#ef1e1e]",
  warning: "bg-[#fef8e6] text-[#f9b801]",
  success: "bg-[#e8f9e8] text-[#1abe17]",
  primary: "bg-[#fce9e6] text-[#e41f07]",
};

export type RecordCardMarkTone =
  | "info"
  | "danger"
  | "warning"
  | "success"
  | "primary";

/** Stable soft color from a seed string (name + id). */
export function recordCardMarkTone(seed: string): RecordCardMarkTone {
  const tones: RecordCardMarkTone[] = [
    "info",
    "danger",
    "warning",
    "success",
    "primary",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

export type RecordCardMetaItem = {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
};

export function RecordCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-record-card-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type RecordCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 1–2 characters shown in the 48px mark. Falls back to `?`. */
  initials: string;
  /** `circle` for people, `square` for companies / deals. */
  markShape?: "circle" | "square";
  /** Soft avatar tone; derived from `toneSeed` / initials when omitted. */
  tone?: RecordCardMarkTone;
  /** Seed used when `tone` is omitted. */
  toneSeed?: string;
  meta?: RecordCardMetaItem[];
  /** Right side of the head row (rating, amount, stage pill). */
  headTrailing?: ReactNode;
  /** Bottom-left slot — usually a tag / status badge. */
  footerLeft?: ReactNode;
  /** Bottom-right slot — usually the record owner. */
  footerRight?: ReactNode;
  /** Action menu, rendered top-right. */
  actions?: ReactNode;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: () => void;
  onClick?: () => void;
  className?: string;
};

export function RecordCard({
  title,
  subtitle,
  initials,
  markShape = "circle",
  tone: toneProp,
  toneSeed,
  meta,
  headTrailing,
  footerLeft,
  footerRight,
  actions,
  selectable,
  selected,
  onSelectedChange,
  onClick,
  className,
}: RecordCardProps) {
  const chars = (initials || "?").slice(0, 2).toUpperCase();
  const toneKey =
    toneProp ?? recordCardMarkTone(toneSeed || chars);
  const tone = MARK_TONES[toneKey] ?? MARK_TONES.info;
  const showFooter = Boolean(footerLeft || footerRight);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(CARD, onClick && "cursor-pointer", className)}
    >
      <div className="mx-record-card-head mb-4 flex items-start gap-3">
        {selectable ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label={selected ? "Deselect record" : "Select record"}
            onClick={(e) => {
              e.stopPropagation();
              onSelectedChange?.();
            }}
            className={cn(
              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3.25px] border border-[#e2e8f0] bg-white transition-colors",
              selected
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "hover:border-[var(--primary)]/50",
            )}
          >
            {selected ? <Check size={10} strokeWidth={3.5} /> : null}
          </button>
        ) : null}

        <span
          className={cn(
            "mx-record-card-mark inline-flex h-12 w-12 shrink-0 items-center justify-center text-sm font-semibold",
            markShape === "circle" ? "rounded-full" : "rounded-[5px]",
            tone,
          )}
          aria-hidden
        >
          {chars}
        </span>

        <div className="min-w-0 flex-1">
          <div className="mx-record-card-title truncate text-sm font-medium leading-[1.2] text-[#1f2020] group-hover:text-[var(--primary)]">
            {title}
          </div>
          {subtitle ? (
            <div className="mx-record-card-subtitle mt-1 truncate text-[13px] font-normal leading-[1.5] text-[#707070]">
              {subtitle}
            </div>
          ) : null}
          {headTrailing ? (
            <div className="mx-record-card-head-trailing mt-2 flex items-center gap-2">
              {headTrailing}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>

      {meta && meta.length > 0 ? (
        <div className="mx-record-card-meta flex flex-1 flex-col">
          {meta.map((item) => (
            <p
              key={item.key}
              className="mx-record-card-meta-row mb-2 flex items-center gap-1.5 text-sm font-normal leading-[21px] text-[#707070] last:mb-4"
            >
              {item.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center text-[#1f2020] [&_svg]:size-[15px]">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 truncate">{item.label}</span>
            </p>
          ))}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {showFooter ? (
        <div className="mx-record-card-footer flex items-center justify-between gap-2 border-t border-[#e2e8f0] pt-4">
          <div className="min-w-0">{footerLeft}</div>
          <div className="shrink-0">{footerRight}</div>
        </div>
      ) : null}
    </div>
  );
}

export function RecordCardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <RecordCardGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(CARD, "animate-pulse")}>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface-dim,#f1f5f9)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-[var(--surface-dim,#f1f5f9)]" />
              <div className="h-3 w-1/3 rounded bg-[var(--surface-dim,#f1f5f9)]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-[var(--surface-dim,#f1f5f9)]" />
            <div className="h-3 w-4/5 rounded bg-[var(--surface-dim,#f1f5f9)]" />
            <div className="h-3 w-3/5 rounded bg-[var(--surface-dim,#f1f5f9)]" />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#e2e8f0] pt-4">
            <div className="h-4 w-16 rounded bg-[var(--surface-dim,#f1f5f9)]" />
            <div className="h-6 w-6 rounded-full bg-[var(--surface-dim,#f1f5f9)]" />
          </div>
        </div>
      ))}
    </RecordCardGrid>
  );
}
