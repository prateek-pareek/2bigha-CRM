export type EventCalendarCategory =
  | "holiday"
  | "interview"
  | "meeting"
  | "training"
  | "work"
  | "projects"
  | "applications"
  | "design";

export type EventCalendarSidebarFilter =
  | "team"
  | "work"
  | "external"
  | "projects"
  | "applications"
  | "design";

/** Event form + chip colors — aligned with Dreams CRM calendar reference */
export const EVENT_CALENDAR_CATEGORIES: Array<{
  value: EventCalendarCategory;
  label: string;
  dotClass: string;
  chipClass: string;
  filter: EventCalendarSidebarFilter;
}> = [
  {
    value: "holiday",
    label: "Holiday",
    dotClass: "bg-[var(--success)]",
    chipClass:
      "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,var(--card-bg))] text-[color-mix(in_srgb,var(--success)_85%,#000)]",
    filter: "team",
  },
  {
    value: "interview",
    label: "Interview",
    dotClass: "bg-[var(--warning)]",
    chipClass:
      "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,var(--card-bg))] text-[color-mix(in_srgb,var(--warning)_80%,#000)]",
    filter: "team",
  },
  {
    value: "meeting",
    label: "Meeting",
    dotClass: "bg-[var(--primary)]",
    chipClass:
      "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,var(--card-bg))] text-[var(--primary)]",
    filter: "team",
  },
  {
    value: "training",
    label: "Training",
    dotClass: "bg-[var(--info)]",
    chipClass:
      "border-[color-mix(in_srgb,var(--info)_35%,transparent)] bg-[color-mix(in_srgb,var(--info)_12%,var(--card-bg))] text-[var(--info)]",
    filter: "team",
  },
  {
    value: "work",
    label: "Work",
    dotClass: "bg-violet-500",
    chipClass:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200",
    filter: "work",
  },
  {
    value: "projects",
    label: "Projects",
    dotClass: "bg-emerald-500",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
    filter: "projects",
  },
  {
    value: "applications",
    label: "Applications",
    dotClass: "bg-cyan-500",
    chipClass:
      "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-200",
    filter: "applications",
  },
  {
    value: "design",
    label: "Design",
    dotClass: "bg-amber-500",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
    filter: "design",
  },
];

export const EVENT_CALENDAR_SIDEBAR_FILTERS: Array<{
  key: EventCalendarSidebarFilter;
  label: string;
  dotClass: string;
}> = [
  { key: "team", label: "Team Events", dotClass: "bg-[var(--primary)]" },
  { key: "work", label: "Work", dotClass: "bg-violet-500" },
  { key: "external", label: "External", dotClass: "bg-sky-500" },
  { key: "projects", label: "Projects", dotClass: "bg-emerald-500" },
  { key: "applications", label: "Applications", dotClass: "bg-cyan-500" },
  { key: "design", label: "Design", dotClass: "bg-amber-500" },
];

export const EVENT_CALENDAR_FORM_CATEGORIES = EVENT_CALENDAR_CATEGORIES.filter((c) =>
  ["holiday", "interview", "meeting", "training"].includes(c.value),
);

export function normalizeEventCalendarCategory(raw: unknown): EventCalendarCategory {
  const v = String(raw ?? "meeting").trim().toLowerCase();
  if ((EVENT_CALENDAR_CATEGORIES as readonly { value: string }[]).some((c) => c.value === v)) {
    return v as EventCalendarCategory;
  }
  return "meeting";
}

export function eventCalendarCategoryMeta(category: EventCalendarCategory) {
  return (
    EVENT_CALENDAR_CATEGORIES.find((c) => c.value === category) ?? EVENT_CALENDAR_CATEGORIES[2]
  );
}

export function eventMatchesSidebarFilters(
  ev: {
    externalSource?: string;
    category?: string;
  },
  activeFilters: Set<EventCalendarSidebarFilter>,
): boolean {
  if (activeFilters.size === 0) return true;

  if (ev.externalSource && activeFilters.has("external")) return true;

  const category = normalizeEventCalendarCategory(ev.category);
  const meta = eventCalendarCategoryMeta(category);
  return activeFilters.has(meta.filter);
}

/** @deprecated Prefer `EventCalendarCategory` */
export type CalendarEventCategory = EventCalendarCategory;
/** @deprecated Prefer `EventCalendarSidebarFilter` */
export type CalendarSidebarFilter = EventCalendarSidebarFilter;
/** @deprecated Prefer `EVENT_CALENDAR_CATEGORIES` */
export const CALENDAR_EVENT_CATEGORIES = EVENT_CALENDAR_CATEGORIES;
/** @deprecated Prefer `EVENT_CALENDAR_SIDEBAR_FILTERS` */
export const CALENDAR_SIDEBAR_FILTERS = EVENT_CALENDAR_SIDEBAR_FILTERS;
/** @deprecated Prefer `EVENT_CALENDAR_FORM_CATEGORIES` */
export const CALENDAR_FORM_CATEGORIES = EVENT_CALENDAR_FORM_CATEGORIES;
/** @deprecated Prefer `normalizeEventCalendarCategory` */
export const normalizeEventCategory = normalizeEventCalendarCategory;
/** @deprecated Prefer `eventCalendarCategoryMeta` */
export const calendarCategoryMeta = eventCalendarCategoryMeta;
