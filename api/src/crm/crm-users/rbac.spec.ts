/**
 * End-to-end RBAC enforcement tests (§13.2 action model + §13.3 scope tiers).
 *
 * Drives the REAL RbacGuard and the REAL permission-actions util against the
 * exact permission sets the seed grants each role, so the allow/deny matrix
 * asserted here is the one that ships. No DB required — the CRM user lookup is
 * stubbed to return a role doc exactly as `findOne(...).populate('roleId')`
 * would.
 */
import { ForbiddenException } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';
import {
  permissionSatisfies,
  permissionsSatisfyAny,
} from './permission-actions.util';

// --- Seeded role permission sets (mirror of src/seed-crm-roles.ts) ----------
const modulePerms = (mods: string[], actions: string[]) =>
  mods.flatMap((m) => actions.map((a) => `${m}:${a}`));

const AGENT_PERMS = [
  ...modulePerms(
    ['leads', 'contacts', 'clients', 'activities', 'inbox', 'proposals'],
    ['read', 'write', 'edit'],
  ),
  'workspace-agent:read',
  'organizations:read',
];

const TEAM_LEAD_PERMS = [
  ...modulePerms(
    ['leads', 'contacts', 'clients', 'organizations', 'activities', 'inbox'],
    ['read', 'write', 'edit', 'delete'],
  ),
  'workspace-team:read',
  'leads:read:team',
  'clients:read:team',
  'contacts:read:team',
  'leads:move_pipeline',
  'leads:assign',
  'leads:export',
];

// --- Guard harness -----------------------------------------------------------
function makeGuard(dbUser: any): RbacGuard {
  const reflector = { getAllAndOverride: () => undefined } as any;
  const usersService = { findOne: async () => dbUser } as any;
  return new RbacGuard(reflector, usersService);
}

function ctx(user: any, requiredPermissions?: string[]) {
  const request: any = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
    // The guard reads required perms via reflector; we override per-call below.
    __required: requiredPermissions,
  } as any;
}

function guardFor(role: string, perms: string[]) {
  const dbUser = {
    email: `${role.toLowerCase().replace(/\s/g, '')}@test.local`,
    role,
    isActive: true,
    provisioningStatus: 'manual',
    roleId: { permissions: perms.map((name) => ({ name })) },
    permissions: [],
  };
  const guard = makeGuard(dbUser);
  const user = {
    email: dbUser.email,
    role,
    crmPermissions: [],
    permissions: [],
  };
  return { guard, user, dbUser };
}

/** Run the real guard for one required-permission set; true = allowed. */
async function can(
  role: string,
  perms: string[],
  required: string[],
): Promise<boolean> {
  const { guard, user } = guardFor(role, perms);
  const reflector = (guard as any).reflector;
  reflector.getAllAndOverride = () => required;
  try {
    return await guard.canActivate(ctx(user));
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------
describe('§13.2 action-implication model (permission-actions.util)', () => {
  it('write implies read/create/edit/approve', () => {
    const p = ['leads:write'];
    for (const a of ['read', 'create', 'edit', 'approve']) {
      expect(permissionSatisfies(p, `leads:${a}`)).toBe(true);
    }
  });

  it('write does NOT imply delete/export/import/assign', () => {
    const p = ['leads:write'];
    for (const a of ['delete', 'export', 'import', 'assign']) {
      expect(permissionSatisfies(p, `leads:${a}`)).toBe(false);
    }
  });

  it('explicit sensitive grants are honoured', () => {
    expect(permissionSatisfies(['leads:export'], 'leads:export')).toBe(true);
    expect(permissionSatisfies(['leads:delete'], 'leads:delete')).toBe(true);
    expect(permissionSatisfies(['leads:assign'], 'leads:assign')).toBe(true);
    // write + explicit assign both present → can assign
    expect(
      permissionSatisfies(['leads:write', 'leads:assign'], 'leads:assign'),
    ).toBe(true);
  });

  it('a grant on module M never leaks to module N', () => {
    expect(permissionSatisfies(['leads:write'], 'contacts:edit')).toBe(false);
    expect(permissionSatisfies(['leads:export'], 'contacts:export')).toBe(false);
  });

  it('bare module token grants read only', () => {
    expect(permissionSatisfies(['leads'], 'leads:read')).toBe(true);
    expect(permissionSatisfies(['leads'], 'leads:edit')).toBe(false);
    expect(permissionSatisfies(['leads'], 'leads:delete')).toBe(false);
  });

  it('`all` and exact match short-circuit', () => {
    expect(permissionSatisfies(['all'], 'leads:delete')).toBe(true);
    expect(permissionsSatisfyAny(['x:y'], ['a:b', 'x:y'])).toBe(true);
  });
});

describe('§13.2 Agent role — real RbacGuard matrix', () => {
  const P = AGENT_PERMS;
  it('CAN view / create / edit leads', async () => {
    expect(await can('Agent', P, ['leads:read'])).toBe(true);
    expect(await can('Agent', P, ['leads:write'])).toBe(true); // create
    expect(await can('Agent', P, ['leads:edit'])).toBe(true);
  });
  it('CANNOT delete, export, or assign leads', async () => {
    expect(await can('Agent', P, ['leads:delete'])).toBe(false);
    expect(await can('Agent', P, ['leads:export'])).toBe(false);
    expect(await can('Agent', P, ['leads:assign'])).toBe(false);
  });
  it('CANNOT edit organizations (read-only grant)', async () => {
    expect(await can('Agent', P, ['organizations:read'])).toBe(true);
    expect(await can('Agent', P, ['organizations:edit'])).toBe(false);
  });
  it('CANNOT touch admin settings', async () => {
    expect(await can('Agent', P, ['settings:admin'])).toBe(false);
  });
});

describe('§13.2 Team Lead role — real RbacGuard matrix', () => {
  const P = TEAM_LEAD_PERMS;
  it('CAN view/create/edit/delete leads', async () => {
    for (const a of ['read', 'write', 'edit', 'delete']) {
      expect(await can('Team Lead', P, [`leads:${a}`])).toBe(true);
    }
  });
  it('CAN export and assign leads (explicit grants)', async () => {
    expect(await can('Team Lead', P, ['leads:export'])).toBe(true);
    expect(await can('Team Lead', P, ['leads:assign'])).toBe(true);
  });
  it('CANNOT export contacts (no contacts:export grant)', async () => {
    expect(await can('Team Lead', P, ['contacts:export'])).toBe(false);
  });
  it('CANNOT touch admin settings', async () => {
    expect(await can('Team Lead', P, ['settings:admin'])).toBe(false);
  });
});

describe('§13.1/13.3 management roles bypass (broad tier)', () => {
  it('Admin is allowed everything via management bypass', async () => {
    expect(await can('Admin', [], ['leads:delete'])).toBe(true);
    expect(await can('Admin', [], ['settings:admin'])).toBe(true);
  });
  it('Manager is allowed everything via management bypass', async () => {
    expect(await can('Manager', [], ['leads:export'])).toBe(true);
  });
});

describe('guard is a no-op when a route declares no @Permissions', () => {
  it('returns true when required perms are undefined', async () => {
    const { guard, user } = guardFor('Agent', AGENT_PERMS);
    (guard as any).reflector.getAllAndOverride = () => undefined;
    expect(await guard.canActivate(ctx(user))).toBe(true);
  });
});
