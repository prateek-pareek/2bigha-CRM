import { isHrmsManagementAdmin } from './hrms-management-admin.util';

export type HrmsModuleAction =
  | 'read'
  | 'create'
  | 'edit'
  | 'delete'
  | 'write'
  | 'export'
  | 'import'
  | 'approve';

/** Effective HRMS permission keys from user record + assigned custom role template. */
export function getEffectiveHrmsPermissions(user: any): string[] {
  if (!user) return [];
  const direct: string[] = Array.isArray(user.permissions)
    ? (user.permissions as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];
  const roleDoc = user.roleId;
  const fromRole: string[] =
    roleDoc &&
    typeof roleDoc === 'object' &&
    Array.isArray((roleDoc as { permissions?: unknown }).permissions)
      ? ((roleDoc as { permissions: unknown[] }).permissions || []).filter(
          (p): p is string => typeof p === 'string',
        )
      : [];

  if (!fromRole.length) return direct;
  if (user.useRoleOverrides === false) return [...new Set(fromRole)];
  return [...new Set([...fromRole, ...direct])];
}

export function userHasHrmsModuleAction(
  user: any,
  moduleKey: string,
  action: HrmsModuleAction,
): boolean {
  if (isHrmsManagementAdmin(user)) return true;
  const perms = getEffectiveHrmsPermissions(user);
  if (perms.includes(`${moduleKey}:write`)) return true;
  if (action === 'read') {
    return perms.some((p) => p === moduleKey || p.startsWith(`${moduleKey}:`));
  }
  return perms.includes(`${moduleKey}:${action}`);
}

/** Matches portal `hrmsPermissionListHasHrAdminAccess`. */
export function userHasHrmsAdminAccess(user: any): boolean {
  const perms = getEffectiveHrmsPermissions(user);
  if (perms.includes('hrms:admin')) return true;
  if (perms.some((p) => p.startsWith('hr-settings:'))) return true;
  return perms.includes('employees:edit') || perms.includes('employees:write');
}

/** Staff with HR admin / employees edit can manage custom role templates. */
export function userCanMutateCustomRoles(user: any): boolean {
  if (!user) return false;
  if (isHrmsManagementAdmin(user)) return true;
  const roleRaw =
    typeof user.role === 'object' && user.role != null
      ? (user.role as { name?: string }).name
      : user.role;
  const roleKey = String(roleRaw ?? '')
    .trim()
    .toLowerCase();
  if (roleKey === 'hr manager' || roleKey === 'hr') return true;

  return (
    userHasHrmsModuleAction(user, 'hr-settings', 'edit') ||
    userHasHrmsModuleAction(user, 'hr-settings', 'create') ||
    userHasHrmsModuleAction(user, 'hr-settings', 'write') ||
    userHasHrmsModuleAction(user, 'employees', 'edit') ||
    userHasHrmsModuleAction(user, 'employees', 'write') ||
    getEffectiveHrmsPermissions(user).includes('hrms:admin')
  );
}

export function userCanReadCustomRoles(user: any): boolean {
  if (!user) return false;
  if (userCanMutateCustomRoles(user)) return true;
  return userHasHrmsAdminAccess(user);
}
