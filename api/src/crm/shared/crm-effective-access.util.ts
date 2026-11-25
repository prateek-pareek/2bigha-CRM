import { applyPlatformSuperAdminPrivileges } from '../../auth/platform-super-admin.util';
import { getEffectiveHrmsPermissions } from '../../auth/hrms-permissions.util';
import { permissionsSatisfyAny } from '../crm-users/permission-actions.util';
import {
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from './crm-admin-access.util';
import { crmPermissionNamesFromRole } from './crm-role-permissions.util';
import {
  CRM_ROLE_MODULE_ALL,
  type CrmRoleModule,
  type CrmWorkspaceModule,
  resolveRoleModule,
} from './crm-workspace-module.util';

/**
 * Effective CRM grants for a user — the single implementation shared by `RbacGuard`
 * (the caller) and the assignment policy (a prospective assignee), so "who may open
 * Leads" and "who may be handed a lead" can never drift apart.
 *
 * @param user   JWT-shaped user (`req.user`) — HRMS `role`, `permissions`, `crmPermissions`, `permittedTools`.
 * @param dbUser CRM `users` doc with `roleId` populated (as `CRMUsersService.findOne` returns it).
 * @returns `all` — every grant the guard checks against; `published` — what the guard
 *          writes back to `req.user.crmPermissions` for services' tier checks.
 */
export function crmEffectivePermissions(
  user: any,
  dbUser: any,
): { all: string[]; published: string[] } {
  const userRole = dbUser?.roleId;
  // Populated role doc (an unpopulated ObjectId has neither field).
  const hasCrmRole = !!(
    userRole &&
    typeof userRole === 'object' &&
    ('permissions' in userRole || 'name' in userRole)
  );
  const dbRolePermissions: string[] =
    hasCrmRole && userRole.isActive !== false
      ? crmPermissionNamesFromRole(userRole)
      : [];
  const dbDirectPermissions: string[] = Array.isArray(dbUser?.permissions)
    ? dbUser.permissions
    : [];

  const jwtCrm: string[] = Array.isArray(user?.crmPermissions)
    ? user.crmPermissions
    : [];
  const jwtHrms: string[] = Array.isArray(user?.permissions)
    ? user.permissions
    : [];

  // Legacy fallback for CRM users WITHOUT a CRM role only. A user holding a functional
  // role (Team Lead, Legal Executive, …) gets exactly that role's grants — the old
  // "everyone with the CRM tool is an agent" default also handed out leads/contacts
  // export and lead access to Legal.
  const isAgent =
    !hasCrmRole &&
    (String(user?.role || '').toUpperCase() === 'AGENT' ||
      String(user?.role || '')
        .toLowerCase()
        .includes('agent') ||
      String(dbUser?.role || '')
        .toLowerCase()
        .includes('agent') ||
      String(userRole?.name || '')
        .toLowerCase()
        .includes('agent') ||
      (Array.isArray(user?.permittedTools) &&
        user.permittedTools
          .map((t: string) => String(t || '').toUpperCase())
          .includes('CRM')));

  const defaultAgentPerms = isAgent
    ? [
        'leads:read',
        'leads:write',
        'leads:import',
        'leads:export',
        'leads:move_pipeline',
        'contacts:read',
        'contacts:write',
        'contacts:import',
        'contacts:export',
        'pm-leads:read',
        'pm-leads:write',
        'pm-leads:import',
        'pm-leads:export',
      ]
    : [];

  return {
    all: Array.from(
      new Set([
        ...dbRolePermissions,
        ...jwtHrms,
        ...jwtCrm,
        ...dbDirectPermissions,
        ...defaultAgentPerms,
      ]),
    ),
    published: Array.from(
      new Set([
        ...jwtCrm,
        ...dbRolePermissions,
        ...dbDirectPermissions,
        ...defaultAgentPerms,
      ]),
    ),
  };
}

/** Same grants `GET /crm/leads` and `GET /crm/leads/:id` require (`@Permissions`). */
export const CRM_LEAD_ACCESS_PERMISSIONS = ['leads:read', 'pm-leads:read'];

export type CrmLeadAccess = {
  canAccess: boolean;
  /** Workspace of the person's CRM role ('ALL' = every workspace). */
  workspace: CrmRoleModule;
  /** Why access is denied — shown to the assigner. */
  reason?: string;
};

/**
 * JWT-shaped user rebuilt from a raw HRMS `users` doc (roleId populated), exactly as
 * `JwtStrategy.validate` builds `req.user` — so the access check sees what the guard would.
 */
export function jwtLikeUserFromHrmsDoc(hrms: any): any {
  if (!hrms) return null;
  return applyPlatformSuperAdminPrivileges({
    _id: String(hrms._id),
    userId: String(hrms._id),
    email: hrms.email,
    firstName: hrms.firstName,
    lastName: hrms.lastName,
    role: hrms.role,
    permittedTools: hrms.permittedTools || [],
    permissions: getEffectiveHrmsPermissions(hrms),
    crmPermissions: hrms.crmPermissions || [],
  });
}

/**
 * Could this person open the Leads module right now? Mirrors `RbacGuard.canActivate`
 * for `@Permissions('leads:read', 'pm-leads:read')`:
 * admin bypass → yes; no CRM account / pending / revoked / inactive → no; otherwise the
 * effective grants must include lead read access.
 *
 * @param hrms   raw HRMS `users` doc (roleId populated) — or null when unknown.
 * @param dbUser CRM `users` doc for the same email (roleId + permissions populated) — or null.
 */
export function crmLeadAccessFor(hrms: any, dbUser: any): CrmLeadAccess {
  const user = jwtLikeUserFromHrmsDoc(hrms);
  const workspace = resolveRoleModule(dbUser);
  if (!user) {
    return { canAccess: false, workspace, reason: 'is not an active employee' };
  }
  if (hrms?.isActive === false) {
    return { canAccess: false, workspace, reason: 'is not an active employee' };
  }
  if (hasCrmAdminJwtBypass(user) || hasCrmAdminFromDbUser(dbUser)) {
    return { canAccess: true, workspace };
  }
  if (!dbUser) {
    return {
      canAccess: false,
      workspace,
      reason: 'has not been given CRM access',
    };
  }
  const status = String(dbUser.provisioningStatus || '');
  if (
    status === 'pending_access' ||
    status === 'revoked' ||
    status === 'hidden'
  ) {
    return {
      canAccess: false,
      workspace,
      reason: 'has CRM access pending or revoked',
    };
  }
  if (!dbUser.isActive) {
    return { canAccess: false, workspace, reason: 'is inactive in the CRM' };
  }
  const { all } = crmEffectivePermissions(user, dbUser);
  if (!permissionsSatisfyAny(all, CRM_LEAD_ACCESS_PERMISSIONS)) {
    return {
      canAccess: false,
      workspace,
      reason: "doesn't have access to Leads",
    };
  }
  return { canAccess: true, workspace };
}

/** Does a role scoped to `workspace` see leads of `leadWorkspace`? (mirror of `roleAllowsLead`). */
export function workspaceSeesLeads(
  workspace: CrmRoleModule,
  leadWorkspace: CrmWorkspaceModule,
): boolean {
  return workspace === CRM_ROLE_MODULE_ALL || workspace === leadWorkspace;
}
