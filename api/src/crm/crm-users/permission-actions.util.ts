/**
 * Backend mirror of portal `src/common/lib/permissions/access.ts` action model.
 *
 * Single source of truth for how a granted permission satisfies a required one,
 * so the CRM RbacGuard and the portal agree on the §13.2 action set
 * (view / create / edit / delete / export / assign):
 *
 *   - `module:write` is the "Create" grant and IMPLIES read/create/edit/approve.
 *   - `delete`, `export`, `import`, `assign` are sensitive and require an
 *     EXPLICIT grant (never implied by `write`; admins bypass separately).
 *     `assign` (reassign/transfer ownership) is a distinct §13.2 action, so a
 *     plain writer cannot transfer records — only a role granted `:assign`
 *     (Team Lead / Manager) can, matching the ownership-transfer tier check.
 *   - a bare `module` token grants read only.
 *
 * Keep WRITE_IMPLIES_ACTIONS / WRITE_DOES_NOT_IMPLY in sync with access.ts.
 */
export const WRITE_IMPLIES_ACTIONS = new Set([
  'read',
  'create',
  'edit',
  'approve',
]);

export const WRITE_DOES_NOT_IMPLY = new Set([
  'delete',
  'export',
  'import',
  'assign',
]);

/**
 * True when the user's permission list satisfies a single required permission,
 * honouring the action-implication model above.
 */
export function permissionSatisfies(
  userPermissions: string[],
  required: string,
): boolean {
  const key = String(required || '').trim();
  if (!key) return false;
  if (userPermissions.includes('all')) return true;
  if (userPermissions.includes(key)) return true;

  const colon = key.lastIndexOf(':');
  if (colon <= 0) {
    // Bare module id (e.g. "leads") — a matching module:* grant implies read only.
    return userPermissions.some(
      (p) => p === key || p.startsWith(`${key}:`),
    );
  }

  const moduleId = key.slice(0, colon);
  const action = key.slice(colon + 1);
  const writeKey = `${moduleId}:write`;

  // Sensitive actions must be granted explicitly (already checked exact above).
  if (WRITE_DOES_NOT_IMPLY.has(action)) {
    return false;
  }

  // `read` is satisfied by any grant on the module.
  if (action === 'read') {
    return userPermissions.some(
      (p) => p === moduleId || p.startsWith(`${moduleId}:`),
    );
  }

  // create / edit / approve / assign are implied by write.
  if (WRITE_IMPLIES_ACTIONS.has(action) && userPermissions.includes(writeKey)) {
    return true;
  }

  return false;
}

/**
 * True when the user's permissions satisfy AT LEAST ONE of the required
 * permissions (matches the @Permissions decorator's OR semantics).
 */
export function permissionsSatisfyAny(
  userPermissions: string[],
  required: string[],
): boolean {
  return required.some((r) => permissionSatisfies(userPermissions, r));
}
