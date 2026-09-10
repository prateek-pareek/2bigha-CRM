"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  /** Rendered immediately after Export (saved views, …) */
  afterExport?: ReactNode;
  className?: string;
  /** When set, Export becomes a dropdown with these items */
  exportMenu?: ReactNode;
  exportMenuOpen?: boolean;
  onExportMenuToggle?: () => void;
  exportMenuRef?: RefObject<HTMLDivElement | null>;
};

function assignRef<T>(ref: RefObject<T | null> | undefined, value: T | null) {
  if (!ref) return;
  (ref as { current: T | null }).current = value;
}

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
  afterExport,
  className,
  exportMenu,
  exportMenuOpen,
  onExportMenuToggle,
  exportMenuRef,
}: CrmHeaderToolsProps) {
  const triggerWrapRef = useRef<HTMLDivElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const setTriggerNode = useCallback(
    (node: HTMLDivElement | null) => {
      triggerWrapRef.current = node;
      assignRef(exportMenuRef, node);
    },
    [exportMenuRef],
  );

  const updateMenuPosition = useCallback(() => {
    const el = triggerWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [exportMenuOpen, updateMenuPosition]);

  const portaledMenu =
    exportMenu &&
    exportMenuOpen &&
    menuPos &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuPortalRef}
            data-crm-export-menu=""
            className="fixed z-[9999]"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {/* Neutralize page-level absolute/mt classes so the menu hugs the button */}
            <div className="[&>div]:!static [&>div]:!right-auto [&>div]:!mt-0 [&>div]:!top-auto">
              {exportMenu}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {leading}
      {exportMenu ? (
        <div className="relative z-30" ref={setTriggerNode}>
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
          {portaledMenu}
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
      {afterExport}
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
