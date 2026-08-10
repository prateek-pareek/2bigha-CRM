import { isPlatformSuperAdminUser } from './platform-super-admin.util';

/**
 * True for HRMS “management” roles that should bypass granular CRM/Social
 * permission checks where the portal already treats them as full access.
 * Aligns with `portal/src/lib/hrms/auth.ts` `isAdmin` (role string or `{ name }`).
 */
export function isHrmsManagementAdmin(user: any): boolean {
  if (!user) return false;
  if (isPlatformSuperAdminUser(user)) return true;
  const role = user.role;
  const raw =
    typeof role === 'object' && role != null && 'name' in role
      ? (role as { name?: string }).name
      : role;
  const keyUnderscore = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const keyCompact = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, '');
  const adminRoles = new Set([
    'ADMIN',
    'CEO',
    'CTO',
    'MANAGER',
    'EXECUTIVE',
    'SENIOR_MEMBER',
    'ADMINISTRATOR',
    'ADMINISTRATION',
    'SUPERADMIN',
    'SUPER_ADMIN',
    'SUPERADMINISTRATOR',
    'SUPER_ADMINISTRATOR',
    'OWNER',
    'SUBADMIN',
    'SUB_ADMIN',
    'DIRECTOR',
    'CRMADMIN',
    'CRM_ADMIN',
    'HR',
    'HR_MANAGER',
  ]);
  return adminRoles.has(keyUnderscore) || adminRoles.has(keyCompact);
}

/** Platform infrastructure (Redis health) — not HR staff with employees:edit / hrms:admin. */
export function isPlatformTechServicesAdmin(user: any): boolean {
  if (!user) return false;
  if (isPlatformSuperAdminUser(user)) return true;
  const role = user.role;
  const raw =
    typeof role === 'object' && role != null && 'name' in role
      ? (role as { name?: string }).name
      : role;
  const key = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const platformRoles = new Set([
    'ADMIN',
    'ADMINISTRATOR',
    'SUPERADMIN',
    'SUPER_ADMIN',
    'OWNER',
    'CEO',
    'CTO',
  ]);
  return platformRoles.has(key);
}
