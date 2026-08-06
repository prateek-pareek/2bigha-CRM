/**
 * Product kit style tokens (originally CRMS / Dreams Technologies).
 * Host apps must define the CSS variables referenced here
 * (`--primary`, `--card-bg`, `--crm-shadow-card`, `--crm-radius-ui`, …).
 *
 * `CRM_*` names are kept for call-site compatibility; prefer importing from
 * `@mathionix/ui/kit` in new code.
 */

/** Soft elevated card — dashboard panels, list chrome, record sections */
export const CRM_PANEL =
  "crm-panel rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]";

export const CRM_PANEL_RAISED =
  "crm-panel crm-panel--raised rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]";

/**
 * CRMS list toolbar strip — sits on canvas (not a heavy card).
 * Pattern: Filter | Search …… View | + Add
 */
export const CRM_TOOLBAR =
  "flex flex-wrap items-center gap-2.5 py-1";

/** Page title — CRMS `.main-title` / h4: 20px · 700 · lh 1.2 (Golos via [data-crm-app]) */
export const CRM_H1 =
  "text-[20px] font-bold leading-[1.2] tracking-normal text-[var(--text-main)]";

export const CRM_LEAD = "text-sm font-normal leading-normal text-[var(--text-muted)]";

export const CRM_SECTION_LABEL =
  "text-sm font-semibold text-[var(--text-main)]";

export const CRM_NAV_ACTIVE =
  "bg-[var(--suite-sidebar-active-bg)] text-[var(--primary)] font-medium";

export const CRM_NAV_IDLE =
  "text-[var(--text-muted)] hover:bg-[var(--suite-sidebar-hover)] hover:text-[var(--text-main)]";

/** Idle icon tile behind sidebar glyphs */
export const CRM_NAV_ICON_BOX =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--suite-sidebar-chip-bg,#f3f4f6)] text-[var(--text-main)]";

/** Active icon tile — solid primary, white glyph */
export const CRM_NAV_ICON_BOX_ACTIVE =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--primary)] text-white";

/** Buttons — CRMS ~5px radius, 38px height */
export const CRM_BTN_PRIMARY =
  "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] shadow-sm transition-colors hover:bg-[var(--primary-dark)] disabled:pointer-events-none disabled:opacity-50";

export const CRM_BTN_SECONDARY =
  "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--background)] disabled:pointer-events-none disabled:opacity-50";

export const CRM_BTN_GHOST =
  "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] disabled:pointer-events-none disabled:opacity-50";

export const CRM_BTN_ICON =
  "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--background)] hover:text-[var(--text-main)] disabled:pointer-events-none disabled:opacity-50";

export const CRM_BTN_ACCENT = CRM_BTN_PRIMARY;

/** Form controls */
export const CRM_LABEL = "mb-1.5 block text-[13px] font-medium text-[var(--text-main)]";

export const CRM_INPUT =
  "w-full h-[38px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-normal text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/20 disabled:opacity-50";

export const CRM_SELECT = `${CRM_INPUT} appearance-none cursor-pointer`;

/** Compact toolbar `<select>` (Last Email, Pipeline, …) — matches Filter/Search height */
export const CRM_TOOLBAR_SELECT =
  "h-[38px] min-w-[140px] appearance-none rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/20";

/** Segmented icon filter group — CRMS outline-light toolbar */
export const CRM_TOOLBAR_ICON_GROUP =
  "inline-flex h-[38px] items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-0.5 shadow-[var(--crm-shadow-input)]";

export const CRM_TOOLBAR_ICON_BTN =
  "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[calc(var(--radius-md)-2px)] border border-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--text-main)]";

export const CRM_TOOLBAR_ICON_BTN_ACTIVE =
  "border-[var(--primary)]/25 bg-[var(--primary-light)] text-[var(--primary)] shadow-sm";

/** Outline chip button (e.g. Outreach) */
export const CRM_TOOLBAR_CHIP =
  "inline-flex h-[38px] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-colors hover:bg-[var(--background)] hover:text-[var(--text-main)]";

export const CRM_TOOLBAR_CHIP_ACTIVE =
  "border-[var(--warning,#ff9f43)]/40 bg-[color-mix(in_srgb,var(--warning,#ff9f43)_12%,white)] text-[var(--warning,#b45309)]";

/** Outer shell for CRM entity list pages */
export const CRM_LIST_PAGE =
  "theme-crm-hubspot crm-list-page flex h-full min-h-0 flex-col overflow-hidden animate-in fade-in duration-500";

/** White content panel under list toolbar */
export const CRM_LIST_PANEL =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--crm-shadow-card)]";

/**
 * Soft count badge beside titles — CRMS `badge-soft-primary`
 * (light rose fill + red text, NOT solid red)
 */
export const CRM_COUNT_BADGE =
  "inline-flex min-w-[1.5rem] items-center justify-center rounded-[6px] bg-[var(--primary-light)] px-[6px] py-[5px] text-xs font-medium tabular-nums text-[var(--primary)]";

/** Soft indigo Manage Columns — CRMS `btn bg-soft-indigo` */
export const CRM_BTN_MANAGE_COLUMNS =
  "inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] border-0 bg-[#eaedf7] px-3.5 text-sm font-normal text-[#3538cd] transition-colors hover:bg-[#dfe3f5] disabled:pointer-events-none disabled:opacity-50";

/** Export / actions dropdown row item */
export const CRM_MENU_ITEM =
  "flex w-full items-center gap-3 rounded-[var(--radius-md)] p-2.5 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-dim)] disabled:opacity-50";