/**
 * Where a user lands after login (and on /, /crm, /crm/workspace): the first CRM screen
 * their role can actually open — so no role ever lands on /unauthorized just by logging in.
 *
 * 2Bigha / PM roles (lead access) → their role dashboard (Team Lead → /crm/workspace/team,
 * agents → /crm/workspace/agent); Legal → Legal Cases;
 * Property Approval Team → Approval Queue; anything else → first screen it can open.
 */
import { firstAccessibleWorkspaceHref } from "./dashboard-access";
import { isCrmPathHiddenForWorkspace, type CrmWorkspace } from "./crm-workspace-nav";

const ROLE_HOMES: ReadonlyArray<{ href: string; permission: string }> = [
  { href: "/crm/leads", permission: "leads:read" },
  { href: "/crm/pm/leads", permission: "pm-leads:read" },
  { href: "/crm/legal", permission: "legal:read" },
  { href: "/crm/property-approval", permission: "approval-queue:read" },
  { href: "/crm/property-listings", permission: "property-listings:read" },
  { href: "/crm/contacts", permission: "contacts:read" },
  { href: "/crm/tasks", permission: "activities:read" },
  { href: "/crm/ivr/my-call-logs", permission: "ivr-service:read" },
  { href: "/crm/inbox", permission: "inbox:read" },
  { href: "/crm/outreach", permission: "outreach:read" },
  { href: "/crm/settings", permission: "settings:read" },
];

export function crmLandingRoute(
  hasAccess: (permission: string) => boolean,
  opts?: { canViewCrmRevenue?: boolean; workspace?: CrmWorkspace },
): string {
  const home = ROLE_HOMES.find(
    (h) =>
      hasAccess(h.permission) &&
      !(opts?.workspace && isCrmPathHiddenForWorkspace(h.href, opts.workspace)),
  );
  // The workspace dashboards are lead-centric — roles without lead access (Legal, Property
  // Approval Team) go straight to their own work screen instead.
  if (home && !hasAccess("leads:read")) return home.href;
  const dashboard = firstAccessibleWorkspaceHref(hasAccess, opts);
  if (dashboard) return dashboard;
  if (home) return home.href;
  // No CRM screen at all — only then is "access denied" the honest answer.
  return "/unauthorized?module=crm";
}

/** Paths that are "take me home" entry points rather than a specific screen the user asked for. */
export function isCrmEntryPath(pathname: string): boolean {
  const p = String(pathname || "").split("?")[0].replace(/\/+$/, "");
  return p === "" || p === "/crm" || p === "/crm/workspace";
}
