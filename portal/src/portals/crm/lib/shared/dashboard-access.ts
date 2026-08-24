/**
 * Per-page RBAC for CRM dashboards (workspace) and reports.
 * Mirror of settings-access: `dashboard:read` is the master key; specific
 * `workspace-*` / `reports-*` keys allow fine-grained grants without it.
 */

export type CrmDashboardAccessItem = {
  slug: string;
  label: string;
  href: string;
  requiredPermission: string;
  /** Hide unless canViewCrmRevenue (super-admin revenue gate). */
  revenueOnly?: boolean;
};

/** Primary workspace dashboards shown in sidebar (same pages as reports pattern). */
export const CRM_WORKSPACE_ACCESS_ITEMS: CrmDashboardAccessItem[] = [
  {
    slug: "work",
    label: "Work Dashboard",
    href: "/crm/workspace/work",
    requiredPermission: "workspace-work:read",
  },
  {
    slug: "work-queue",
    label: "Action Queue",
    href: "/crm/workspace/work-queue",
    requiredPermission: "workspace-work:read",
  },
  {
    slug: "summary",
    label: "Sales Overview",
    href: "/crm/workspace/summary",
    requiredPermission: "workspace-summary:read",
  },
  {
    slug: "prospecting",
    label: "Leads Dashboard",
    href: "/crm/workspace/prospecting",
    requiredPermission: "workspace-prospecting:read",
  },
  {
    slug: "growth",
    label: "Growth Dashboard",
    href: "/crm/workspace/growth",
    requiredPermission: "workspace-growth:read",
  },
  {
    slug: "calls",
    label: "Call Workspace",
    href: "/crm/workspace/calls",
    requiredPermission: "workspace-calls:read",
  },
  {
    slug: "calendar",
    label: "Calendar",
    href: "/crm/workspace/calendar",
    requiredPermission: "workspace-calendar:read",
  },
];

/** Every report page — one permission each. */
export const CRM_REPORT_ACCESS_ITEMS: CrmDashboardAccessItem[] = [
  {
    slug: "overview",
    label: "Overview",
    href: "/crm/reports/overview",
    requiredPermission: "reports-overview:read",
  },
  {
    slug: "leads",
    label: "Lead Reports",
    href: "/crm/reports/leads",
    requiredPermission: "reports-leads:read",
  },
  {
    slug: "leads-funnel",
    label: "Lead Funnel",
    href: "/crm/reports/leads/funnel",
    requiredPermission: "reports-leads-funnel:read",
  },
  {
    slug: "leads-aging",
    label: "Lead Aging",
    href: "/crm/reports/leads/aging",
    requiredPermission: "reports-leads-aging:read",
  },
  {
    slug: "leads-conversion",
    label: "Lead Conversion Time",
    href: "/crm/reports/leads/conversion-time",
    requiredPermission: "reports-leads-conversion:read",
  },
  {
    slug: "forecast",
    label: "Pipeline Insights",
    href: "/crm/reports/forecast",
    requiredPermission: "reports-forecast:read",
  },
  {
    slug: "health",
    label: "Sales Health",
    href: "/crm/reports/forecast/health",
    requiredPermission: "reports-health:read",
  },
];

/** Master key OR specific module — same pattern as canAccessCrmSetting.
 *  Only applies the `dashboard:read` master key to workspace-* / reports-* pages.
 */
export function canAccessCrmDashboardPage(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
  opts?: { canViewCrmRevenue?: boolean; revenueOnly?: boolean },
): boolean {
  if (opts?.revenueOnly && !opts.canViewCrmRevenue) return false;
  const isScoped =
    requiredPermission.startsWith("workspace-") ||
    requiredPermission.startsWith("reports-");
  if (isScoped) {
    return hasAccess("dashboard:read") || hasAccess(requiredPermission);
  }
  return hasAccess(requiredPermission);
}

export function permissionForWorkspaceSlug(slug: string): string {
  return (
    CRM_WORKSPACE_ACCESS_ITEMS.find((i) => i.slug === slug)?.requiredPermission ??
    "dashboard:read"
  );
}

export function permissionForReportSlug(slug: string): string {
  return (
    CRM_REPORT_ACCESS_ITEMS.find((i) => i.slug === slug)?.requiredPermission ??
    "dashboard:read"
  );
}

export function firstAccessibleWorkspaceHref(
  hasAccess: (permission: string) => boolean,
  opts?: { canViewCrmRevenue?: boolean },
): string | null {
  const hit = CRM_WORKSPACE_ACCESS_ITEMS.find((i) =>
    canAccessCrmDashboardPage(hasAccess, i.requiredPermission, {
      canViewCrmRevenue: opts?.canViewCrmRevenue,
      revenueOnly: i.revenueOnly,
    }),
  );
  return hit?.href ?? null;
}

export function firstAccessibleReportHref(
  hasAccess: (permission: string) => boolean,
  opts?: { canViewCrmRevenue?: boolean },
): string | null {
  const hit = CRM_REPORT_ACCESS_ITEMS.find((i) =>
    canAccessCrmDashboardPage(hasAccess, i.requiredPermission, {
      canViewCrmRevenue: opts?.canViewCrmRevenue,
      revenueOnly: i.revenueOnly,
    }),
  );
  return hit?.href ?? null;
}

export function canAccessAnyWorkspace(
  hasAccess: (permission: string) => boolean,
  opts?: { canViewCrmRevenue?: boolean },
): boolean {
  return firstAccessibleWorkspaceHref(hasAccess, opts) != null;
}

export function canAccessAnyReport(
  hasAccess: (permission: string) => boolean,
  opts?: { canViewCrmRevenue?: boolean },
): boolean {
  return firstAccessibleReportHref(hasAccess, opts) != null;
}
