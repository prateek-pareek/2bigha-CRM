/**
 * CRM-owned overlay / record chrome (CRMS Figma kit).
 * Import from `@/lib/crm/chrome` — not `@/lib/pm/jira-ui` — so CRM stays extractable.
 */

/** Offcanvas + center modals */
export const crmModalChrome = {
  portalRoot: "theme-crm-hubspot crm-app-root",
  overlay: "fixed inset-0 z-[9999] overflow-hidden",
  backdrop:
    "absolute inset-0 bg-[#202c4b]/45 animate-in fade-in duration-200",
  closeBtn:
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors",
  slidePanel:
    "absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-raised)] animate-in slide-in-from-right duration-200",
  slideHeader:
    "flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--card-bg)] px-5 py-4",
  slideTitle: "truncate text-[18px] font-bold leading-snug tracking-normal text-[var(--text-main)]",
  slideSubtitle: "mt-0.5 text-sm font-normal text-[var(--text-muted)]",
  slideBody: "min-h-0 flex-1 overflow-y-auto custom-scrollbar px-5 py-5",
  slideFooter:
    "flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--card-bg)] px-5 py-3.5",
  centerShell:
    "crm-modal relative flex w-full flex-col overflow-hidden rounded-[var(--crm-radius-modal)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-raised)] animate-in zoom-in-95 duration-200",
  centerHeader:
    "flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-3.5",
  centerTitle: "text-[20px] font-bold leading-[1.2] tracking-normal text-[var(--text-main)]",
  centerLead: "text-sm font-normal text-[var(--text-muted)]",
  centerBody: "min-h-0 flex-1 overflow-y-auto px-5 py-5",
  centerFooter:
    "flex shrink-0 justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--card-bg)] px-5 py-3.5",
  sectionTitle: "text-sm font-semibold text-[var(--text-main)]",
  sectionPanel:
    "rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] p-4",
  tabBar:
    "flex gap-0.5 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-0.5 no-scrollbar",
  tabBtn:
    "flex min-w-[64px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium transition-colors",
  tabBtnActive:
    "bg-[var(--card-bg)] text-[var(--primary)] shadow-[var(--crm-shadow-card)]",
  tabBtnInactive:
    "text-[var(--text-muted)] hover:bg-[var(--card-bg)]/60 hover:text-[var(--text-main)]",
} as const;

/** Record detail page chrome — CRMS leads-details layout */
export const crmRecordChrome = {
  page: "crm-record-page mx-auto w-full max-w-[1400px] space-y-3 pb-6 md:pb-8",
  /** Ref: col-xl-4 (~360px) | fluid main */
  bodyGrid:
    "grid grid-cols-1 gap-3 lg:gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start",
  backLink:
    "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]",
  panel:
    "overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]",
  /** Full-width profile hero (avatar + meta + status) */
  hero: "crm-record-hero relative overflow-visible rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]",
  heroBody:
    "flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pb-4",
  avatar:
    "crm-record-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--warning,#ffa201)_55%,white)] bg-[color-mix(in_srgb,var(--warning,#ffa201)_14%,white)] text-base font-semibold text-[var(--warning,#ffa201)] sm:h-[4.5rem] sm:w-[4.5rem] sm:text-lg",
  title: "text-lg font-semibold leading-snug text-[var(--text-main)] sm:text-xl",
  metaLine:
    "mb-0 flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)]",
  actions: "flex flex-wrap items-center gap-2",
  statusPrivate:
    "inline-flex items-center gap-1 rounded-md bg-[var(--error-light)] px-2 py-1 text-xs font-medium text-[var(--error)]",
  statusStage:
    "inline-flex h-8 items-center gap-1 rounded-[var(--crm-radius-ui)] bg-[var(--success)] px-2.5 text-xs font-medium text-white shadow-sm",
  gearBtn:
    "crm-record-gear absolute -right-3 top-1/2 z-[5] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[var(--crm-radius-ui)] bg-[var(--primary)] text-white shadow-[var(--crm-shadow-button-hover)] hover:bg-[var(--primary-dark)]",
  header:
    "flex flex-col gap-4 border-b border-[var(--border-color)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6",
  quickActions: "mt-2 flex flex-wrap items-center gap-1",
  quickAction:
    "inline-flex flex-col items-center gap-1 rounded-[var(--radius-md)] p-1.5 transition-colors hover:bg-[var(--surface-dim)]",
  quickActionIcon:
    "flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
  quickActionLabel: "text-[10px] font-medium text-[var(--text-muted)]",
  stageBar:
    "crm-record-pipeline rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-4 shadow-[var(--crm-shadow-card)]",
  stageStep:
    "relative flex min-w-[88px] flex-1 flex-col items-center gap-1.5 py-1",
  stageDot:
    "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
  stageDotCurrent:
    "border-[var(--primary)] bg-[var(--primary)] text-white",
  stageDotComplete:
    "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]",
  stageDotIdle:
    "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)]",
  stageLabel: "text-xs font-medium text-[var(--text-muted)] text-center",
  stageLabelCurrent: "font-semibold text-[var(--primary)]",
  tabBar:
    "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-3 pt-1 sm:px-4",
  tabs: "flex gap-0 overflow-x-auto",
  tab: "inline-flex h-11 shrink-0 items-center gap-1.5 border-b-[3px] border-transparent px-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]",
  tabActive: "!border-[var(--primary)] !text-[var(--primary)] font-semibold",
  tabBody: "p-4 sm:p-4",
  sidebar:
    "crm-record-sidebar space-y-3 lg:min-w-0 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:sticky lg:top-3 lg:pr-0.5 custom-scrollbar",
  sidebarPanel:
    "rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3.5 shadow-[var(--crm-shadow-card)] sm:p-4",
  sectionTitle: "mb-2.5 text-sm font-semibold text-[var(--text-main)]",
  infoRow:
    "flex items-start justify-between gap-3 border-b border-[var(--border-color)] py-2.5 last:border-b-0 last:pb-0 first:pt-0",
  infoLabel:
    "max-w-[46%] shrink-0 text-[13px] leading-snug text-[var(--text-muted)]",
  infoValue:
    "min-w-0 flex-1 text-right text-[13px] font-medium leading-snug text-[var(--text-main)] break-words",
} as const;
