/**
 * Workspace (Work → Dashboard) — daily ops views only.
 * Labels are short Title Case topics (same pattern as Reports).
 * Combined dashboards first; Action Queue + Calendar live under Engage.
 * Each primary page has its own RBAC module (`workspace-*:read`).
 */
export const WORKSPACE_ROUTES = [
  {
    slug: "work",
    label: "Work Dashboard",
    href: "/crm/workspace/work",
    section: "work",
    permission: "workspace-work:read",
  },
  {
    slug: "summary",
    label: "Sales Overview",
    href: "/crm/workspace/summary",
    permission: "workspace-summary:read",
  },
  {
    slug: "prospecting",
    label: "Leads Dashboard",
    href: "/crm/workspace/prospecting",
    permission: "workspace-prospecting:read",
  },
  {
    slug: "growth",
    label: "Growth Dashboard",
    href: "/crm/workspace/growth",
    section: "growth",
    permission: "workspace-growth:read",
  },
  {
    slug: "calls",
    label: "Call Workspace",
    href: "/crm/workspace/calls",
    section: "calls",
    permission: "workspace-calls:read",
  },
  /** Still routable for deep links / Engage nav; not listed under Dashboard. */
  {
    slug: "calendar",
    label: "Calendar",
    href: "/crm/workspace/calendar",
    engageOnly: true,
    permission: "workspace-calendar:read",
  },
  {
    slug: "work-queue",
    label: "Action Queue",
    href: "/crm/workspace/work-queue",
    section: "work_queue",
    engageOnly: true,
    permission: "workspace-work:read",
  },
  /**
   * Legacy routes — kept for redirects / deep links; excluded from sidebar via `legacy: true`.
   */
  { slug: "lead-status", label: "Lead Status", href: "/crm/workspace/lead-status", section: "lead_status", legacy: true, permission: "workspace-prospecting:read" },
  { slug: "follow-ups", label: "Follow-ups", href: "/crm/workspace/follow-ups", section: "follow_ups", legacy: true, permission: "workspace-prospecting:read" },
  { slug: "tasks", label: "Tasks due", href: "/crm/workspace/tasks", legacy: true, permission: "workspace-work:read" },
  { slug: "activity", label: "Activity", href: "/crm/workspace/activity", legacy: true, permission: "workspace-work:read" },
] as const;

export type WorkspaceRouteSlug = (typeof WORKSPACE_ROUTES)[number]["slug"];

/** Map URL slug → internal section id used by WorkspaceShell */
export function workspaceSectionFromSlug(slug: string): string {
  const row = WORKSPACE_ROUTES.find((r) => r.slug === slug);
  if (!row) return "summary";
  return "section" in row && row.section ? row.section : row.slug;
}

/** Resolve title from URL slug or WorkspaceShell section id. */
export function workspaceSectionTitle(sectionOrSlug: string): string {
  const bySlug = WORKSPACE_ROUTES.find((r) => r.slug === sectionOrSlug);
  if (bySlug) return bySlug.label;
  const bySection = WORKSPACE_ROUTES.find(
    (r) => "section" in r && (r as { section?: string }).section === sectionOrSlug,
  );
  if (bySection) return bySection.label;
  return "Dashboard";
}

/**
 * Lead report pages — each is its own route (Dreams Lead Reports group).
 */
export const LEAD_REPORT_SECTIONS = [
  { slug: "leads", label: "Lead Reports", href: "/crm/reports/leads", variant: "overview", permission: "reports-leads:read" },
  { slug: "leads-funnel", label: "Lead Funnel", href: "/crm/reports/leads/funnel", variant: "funnel", permission: "reports-leads-funnel:read" },
  { slug: "leads-aging", label: "Lead Aging", href: "/crm/reports/leads/aging", variant: "aging", permission: "reports-leads-aging:read" },
  {
    slug: "leads-conversion",
    label: "Lead Conversion Time",
    href: "/crm/reports/leads/conversion-time",
    variant: "conversion_time",
    permission: "reports-leads-conversion:read",
  },
] as const;

/** @deprecated Use LEAD_REPORT_SECTIONS */
export const LEAD_REPORT_ROUTES = LEAD_REPORT_SECTIONS;

export type LeadReportVariant = (typeof LEAD_REPORT_SECTIONS)[number]["variant"];

/**
 * Reports — Agent Performance and Team & Organizations reports.
 * Agent Performance: individual agent metrics (calls, leads, conversion, follow-up, response time, properties).
 * Team & Organizations: team-level roll-ups, lead source/intent conversion, WhatsApp/IVR engagement.
 */
export const REPORT_ROUTES = [
  { slug: "agents", label: "Agent Performance", href: "/crm/reports/agents", permission: "dashboard:read" },
  { slug: "teams", label: "Team & Organizations", href: "/crm/reports/team-organizations", permission: "dashboard:read" },
] as const;

export type ReportRouteSlug = (typeof REPORT_ROUTES)[number]["slug"];

/** Page blurbs — keyed by slug; keep in sync with REPORT_ROUTES. */
export const REPORT_SECTION_DESCRIPTIONS: Record<string, string> = {
  agents: "Comprehensive agent performance analytics — calls made, leads conversion, follow-up adherence, response time, properties listed, and target achievement.",
  teams: "Team-level analytics with lead source/intent conversion tracking, WhatsApp engagement rates, and IVR call metrics for managers and team leads.",
};

export function reportSectionTitle(slug: string): string {
  return REPORT_ROUTES.find((r) => r.slug === slug)?.label ?? "Reports";
}

export function leadReportVariantFromSlug(slug: string): LeadReportVariant {
  return LEAD_REPORT_SECTIONS.find((r) => r.slug === slug)?.variant ?? "overview";
}

/** Dashboard children shown in sidebar (excludes Engage-only and legacy merged routes). */
export function workspaceNavRoutes() {
  return WORKSPACE_ROUTES.filter(
    (r) =>
      !("engageOnly" in r && r.engageOnly) &&
      !("legacy" in r && r.legacy),
  );
}

/** Report children shown in the CRM sidebar (each report is its own page). */
export function reportNavRoutes() {
  return REPORT_ROUTES;
}

/** Lead report pages (Dreams Lead Reports group). */
export function leadReportNavRoutes() {
  return LEAD_REPORT_SECTIONS;
}
