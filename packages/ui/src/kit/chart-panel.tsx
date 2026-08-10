"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";
import { CRM_PANEL } from "./tokens";

export type ChartPanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Optional leading icon in the header */
  icon?: ReactNode;
};

/** Chart / analytics card — accent bar, bordered header, flat elevation */
export function ChartPanel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  icon,
}: ChartPanelProps) {
  return (
    <section className={cn(CRM_PANEL, "overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="crm-line-title mt-0.5 inline-block h-4 w-[3px] shrink-0 rounded-[1px]"
            style={{ background: "var(--crm-line-title)" }}
            aria-hidden
          />
          {icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold leading-none text-[var(--text-main)]">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** @deprecated Prefer `ChartPanel` */
export const CrmChartPanel = ChartPanel;
export type CrmChartPanelProps = ChartPanelProps;
