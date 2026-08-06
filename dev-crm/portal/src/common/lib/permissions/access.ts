import {
  GLOBAL_PERMISSION_KEYS,
  isKnownModuleId,
  isRegistryGatedPermission,
  parseModulePermissionKey,
  SOCIAL_PERMISSION_KEYS,
} from './registry';
import {
  hrmsPermissionListHasBenefitsAccess,
  hrmsPermissionListHasHrAdminAccess,
  hrmsPermissionListHasModuleAccess,
  hrmsPermissionListHasOverviewModuleAccess,
} from '@/lib/suite/auth';

const WRITE_IMPLIES_ACTIONS = new Set([
  'read',
  'create',
  'edit',
  'approve',
]);

/**
 * Sensitive CRM/HRMS actions that require an explicit grant.
 * `module:write` alone must NOT unlock these (admin bypasses via isAdmin).
 */
const WRITE_DOES_NOT_IMPLY = new Set(['delete', 'export', 'import']);

/** Whether a permission list grants a module:action (or bare module id). */
export function userPermissionsInclude(
  permissions: string[],
  required: string,
): boolean {
  const key = String(required || '').trim();
  if (!key) return false;
  if (permissions.includes('all')) return true;
  if (permissions.includes(key)) return true;

  const parsed = parseModulePermissionKey(key);
  if (parsed) {
    const { moduleId, action } = parsed;
    const writeKey = `${moduleId}:write`;
    if (WRITE_DOES_NOT_IMPLY.has(action)) {
      return permissions.includes(`${moduleId}:${action}`);
    }
    if (permissions.includes(writeKey)) return true;
    if (action === 'read') {
      return permissions.some(
        (p) => p === moduleId || p.startsWith(`${moduleId}:`),
      );
    }
    if (WRITE_IMPLIES_ACTIONS.has(action) && permissions.includes(writeKey)) {
      return true;
    }
    return permissions.includes(`${moduleId}:${action}`);
  }

  if (isKnownModuleId(key)) {
    return permissions.some((p) => p === key || p.startsWith(`${key}:`));
  }

  return false;
}

/**
 * Deny-by-default check for registry-known permissions.
 * Returns `not-gated` when callers should apply legacy rules.
 */
export function checkRegistryPermissionAccess(
  permissions: string[],
  required: string,
): boolean | 'not-gated' {
  const key = String(required || '').trim();
  if (!key) return 'not-gated';

  if (key === 'hrms:read') {
    return hrmsPermissionListHasModuleAccess(permissions);
  }
  if (key === 'hrms:admin') {
    return hrmsPermissionListHasHrAdminAccess(permissions);
  }
  if (key === 'benefits') {
    return hrmsPermissionListHasBenefitsAccess(permissions);
  }
  if (key === 'analytics' || key === 'reports' || key === 'notifications') {
    return hrmsPermissionListHasOverviewModuleAccess(permissions, key);
  }

  if (!isRegistryGatedPermission(key)) return 'not-gated';

  if (SOCIAL_PERMISSION_KEYS.includes(key as (typeof SOCIAL_PERMISSION_KEYS)[number])) {
    return userPermissionsInclude(permissions, key);
  }

  if (GLOBAL_PERMISSION_KEYS.has(key)) {
    return userPermissionsInclude(permissions, key);
  }

  return userPermissionsInclude(permissions, key);
}
