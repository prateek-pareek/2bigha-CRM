"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CRM_TOOLBAR } from "@/lib/crm/ui";
import { CrmPageHeader } from "./CrmPageHeader";
import { CrmEmptyState } from "./CrmEmptyState";
import type { CrmBreadcrumbItem } from "./CrmBreadcrumb";

type CrmListPageShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: CrmBreadcrumbItem[];
  badge?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  empty?: {
    show: boolean;
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
  };
  className?: string;
  contentClassName?: string;
  /** CRMS list pages often use flat headers (no card around title) */
  headerBordered?: boolean;
};

/**
 * Shared list/dashboard shell aligned to CRMS Admin Panel patterns.
 */
export function CrmListPageShell({
  title,
  description,
  eyebrow,
  breadcrumbs,
  badge,
  icon,
  actions,
  toolbar,
  children,
  empty,
  className,
  contentClassName,
  headerBordered = false,
}: CrmListPageShellProps) {
  return (
    <div
      className={cn(
        "theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500",
        className,
      )}
    >
      <CrmPageHeader
        title={title}
        description={description}
        eyebrow={eyebrow}
        breadcrumbs={breadcrumbs}
        badge={badge}
        icon={icon}
        actions={actions}
        bordered={headerBordered}
        className={headerBordered ? undefined : "mb-4"}
      />
      {toolbar ? <div className={cn(CRM_TOOLBAR, "mb-4")}>{toolbar}</div> : null}
      {empty?.show ? (
        <CrmEmptyState
          title={empty.title}
          description={empty.description}
          icon={empty.icon}
          action={empty.action}
        />
      ) : (
        <div className={cn(contentClassName)}>{children}</div>
      )}
    </div>
  );
}
