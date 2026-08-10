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
  footer?: ReactNode;
  className?: string;
  /** When false, render flat (list pages) */
  bordered?: boolean;
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
  footer,
  className,
  bordered = true,
}: PageHeaderProps) {
  const body = (
    <>
      <div className="mb-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary)] sm:flex">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-0.5 text-xs font-medium text-[var(--text-muted)]">{eyebrow}</p>
            ) : null}
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className={CRM_H1}>{title}</h1>
              {badge}
            </div>
            {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
            {description ? <p className={cn(CRM_LEAD, "mt-1")}>{description}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {footer ? (
        <div className="mt-3 border-t border-[var(--border-color)] pt-3">{footer}</div>
      ) : null}
    </>
  );

  if (!bordered) {
    return <div className={cn("mb-4 shrink-0", className)}>{body}</div>;
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
