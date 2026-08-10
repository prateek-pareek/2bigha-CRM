/** Built-in platform owner — always full super-admin access regardless of stored role. */
export const PLATFORM_SUPER_ADMIN_EMAIL = 'ceo@mathionix.com';

export function normalizePlatformEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

export function isPlatformSuperAdminEmail(email: unknown): boolean {
  return normalizePlatformEmail(email) === PLATFORM_SUPER_ADMIN_EMAIL;
}

export function isPlatformSuperAdminUser(
  user: { email?: unknown } | null | undefined,
): boolean {
  return isPlatformSuperAdminEmail(user?.email);
}

function roleLabel(user: { role?: unknown }): string {
  const r = user?.role;
  if (r != null && typeof r === 'object' && 'name' in (r as object)) {
    return String((r as { name?: string }).name ?? '');
  }
  return String(r ?? '');
}

/** Platform data export/import — Admin role or built-in super-admin email. */
export function isStrictPlatformAdmin(
  user: { email?: unknown; role?: unknown } | null | undefined,
): boolean {
  if (!user) return false;
  if (isPlatformSuperAdminUser(user)) return true;
  return roleLabel(user).trim().toLowerCase() === 'admin';
}

export const PLATFORM_SUPER_ADMIN_DEFAULTS = {
  role: 'Admin',
  permissions: ['all'],
  permittedTools: ['HRMS', 'CRM', 'PM', 'SOCIAL', 'VAULT'],
} as const;

export function applyPlatformSuperAdminPrivileges<
  T extends Record<string, unknown>,
>(user: T): T {
  if (!isPlatformSuperAdminUser(user)) return user;
  return {
    ...user,
    role: PLATFORM_SUPER_ADMIN_DEFAULTS.role,
    permissions: [...PLATFORM_SUPER_ADMIN_DEFAULTS.permissions],
    permittedTools: [...PLATFORM_SUPER_ADMIN_DEFAULTS.permittedTools],
  };
}
