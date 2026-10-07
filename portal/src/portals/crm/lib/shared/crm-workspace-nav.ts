/**
 * Workspace-specific lead lists (requirement doc §8 — RBAC & Data Isolation):
 *   2Bigha roles        → Leads (/crm/leads) only
 *   PROPERTY_MGMT roles → PM Leads (/crm/pm/leads) only
 *   LEGAL roles         → neither (they work in Legal Cases)
 *   Super Admin (ALL)   → both
 *
 * The API enforces the same split (`leadModuleFilter` / `roleAllowsLead` in
 * api/src/crm/shared/crm-workspace-module.util.ts); this only keeps the navigation honest.
 * The workspace comes from `user.crmRole.workspaceModule` (attached by /auth/me).
 */
export type CrmWorkspace = "2Bigha" | "PROPERTY_MGMT" | "LEGAL" | "ALL";

const WORKSPACES: readonly CrmWorkspace[] = ["2Bigha", "PROPERTY_MGMT", "LEGAL", "ALL"];

export function crmWorkspaceOf(user: unknown): CrmWorkspace {
  const ws = (user as { crmRole?: { workspaceModule?: string } } | null)?.crmRole?.workspaceModule;
  return WORKSPACES.includes(ws as CrmWorkspace) ? (ws as CrmWorkspace) : "ALL";
}

/** Lead list pages that belong to another workspace (exact list routes; record pages are API-guarded). */
const HIDDEN_LIST_PAGES: Record<CrmWorkspace, readonly string[]> = {
  "2Bigha": ["/crm/pm/leads"],
  PROPERTY_MGMT: ["/crm/leads", "/crm/leads/intent"],
  LEGAL: ["/crm/leads", "/crm/leads/intent", "/crm/pm/leads"],
  ALL: [],
};

export function isCrmPathHiddenForWorkspace(href: string, workspace: CrmWorkspace): boolean {
  const path = String(href || "").split("?")[0].replace(/\/+$/, "");
  return HIDDEN_LIST_PAGES[workspace].includes(path);
}

/** The lead list a workspace works in (where a hidden list page redirects to). */
export function workspaceLeadListHref(workspace: CrmWorkspace): string | null {
  if (workspace === "PROPERTY_MGMT") return "/crm/pm/leads";
  if (workspace === "LEGAL") return null;
  return "/crm/leads";
}
