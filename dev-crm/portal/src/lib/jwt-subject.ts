/**
 * Reads JWT `sub` (HRMS user id) from browser tokens — same claim CRM/API use for `req.user.userId`.
 * Use for Socket.IO `join-room` so it matches `notification.recipient`.
 */
export function getJwtSubjectFromBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('pm_token') ||
    '';
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as { sub?: string };
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}
