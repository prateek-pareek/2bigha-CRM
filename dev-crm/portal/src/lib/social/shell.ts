/**
 * Social desk app shell — same CRMS / Dreams language as CRM
 * (theme-crm-hubspot + soft active sidebar pill).
 *
 * Layout root should use `socialSuiteShellClassName` + `data-crm-app`
 * so Golos + CRM tokens apply without forking a separate theme CSS.
 */

import { suiteSidebarChrome } from "@/components/suite/shell/sidebar-chrome";

/** Root class for `/social` layout */
export const socialSuiteShellClassName =
  "theme-crm-hubspot crm-app-root min-h-screen bg-[var(--background)] text-[var(--text-main)]";

/** Main content area under AppShell when on Social routes */
export const socialShellLayout = {
  shell: "crm-suite-shell flex h-full min-h-0 overflow-hidden bg-[var(--background)]",
  main: "crm-app-main flex-1 overflow-y-auto bg-[var(--background)]",
  /** CRMS `.content` uses 20px padding on all sides */
  mainPadded: "p-5",
} as const;

/** Attribute markers — reuse CRM CSS scoping for identical chrome */
export const SOCIAL_APP_ATTR = {
  root: "data-crm-app",
  theme: "data-crm-theme",
  themeValue: "crms",
} as const;

/**
 * Top app header — same Dreams CRMS white bar as CRM.
 * Used by ModuleJiraAppHeader when productHref starts with `/social`.
 */
export const socialAppChrome = {
  header:
    "crm-app-header theme-crm-hubspot z-50 flex h-[57px] shrink-0 items-center border-b border-[var(--border-color)] bg-white px-3 md:px-4",
  headerCollapsed: "hidden",
  inner: "flex w-full min-w-0 items-center justify-between gap-2 md:gap-3",
  left: "flex min-w-0 flex-1 items-center gap-2",
  mobileMenuBtn:
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] border border-[#e8e8e8] bg-white text-[var(--text-main)] hover:bg-[var(--background)] lg:hidden",
  iconChip:
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] border border-[#e8e8e8] bg-transparent text-[var(--text-main)] transition-colors hover:bg-[var(--background)]",
  iconChipTeal:
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] border-0 bg-[#cfe9e6] text-[#0e9384] transition-colors hover:opacity-90",
  iconChipPurple:
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] border-0 bg-[#d7d7f5] text-[#3538cd] transition-colors hover:opacity-90",
  iconChipAmber:
    "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[5px] border-0 bg-[#fef8e6] text-[#f9b801] transition-colors hover:opacity-90",
  productLink:
    "flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] pr-2 outline-none hover:opacity-90",
  productLogo:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white",
  productName:
    "hidden truncate text-sm font-semibold text-[var(--text-main)] sm:block",
  search:
    "crm-header-search me-auto hidden min-w-0 max-w-[280px] flex-1 lg:block xl:max-w-[320px]",
  actions: "flex shrink-0 items-center gap-2",
  iconBtn:
    "crm-header-icon inline-flex h-[38px] w-[38px] items-center justify-center rounded-[5px] border border-[#e8e8e8] bg-transparent text-[var(--text-main)] hover:bg-[var(--background)]",
  divider: "mx-0.5 hidden h-6 w-px shrink-0 bg-[var(--border-color)] sm:block",
  profileBtn:
    "flex cursor-pointer items-center gap-2 rounded-full p-0.5 hover:opacity-90",
  avatar:
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-white",
  avatarOnline:
    "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22c55e]",
  profileName: "sr-only",
  profileMenu:
    "invisible absolute right-0 top-full z-50 mt-1 w-44 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white py-1 opacity-0 shadow-[var(--crm-shadow-raised)] transition-all group-hover/profile:visible group-hover/profile:opacity-100",
  workspaceMenu:
    "suite-workspace-menu z-50 w-[min(17.5rem,calc(100vw-4rem))] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-1 shadow-[var(--crm-shadow-raised)]",
  workspaceMenuLabel:
    "px-2 py-1.5 text-[11px] font-semibold text-[var(--text-muted)]",
  workspaceMenuItem:
    "suite-workspace-item flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 outline-none transition-colors hover:bg-[var(--background)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]/25",
  workspaceMenuItemActive: "bg-[var(--primary-light)] hover:bg-[var(--primary-light)]",
  workspaceMenuIcon:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
  workspaceMenuIconActive: "bg-[var(--primary)] text-white",
  workspaceMenuIconIdle: "bg-[var(--surface-dim)] text-[var(--text-muted)]",
  workspaceMenuTitle: "text-sm font-medium text-[var(--text-main)]",
  workspaceMenuTitleActive: "font-semibold text-[var(--primary)]",
  workspaceMenuTagline: "line-clamp-1 text-xs leading-snug text-[var(--text-muted)]",
} as const;

/**
 * Sidebar chrome for Social — global suite rail (soft pill + icon tiles).
 */
export const socialSidebarChrome = {
  ...suiteSidebarChrome,
  rail: "suite-jira-sidebar crm-suite-sidebar-rail suite-sidebar-rail",
} as const;
