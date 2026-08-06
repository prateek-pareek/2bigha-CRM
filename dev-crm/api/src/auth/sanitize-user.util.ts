/**
 * Credential fields that must never be exposed in API responses.
 *
 * Note: internal fields such as `tokenVersion` / `accessVersion` are
 * intentionally kept, since the frontend polls `/auth/me` and compares these
 * values to detect permission/security changes and prompt a refresh.
 */
const SENSITIVE_USER_FIELDS = ['password', 'passwordHash'] as const;

/**
 * Strips password and other sensitive/internal fields from a user object
 * before returning it to the client.
 */
export function sanitizeUser<T>(user: T): T {
  if (!user || typeof user !== 'object') return user;
  const plain: Record<string, unknown> =
    typeof (user as any).toObject === 'function'
      ? (user as any).toObject()
      : { ...(user as Record<string, unknown>) };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete plain[field];
  }
  return plain as T;
}
