"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";
import { CRM_COUNT_BADGE, CRM_PANEL, CRM_TOOLBAR } from "./tokens";

/** Count chip next to page titles — e.g. Deals [125] */
export function CountBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(CRM_COUNT_BADGE, className)}>{children}</span>;
}

export function PanelCard({
  children,
  className,
  raised,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}) {
  return (
    <div
      className={cn(
        CRM_PANEL,
        raised && "shadow-[var(--crm-shadow-raised)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** List toolbar: Filter | Search …… View | Export | + Add */
export function Toolbar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(CRM_TOOLBAR, "justify-between", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      {right ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>
      ) : null}
    </div>
  );
}

/** Data table shell — white panel under list toolbar */
export function TableShell({
  children,
  className,
  scrollClassName,
}: {
  children: ReactNode;
  className?: string;
  /** Override inner scroll wrapper (default overflow-x-auto) */
  scrollClassName?: string;
}) {
  return (
    <div className={cn(CRM_PANEL, "flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className={cn("min-h-0 flex-1 overflow-auto custom-scrollbar", scrollClassName)}>
        {children}
      </div>
    </div>
  );
}

export function KitTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={cn("crm-table min-w-full border-collapse text-left text-sm", className)}>
      {children}
    </table>
  );
}

/** @deprecated Prefer portable names above */
export const CrmCountBadge = CountBadge;
export const CrmCard = PanelCard;
export const CrmToolbar = Toolbar;
export const CrmTableShell = TableShell;
export const CrmTable = KitTable;
