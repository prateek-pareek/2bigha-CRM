"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";
import { CRM_PANEL } from "./tokens";

export type SectionCardProps = {
  title?: string;
  /** Right side of the title row (segmented control, link, …) */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Hide the accent bar (default shown when title is set) */
  accent?: boolean;
};

/** Dashboard / report card — white panel with title accent bar */
export function SectionCard({
  title,
  actions,
  children,
  className,
  bodyClassName,
  accent = true,
}: SectionCardProps) {
  return (
    <section className={cn(CRM_PANEL, "overflow-hidden", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {accent ? (
              <span
                className="crm-line-title inline-block h-4 w-[3px] shrink-0 rounded-[1px]"
                style={{ background: "var(--crm-line-title)" }}
                aria-hidden
              />
            ) : null}
            <h2 className="truncate text-base font-semibold leading-none text-[var(--text-main)]">
              {title}
            </h2>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Period segment control (Weekly | Monthly | Yearly) */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full overflow-x-auto h-[34px] items-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-0.5 shadow-[var(--crm-shadow-input)] shrink-0",
        className,
      )}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-full shrink-0 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-3 text-xs font-medium transition-colors",
              active
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated Prefer portable names */
export const CrmSectionCard = SectionCard;
export const CrmSegmentedControl = SegmentedControl;
export type CrmSectionCardProps = SectionCardProps;
