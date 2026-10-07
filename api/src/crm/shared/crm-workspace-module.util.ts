/**
 * The three workspace boundaries records/roles can belong to. "PROPERTY_MGMT" is the
 * Property Management workspace from the RBAC requirement doc — distinct from the
 * existing Jira-style Project Management suite (`pmPermissions`/`pmProjects` on User).
 */
export const CRM_WORKSPACE_MODULES = ['2Bigha', 'PROPERTY_MGMT', 'LEGAL'] as const;

export type CrmWorkspaceModule = (typeof CRM_WORKSPACE_MODULES)[number];

/** Roles scoped to every workspace (e.g. Super Admin) use this instead of a single module. */
export const CRM_ROLE_MODULE_ALL = 'ALL' as const;

export type CrmRoleModule = CrmWorkspaceModule | typeof CRM_ROLE_MODULE_ALL;

export const CRM_ROLE_MODULES = [...CRM_WORKSPACE_MODULES, CRM_ROLE_MODULE_ALL] as const;

export const DEFAULT_LEAD_WORKSPACE_MODULE: CrmWorkspaceModule = '2Bigha';

/**
 * Reads the caller's workspace scope off the populated `dbUser.roleId.workspaceModule`.
 * `dbUser` is the live `CRMUser` doc (`request.crmDbUser`, set by `RbacGuard` — the
 * actual account a login resolves to). Defaults to 'ALL' (unrestricted).
 */
export function resolveRoleModule(dbUser?: any): CrmRoleModule {
  const role = dbUser?.roleId;
  const workspaceModule = typeof role === 'object' ? role?.workspaceModule : undefined;
  return CRM_ROLE_MODULES.includes(workspaceModule) ? workspaceModule : CRM_ROLE_MODULE_ALL;
}

/** PM leads are the property-management vertical (/crm/pm/leads). */
export const PM_LEAD_VERTICAL = 'property_management';

/**
 * Which workspace a lead belongs to. PROPERTY_MGMT = a PM lead (tagged PROPERTY_MGMT or in
 * the property-management vertical); LEGAL = tagged LEGAL; everything else is a 2Bigha lead
 * (incl. older rows with no `module`).
 */
export function leadWorkspace(lead?: { module?: unknown; leadVertical?: unknown } | null): CrmWorkspaceModule {
  if (lead?.module === 'PROPERTY_MGMT' || lead?.leadVertical === PM_LEAD_VERTICAL) return 'PROPERTY_MGMT';
  if (lead?.module === 'LEGAL') return 'LEGAL';
  return '2Bigha';
}

/**
 * Mongo filter restricting a Lead list query to the caller's workspace (mirror of
 * `leadWorkspace`): PM roles see only PM leads, 2Bigha roles only 2Bigha leads.
 * `{}` (no restriction) when the role is scoped to 'ALL'.
 */
export function leadModuleFilter(dbUser: any): Record<string, unknown> {
  const roleModule = resolveRoleModule(dbUser);
  if (roleModule === CRM_ROLE_MODULE_ALL) return {};
  if (roleModule === 'PROPERTY_MGMT') {
    return { $or: [{ module: 'PROPERTY_MGMT' }, { leadVertical: PM_LEAD_VERTICAL }] };
  }
  if (roleModule === 'LEGAL') {
    return { module: 'LEGAL', leadVertical: { $ne: PM_LEAD_VERTICAL } };
  }
  return { module: { $nin: ['PROPERTY_MGMT', 'LEGAL'] }, leadVertical: { $ne: PM_LEAD_VERTICAL } };
}

/** True when the caller's role may touch this lead (workspace from `leadWorkspace`). */
export function roleAllowsLead(
  dbUser: any,
  lead?: { module?: unknown; leadVertical?: unknown } | null,
): boolean {
  const roleModule = resolveRoleModule(dbUser);
  return roleModule === CRM_ROLE_MODULE_ALL || leadWorkspace(lead) === roleModule;
}

/**
 * Workspace + vertical a new lead gets: a workspace-scoped role always creates leads in its
 * own workspace (a PM agent cannot create a 2Bigha lead and vice versa); Super Admin keeps
 * what it chose, with the vertical deciding PM vs 2Bigha.
 */
export function workspaceForNewLead(
  dbUser: any,
  requested: { module?: unknown; leadVertical?: unknown },
): { module: CrmWorkspaceModule; leadVertical?: string } {
  const roleModule = resolveRoleModule(dbUser);
  if (roleModule === 'PROPERTY_MGMT') return { module: 'PROPERTY_MGMT', leadVertical: PM_LEAD_VERTICAL };
  if (roleModule === '2Bigha') return { module: '2Bigha', leadVertical: 'property_listing' };
  if (roleModule === 'LEGAL') return { module: 'LEGAL' };
  if (requested.leadVertical === PM_LEAD_VERTICAL) return { module: 'PROPERTY_MGMT', leadVertical: PM_LEAD_VERTICAL };
  const valid = CRM_WORKSPACE_MODULES.includes(requested.module as CrmWorkspaceModule);
  return { module: valid ? (requested.module as CrmWorkspaceModule) : DEFAULT_LEAD_WORKSPACE_MODULE };
}

/** True when the caller's role module allows touching a record tagged with `recordModule`. */
export function roleAllowsModule(dbUser: any, recordModule?: string): boolean {
  const roleModule = resolveRoleModule(dbUser);
  if (roleModule === CRM_ROLE_MODULE_ALL) return true;
  return !recordModule || recordModule === roleModule;
}

/** True when the caller's role is scoped to (or 'ALL', spanning) the given workspace — for whole-module gating (e.g. Legal). */
export function roleBelongsToWorkspace(dbUser: any, workspace: CrmWorkspaceModule): boolean {
  const roleModule = resolveRoleModule(dbUser);
  return roleModule === CRM_ROLE_MODULE_ALL || roleModule === workspace;
}
