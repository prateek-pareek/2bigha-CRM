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
    slug: "admin",
    label: "Admin Dashboard",
    href: "/crm/workspace/admin",
    requiredPermission: "workspace-admin:read",
  },
  {
    slug: "team",
    label: "Team Lead Dashboard",
    href: "/crm/workspace/team",
    requiredPermission: "workspace-team:read",
  },
  {
    slug: "agent",
    label: "Agent Dashboard",
    href: "/crm/workspace/agent",
    requiredPermission: "workspace-agent:read",
  },
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

/** Role-tier dashboards shown under Work → Dashboard. Highest grant wins. */
export const ROLE_DASHBOARD_PERMISSIONS = [
  "workspace-admin:read",
  "workspace-team:read",
  "workspace-agent:read",
] as const;

export type RoleDashboardPermission =
  (typeof ROLE_DASHBOARD_PERMISSIONS)[number];

/**
 * One landing dashboard per role: Admin > Team Lead > Agent.
 * Specific tier keys win over the `dashboard:read` master so Agents who still
 * carry the master key are not shown Admin / Team Lead dashboards.
 */
export function primaryRoleDashboardPermission(
  hasAccess: (permission: string) => boolean,
): RoleDashboardPermission | null {
  if (hasAccess("workspace-admin:read")) {
    return "workspace-admin:read";
  }
  if (hasAccess("workspace-team:read")) {
    return "workspace-team:read";
  }
  if (hasAccess("workspace-agent:read")) {
    return "workspace-agent:read";
  }
  // Master key alone (Managers / Admins without a tier key) → Admin dashboard.
  if (hasAccess("dashboard:read")) {
    return "workspace-admin:read";
  }
  return null;
}

function isRoleDashboardPermission(
  permission: string,
): permission is RoleDashboardPermission {
  return (ROLE_DASHBOARD_PERMISSIONS as readonly string[]).includes(permission);
}

/**
 * Which role dashboards a caller may open:
 *   Admin  → Admin only
 *   Team   → Team Lead + Agent (agent view filtered by team member name)
 *   Agent  → Agent only
 */
export function canAccessRoleDashboard(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
): boolean {
  if (!isRoleDashboardPermission(requiredPermission)) return false;
  const primary = primaryRoleDashboardPermission(hasAccess);
  if (!primary) return false;
  if (primary === "workspace-admin:read") {
    return requiredPermission === "workspace-admin:read";
  }
  if (primary === "workspace-team:read") {
    return (
      requiredPermission === "workspace-team:read" ||
      requiredPermission === "workspace-agent:read"
    );
  }
  return requiredPermission === "workspace-agent:read";
}

/** True when caller is Admin tier (org-wide pickers on Admin / Team pages). */
export function canPickAnyDashboardEmployee(
  hasAccess: (permission: string) => boolean,
): boolean {
  return primaryRoleDashboardPermission(hasAccess) === "workspace-admin:read";
}

/** Team Lead may open Agent Dashboard for a selected team member. */
export function canPickAgentOnAgentDashboard(
  hasAccess: (permission: string) => boolean,
): boolean {
  return primaryRoleDashboardPermission(hasAccess) === "workspace-team:read";
}

/** Sidebar visibility: page access AND role-dashboard rules above. */
export function canShowCrmDashboardNavItem(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
): boolean {
  if (!isRoleDashboardPermission(requiredPermission)) {
    return (
      canAccessCrmDashboardPage(hasAccess, requiredPermission) ||
      hasAccess(requiredPermission)
    );
  }
  return canAccessRoleDashboard(hasAccess, requiredPermission);
}

/** Redirect away from a role dashboard the caller cannot open. */
export function roleDashboardRedirectHref(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
): string | null {
  if (!isRoleDashboardPermission(requiredPermission)) return null;
  if (canAccessRoleDashboard(hasAccess, requiredPermission)) return null;
  const primary = primaryRoleDashboardPermission(hasAccess);
  if (!primary) return null;
  return (
    CRM_WORKSPACE_ACCESS_ITEMS.find((i) => i.requiredPermission === primary)
      ?.href ?? null
  );
}

/**
 * Master key OR specific module — same pattern as canAccessCrmSetting.
 * Role-tier dashboards follow canAccessRoleDashboard (Admin / Team+Agent / Agent).
 * Other workspace-* / reports-* still accept `dashboard:read` as a master unlock.
 */
export function canAccessCrmDashboardPage(
  hasAccess: (permission: string) => boolean,
  requiredPermission: string,
  opts?: { canViewCrmRevenue?: boolean; revenueOnly?: boolean },
): boolean {
  if (opts?.revenueOnly && !opts.canViewCrmRevenue) return false;
  if (isRoleDashboardPermission(requiredPermission)) {
    return canAccessRoleDashboard(hasAccess, requiredPermission);
  }
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
