import { ForbiddenException } from '@nestjs/common';
import {
  hasCrmFullDataAccess,
  jwtCrmPermissionSet,
} from './crm-admin-access.util';

/** @deprecated Use `jwtCrmPermissionSet` — kept for existing imports. */
export const jwtCrmPermSet = jwtCrmPermissionSet;
export { jwtCrmPermissionSet };

/**
 * If the user lacks `writePerm` but has `movePerm`, only keys in `allowedKeys` may appear in `patchKeys`.
 * Users with `writePerm` are unrestricted here (route still requires write OR move).
 */
export function assertCrmPipelineScopedUpdate(
  user: any,
  opts: {
    writePerm: string;
    movePerm: string;
    allowedKeys: Set<string>;
    patchKeys: Set<string>;
  },
): void {
  if (!user) return;
  if (hasCrmFullDataAccess(user)) {
    return;
  }
  const perms = jwtCrmPermSet(user);
  if (perms.has(opts.writePerm)) return;
  if (!perms.has(opts.movePerm)) {
    throw new ForbiddenException('Insufficient permissions');
  }
  for (const k of opts.patchKeys) {
    if (!opts.allowedKeys.has(k)) {
      throw new ForbiddenException(
        `You only have permission to change: ${[...opts.allowedKeys].join(', ')}.`,
      );
    }
  }
}
