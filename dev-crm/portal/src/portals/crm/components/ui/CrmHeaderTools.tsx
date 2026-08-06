"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CrmButton } from "./CrmButton";
import { CrmIcon } from "@/lib/crm/shared/icons";

type CrmHeaderToolsProps = {
  /** Extra tools rendered before Export (bulk delete, email, etc.) */
  leading?: ReactNode;
  onExport?: () => void;
  exportLabel?: string;
  exporting?: boolean;
  canExport?: boolean;
  onImport?: () => void;
  canImport?: boolean;
  onRefresh?: () => void;
  /** CRMS page-header Collapse — toggles top app chrome */
  onCollapse?: () => void;
  collapsed?: boolean;
  /** Extra icon buttons after Collapse/Import (columns, …) */
  trailing?: ReactNode;
  className?: string;
  /** When set, Export becomes a dropdown with these items */
  exportMenu?: ReactNode;
  exportMenuOpen?: boolean;
  onExportMenuToggle?: () => void;
  exportMenuRef?: React.RefObject<HTMLDivElement | null>;
};

/**
 * CRMS page-header tools: Export · Refresh · Collapse
 * Icons: ti-package-export · ti-refresh · ti-transition-top
 * Reference: https://crms.dreamstechnologies.com/html/leads.html
 */
export function CrmHeaderTools({
  leading,
  onExport,
  exportLabel = "Export",
  exporting,
  canExport = true,
  onImport,
  canImport = true,
  onRefresh,
  onCollapse,
  collapsed,
  trailing,
  className,
  exportMenu,
  exportMenuOpen,
  onExportMenuToggle,
  exportMenuRef,
}: CrmHeaderToolsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {leading}
      {exportMenu ? (
        <div className="relative z-30" ref={exportMenuRef}>
          <CrmButton
            variant="secondary"
            onClick={onExportMenuToggle}
            className="px-2 shadow-[var(--crm-shadow-input)]"
            rightIcon={
              <CrmIcon.ChevronDown
                size={14}
                className={cn("transition-transform", exportMenuOpen && "rotate-180")}
              />
            }
            leftIcon={<CrmIcon.Export size={15} />}
          >
            {exportLabel}
          </CrmButton>
          {exportMenuOpen ? exportMenu : null}
        </div>
      ) : canExport && onExport ? (
        <CrmButton
          variant="secondary"
          onClick={onExport}
          disabled={exporting}
          loading={exporting}
          className="px-2 shadow-[var(--crm-shadow-input)]"
          leftIcon={<CrmIcon.Export size={15} />}
        >
          {exportLabel}
        </CrmButton>
      ) : null}
      {onRefresh ? (
        <CrmButton
          variant="icon"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh"
          className="shadow-[var(--crm-shadow-input)] text-[var(--text-main)]"
          leftIcon={<CrmIcon.Refresh size={16} />}
        />
      ) : null}
      {onCollapse ? (
        <CrmButton
          variant="icon"
          onClick={onCollapse}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand header" : "Collapse header"}
          aria-pressed={collapsed}
          className="shadow-[var(--crm-shadow-input)] text-[var(--text-main)]"
          leftIcon={
            collapsed ? <CrmIcon.Expand size={16} /> : <CrmIcon.Collapse size={16} />
          }
        />
      ) : null}
      {canImport && onImport ? (
        <CrmButton
          variant="icon"
          onClick={onImport}
          title="Import"
          aria-label="Import"
          className="shadow-[var(--crm-shadow-input)] text-[var(--text-main)]"
          leftIcon={<CrmIcon.Import size={16} />}
        />
      ) : null}
      {trailing}
    </div>
  );
}
