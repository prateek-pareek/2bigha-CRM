import { isPlatformSuperAdminUser } from './platform-super-admin.util';

/** CEO dashboard access — not the same as broad HRMS management admin. */
export function hasExecutiveDashboardAccess(user: any): boolean {
  if (!user) return false;
  if (isPlatformSuperAdminUser(user)) return true;

  const role = user.role;
  const raw =
    typeof role === 'object' && role != null && 'name' in role
      ? (role as { name?: string }).name
      : role;
  const roleKey = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (roleKey === 'CEO') return true;

  const tools = Array.isArray(user.permittedTools) ? user.permittedTools : [];
  return tools.some(
    (t: string) => String(t || '').trim().toUpperCase() === 'EXECUTIVE',
  );
}
