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

/**
 * Mongo filter restricting a Lead/case list query to the caller's workspace.
 * `{}` (no restriction) when the role is scoped to 'ALL'.
 */
export function leadModuleFilter(dbUser: any): Record<string, unknown> {
  const roleModule = resolveRoleModule(dbUser);
  return roleModule === CRM_ROLE_MODULE_ALL ? {} : { module: roleModule };
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
