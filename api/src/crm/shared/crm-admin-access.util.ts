import { isHrmsManagementAdmin, isPlatformTechServicesAdmin } from '../../auth/hrms-management-admin.util';
import { isPlatformSuperAdminUser } from '../../auth/platform-super-admin.util';

/** Deal amounts / annual revenue / pipeline money — ceo@mathionix.com only. */
export function canViewCrmRevenue(
  user: { email?: unknown } | null | undefined,
): boolean {
  return isPlatformSuperAdminUser(user);
}

/** Scalar financial fields stripped from CRM API payloads for non–super-admins. */
export const CRM_REVENUE_SCALAR_KEYS = [
  'dealValue',
  'expectedDealValue',
  'dealValueINR',
  'dealValueUSD',
  'annualRevenue',
  'pipelineValue',
  'grossValueINR',
  'weightedValueINR',
  'weightedValue',
  'grossValue',
  'forecastedRevenue',
  'revenue',
  'amount',
  'totalInvested',
  'totalReturned',
  'netReturn',
  'roiPercent',
  'invested',
  'returned',
  'resourceDailyRate',
  'monthlyGross',
  'dailyRate',
  'independentInvested',
  'dealLinkedInvested',
  'salaryInvested',
  'profit',
  'spent',
] as const;

function isPlainObject(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function stripCrmRevenueFields<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;

  // If it's a Mongoose document, convert to a plain object first
  if (typeof (value as any).toObject === 'function') {
    value = (value as any).toObject();
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripCrmRevenueFields(item)) as unknown as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const key of CRM_REVENUE_SCALAR_KEYS) {
    if (key in out) delete out[key];
  }
  for (const [k, v] of Object.entries(out)) {
    if (v != null && typeof v === 'object') {
      out[k] = stripCrmRevenueFields(v);
    }
  }
  return out as unknown as T;
}

export function redactCrmRevenueForUser<T>(
  user: { email?: unknown } | null | undefined,
  payload: T,
): T {
  if (canViewCrmRevenue(user)) return payload;
  return stripCrmRevenueFields(payload);
}

/** Normalize role name / populated role doc to comparable key (ADMIN, SUPERADMIN, …). */
export function normalizeCrmRoleKey(value: unknown): string {
  if (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'name' in value
  ) {
    return normalizeCrmRoleKey((value as { name?: unknown }).name);
  }
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, '');
}

const CRM_MANAGEMENT_ROLE_KEYS = new Set([
  'ADMIN',
  'ADMINISTRATOR',
  'SUPERADMIN',
  'SUPERADMINISTRATOR',
  'OWNER',
  'SUBADMIN',
  'CRMADMIN',
  'CEO',
  'CTO',
  'MANAGER',
  'EXECUTIVE',
  'SENIORMEMBER',
  'DIRECTOR',
]);

export function isCrmManagementRoleKey(key: string): boolean {
  return CRM_MANAGEMENT_ROLE_KEYS.has(key);
}

export function jwtCrmPermissionSet(user?: any): Set<string> {
  const crm = Array.isArray(user?.crmPermissions) ? user.crmPermissions : [];
  const hrms = Array.isArray(user?.permissions) ? user.permissions : [];
  return new Set(
    [...crm, ...hrms].map((p) => String(p || '').trim()).filter(Boolean),
  );
}

/** JWT / HRMS session — management role or explicit admin permission. */
export function hasCrmAdminJwtBypass(user?: any): boolean {
  if (!user) return false;
  if (isHrmsManagementAdmin(user)) return true;
  const perms = jwtCrmPermissionSet(user);
  if (perms.has('admin:manage')) return true;
  const roleKey = normalizeCrmRoleKey(user.role);
  return isCrmManagementRoleKey(roleKey);
}

function permissionNamesFromDbUser(dbUser?: any): string[] {
  if (!dbUser) return [];
  const userRole = dbUser.roleId;
  const fromRole =
    userRole?.permissions
      ?.map((p: any) =>
        typeof p === 'string' ? p : p?.name || p?.key || '',
      )
      .filter(Boolean) || [];
  const direct = Array.isArray(dbUser.permissions) ? dbUser.permissions : [];
  return [...fromRole, ...direct].map((p) => String(p).trim());
}

/** CRM Users collection record (roleId populated or legacy `role` string). */
export function hasCrmAdminFromDbUser(dbUser?: any): boolean {
  if (!dbUser) return false;
  const userRole = dbUser.roleId;
  const roleKey = normalizeCrmRoleKey(userRole || dbUser.role);
  const legacyKey = normalizeCrmRoleKey(dbUser.role);
  if (isCrmManagementRoleKey(roleKey) || isCrmManagementRoleKey(legacyKey)) {
    return true;
  }
  const names = permissionNamesFromDbUser(dbUser);
  return names.includes('admin:manage');
}

/**
 * Full CRM data scope (edit any lead/deal/contact) — aligns with RbacGuard admin override.
 * Pass `user.crmDbUser` when set by RbacGuard after CRM user lookup.
 */
export function hasCrmFullDataAccess(user?: any): boolean {
  if (!user) return false;
  if (hasCrmAdminJwtBypass(user)) return true;
  if (hasCrmAdminFromDbUser(user.crmDbUser)) return true;
  const perms = jwtCrmPermissionSet(user);
  return (
    perms.has('leads:read:all') ||
    perms.has('deals:read:all') ||
    perms.has('contacts:read:all')
  );
}

const CRM_TOP_ADMIN_ROLE_KEYS = new Set([
  'ADMIN',
  'ADMINISTRATOR',
  'SUPERADMIN',
  'SUPERADMINISTRATOR',
  'OWNER',
  'CEO',
  'CTO',
]);

/** Revenue forecast and other executive-only CRM analytics. */
export function isCrmTopAdmin(user?: any, crmDbUser?: any): boolean {
  if (isPlatformSuperAdminUser(user)) return true;
  if (isPlatformTechServicesAdmin(user)) return true;
  const db = crmDbUser ?? user?.crmDbUser;
  if (db) {
    const roleKey = normalizeCrmRoleKey(
      (db as { roleId?: unknown }).roleId || (db as { role?: unknown }).role,
    );
    if (CRM_TOP_ADMIN_ROLE_KEYS.has(roleKey)) return true;
  }
  const jwtRoleKey = normalizeCrmRoleKey(user?.role);
  return CRM_TOP_ADMIN_ROLE_KEYS.has(jwtRoleKey);
}
