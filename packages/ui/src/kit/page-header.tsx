"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";
import { CRM_H1, CRM_LEAD } from "./tokens";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";

export type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  badge?: ReactNode;
  icon?: ReactNode;
  /** Right-side utilities on the title row (Export, refresh, collapse) */
  actions?: ReactNode;
  /** Center slot on the title row (search, …) */
  middle?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** When false, render flat (list pages) */
  bordered?: boolean;
  /** Tighter title/breadcrumb spacing for list pages. */
  compact?: boolean;
};

/**
 * Page header — title + soft badge …… actions; optional breadcrumbs under title.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  badge,
  icon,
  actions,
  middle,
  footer,
  className,
  bordered = true,
  compact = false,
}: PageHeaderProps) {
  const body = (
    <>
      <div className={cn("mb-0 flex flex-col sm:flex-row sm:items-center", compact ? "gap-1 sm:gap-2" : "gap-2", middle ? "sm:justify-start" : "sm:justify-between")}>
        <div className={cn("flex min-w-0 items-start", compact ? "gap-2" : "gap-3")}>
          {icon ? (
            <div className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)] sm:flex">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-0.5 text-xs font-medium text-[var(--text-muted)]">{eyebrow}</p>
            ) : null}
            <div className={cn("flex flex-wrap items-center gap-2", compact ? "mb-0" : "mb-1")}>
              <h1 className={cn(CRM_H1, compact && "text-[18px] leading-tight")}>{title}</h1>
              {badge}
            </div>
            {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} className={compact ? "text-xs leading-tight" : undefined} /> : null}
            {description ? <p className={cn(CRM_LEAD, compact ? "mt-0.5" : "mt-1")}>{description}</p> : null}
          </div>
        </div>
        {middle ? (
          <div className="flex min-w-0 flex-1 items-center px-2 sm:justify-center sm:px-4">
            {middle}
          </div>
        ) : null}
        {actions ? (
          <div className={cn("flex shrink-0 flex-wrap items-center", compact ? "gap-1.5" : "gap-2")}>{actions}</div>
        ) : null}
      </div>
      {footer ? (
        <div className={cn("border-t border-[var(--border-color)]", compact ? "mt-2 pt-2" : "mt-3 pt-3")}>{footer}</div>
      ) : null}
    </>
  );

  if (!bordered) {
    return <div className={cn(compact ? "mb-1.5 shrink-0" : "mb-2 shrink-0", className)}>{body}</div>;
  }

  return (
    <header
      className={cn(
        "mb-4 overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-4 sm:px-5",
        className,
      )}
    >
      {body}
    </header>
  );
}

/** @deprecated Prefer `PageHeader` */
export const CrmPageHeader = PageHeader;
export type CrmPageHeaderProps = PageHeaderProps;
