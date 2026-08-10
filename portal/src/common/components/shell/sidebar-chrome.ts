/**
 * Global suite left-rail chrome — shared by CRM, HRMS, Social, PM, Vault, Executive.
 * Active: soft primary pill + solid primary icon tile with white glyph.
 * Idle: muted label + light chip behind outline icon.
 */

export const suiteSidebarChrome = {
  rail: "suite-jira-sidebar suite-sidebar-rail",
  brand: "suite-sidebar-brand",
  nav: "suite-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3",
  navProductLabel:
    "suite-sidebar-product-label mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted,#6b7280)]",
  navSection: "mb-1",
  navSectionLabel:
    "suite-sidebar-section-label mb-2 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted,#6b7280)] first:mt-0",
  navItem:
    "suite-sidebar-nav-item crm-hs-nav-item flex h-10 items-center gap-2.5 rounded-lg px-2 text-[14px] font-medium text-[var(--text-main,#1f2020)] transition-colors hover:bg-[var(--suite-sidebar-hover,#f7f8f9)] hover:text-[var(--text-main,#1f2020)]",
  navItemActive:
    "bg-[var(--suite-sidebar-active-bg,#fce9e6)] font-medium text-[var(--primary,#e41f07)] hover:bg-[var(--suite-sidebar-active-bg,#fce9e6)] hover:text-[var(--primary,#e41f07)]",
  navItemCollapsed: "justify-center px-0",
  navItemLocked: "cursor-not-allowed opacity-40 hover:bg-transparent",
  navIcon: "text-[var(--text-main,#1f2020)]",
  navIconActive: "text-white",
  /** Idle icon tile — light grey rounded square */
  navIconBox:
    "suite-sidebar-nav-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--suite-sidebar-chip-bg,#f3f4f6)] text-[var(--text-main,#1f2020)]",
  /** Active icon tile — solid primary, white glyph */
  navIconBoxActive:
    "suite-sidebar-nav-icon suite-sidebar-nav-icon--active flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--primary,#e41f07)] text-white",
  navSubBorder: "border-[var(--border-color,#e2e8f0)]",
  footer: "shrink-0 border-t border-[var(--suite-sidebar-border,#e2e8f0)] px-3 py-2",
} as const;

export type SuiteSidebarChrome = typeof suiteSidebarChrome;
