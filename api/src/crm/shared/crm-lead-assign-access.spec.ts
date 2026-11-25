// Schemas use decorator metadata that ts-jest (isolatedModules) cannot emit — stub them.
jest.mock('../crm-users/schemas/user.schema', () => ({
  CRMUser: class CRMUser {},
}));
jest.mock('../../users/schemas/user.schema', () => ({ User: class User {} }));

import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CRM_ROLE_SEEDS } from './crm-role-catalog';
import { CrmAssignmentPolicyService } from './crm-assignment-policy.service';
import {
  crmEffectivePermissions,
  crmLeadAccessFor,
} from './crm-effective-access.util';

/**
 * "Block lead assignment to users without access": a lead may only be handed to someone
 * who could open it — same rule RbacGuard applies to `GET /crm/leads` — and whose role
 * workspace sees that lead (2Bigha vs Property Management).
 */

const seed = (key: string) => {
  const s = CRM_ROLE_SEEDS.find((r) => r.key === key);
  if (!s) throw new Error(`no seed ${key}`);
  return s;
};
const roleDoc = (key: string) => {
  const s = seed(key);
  return {
    _id: new Types.ObjectId(),
    name: s.name,
    workspaceModule: s.workspaceModule,
    crmPermissions: s.crmPermissions,
    permissions: [],
    isActive: true,
  };
};
const person = (
  first: string,
  email: string,
  extra: Record<string, unknown> = {},
) => ({
  _id: new Types.ObjectId(),
  firstName: first,
  lastName: 'Test',
  email,
  role: 'Employee',
  permittedTools: ['HRMS', 'CRM'],
  permissions: [],
  crmPermissions: [],
  isActive: true,
  ...extra,
});
const crmAccount = (
  email: string,
  key: string | null,
  extra: Record<string, unknown> = {},
) => ({
  email,
  isActive: true,
  role: 'user',
  roleId: key ? roleDoc(key) : undefined,
  permissions: [],
  ...extra,
});

describe('crmLeadAccessFor', () => {
  it('2Bigha / PM calling agents and team leads can open Leads', () => {
    for (const key of [
      '2bigha_calling_agent',
      '2bigha_team_lead',
      'pm_calling_agent',
      'pm_team_lead',
    ]) {
      const u = person('A', `${key}@x.test`);
      expect(crmLeadAccessFor(u, crmAccount(u.email, key)).canAccess).toBe(
        true,
      );
    }
  });

  it('roles without any Leads grant cannot (Legal Executive, Property Approval Team)', () => {
    for (const key of [
      'legal_executive',
      'legal_team_lead',
      '2bigha_property_approval',
    ]) {
      const u = person('B', `${key}@x.test`);
      const res = crmLeadAccessFor(u, crmAccount(u.email, key));
      expect(res).toMatchObject({ canAccess: false });
      expect(res.reason).toMatch(/access to Leads/);
    }
  });

  it('no CRM account, pending/revoked access, or inactive users are blocked', () => {
    const u = person('C', 'c@x.test');
    expect(crmLeadAccessFor(u, null).reason).toMatch(
      /not been given CRM access/,
    );
    expect(
      crmLeadAccessFor(
        u,
        crmAccount(u.email, '2bigha_calling_agent', {
          provisioningStatus: 'pending_access',
        }),
      ).canAccess,
    ).toBe(false);
    expect(
      crmLeadAccessFor(
        u,
        crmAccount(u.email, '2bigha_calling_agent', {
          provisioningStatus: 'revoked',
        }),
      ).canAccess,
    ).toBe(false);
    expect(
      crmLeadAccessFor(
        u,
        crmAccount(u.email, '2bigha_calling_agent', { isActive: false }),
      ).canAccess,
    ).toBe(false);
    expect(
      crmLeadAccessFor(
        { ...u, isActive: false },
        crmAccount(u.email, '2bigha_calling_agent'),
      ).canAccess,
    ).toBe(false);
  });

  it('CRM admins always can, even without a lead grant', () => {
    const u = person('D', 'd@x.test');
    expect(
      crmLeadAccessFor(u, crmAccount(u.email, 'super_admin')).canAccess,
    ).toBe(true);
    expect(crmLeadAccessFor({ ...u, role: 'Admin' }, null).canAccess).toBe(
      true,
    );
  });

  it('legacy CRM users without a role keep the old agent defaults', () => {
    const u = person('E', 'e@x.test');
    expect(crmLeadAccessFor(u, crmAccount(u.email, null)).canAccess).toBe(true);
    // …but not when they have no CRM tool at all
    const noTool = person('F', 'f@x.test', { permittedTools: ['HRMS'] });
    expect(
      crmLeadAccessFor(noTool, crmAccount(noTool.email, null)).canAccess,
    ).toBe(false);
  });

  it('reports the role workspace', () => {
    const u = person('G', 'g@x.test');
    expect(
      crmLeadAccessFor(u, crmAccount(u.email, 'pm_calling_agent')).workspace,
    ).toBe('PROPERTY_MGMT');
  });

  it('matches what RbacGuard publishes for the same user', () => {
    const u = person('H', 'h@x.test', { crmPermissions: ['contacts:read'] });
    const db = crmAccount(u.email, '2bigha_calling_agent');
    const { published } = crmEffectivePermissions(
      { ...u, permissions: [], crmPermissions: u.crmPermissions },
      db,
    );
    expect(published).toEqual(
      expect.arrayContaining(['contacts:read', 'leads:read', 'leads:write']),
    );
  });
});

describe('CrmAssignmentPolicyService — lead access on assignment', () => {
  const tl = person('Tara', 'tl@x.test');
  const agent = person('Ravi', 'ravi@x.test', { reportsTo: tl._id });
  const legal = person('Lena', 'lena@x.test', { reportsTo: tl._id });
  const pm = person('Pia', 'pia@x.test', { reportsTo: tl._id });
  const people = [tl, agent, legal, pm];
  const roleOf: Record<string, string> = {
    [tl.email]: '2bigha_team_lead',
    [agent.email]: '2bigha_calling_agent',
    [legal.email]: 'legal_executive',
    [pm.email]: 'pm_calling_agent',
  };

  const chain = (rows: any) => {
    const c: any = {
      select: () => c,
      sort: () => c,
      skip: () => c,
      limit: () => c,
      lean: () => c,
      populate: () => c,
      exec: async () => rows,
    };
    return c;
  };
  const hrms: any = {
    find: (f: any) => {
      if (f.reportsTo)
        return chain(
          people.filter(
            (p: any) => String(p.reportsTo || '') === String(f.reportsTo),
          ),
        );
      if (f.$and || f._id) {
        const ids: string[] = (f.$and?.[0]?._id?.$in || f._id?.$in || []).map(
          String,
        );
        return chain(people.filter((p) => ids.includes(String(p._id))));
      }
      return chain(people.filter((p) => f.firstName?.test(p.firstName)));
    },
    findById: (id: any) =>
      chain(people.find((p) => String(p._id) === String(id)) || null),
    findOne: (f: any) =>
      chain(people.find((p) => f.email.test(p.email)) || null),
    countDocuments: () => ({ exec: async () => people.length }),
  };
  const crm: any = {
    find: (f: any) => {
      const tests: RegExp[] = f.email?.$in || [];
      return chain(
        people
          .filter((p) => tests.some((rx) => rx.test(p.email)))
          .map((p) => crmAccount(p.email, roleOf[p.email])),
      );
    },
    findById: () => chain(null),
    findOne: () => chain(null),
  };
  const policy = new CrmAssignmentPolicyService(hrms, crm);
  const teamLead = {
    userId: String(tl._id),
    firstName: tl.firstName,
    lastName: tl.lastName,
    email: tl.email,
    crmPermissions: seed('2bigha_team_lead').crmPermissions,
    crmDbUser: crmAccount(tl.email, '2bigha_team_lead'),
  };

  it('a teammate with Leads access can be assigned', async () => {
    await expect(
      policy.assertAssignee('team', teamLead, String(agent._id), {
        requireLeadAccess: true,
        leadWorkspaces: ['2Bigha'],
      }),
    ).resolves.toMatchObject({ label: 'Ravi Test' });
  });

  it('a teammate without Leads access is rejected with a clear reason', async () => {
    await expect(
      policy.assertAssignee('team', teamLead, String(legal._id), {
        requireLeadAccess: true,
      }),
    ).rejects.toThrow(/Lena Test doesn't have access to Leads/);
  });

  it('a PM agent cannot be handed 2Bigha leads (workspace mismatch)', async () => {
    await expect(
      policy.assertAssignee('team', teamLead, String(pm._id), {
        requireLeadAccess: true,
        leadWorkspaces: ['2Bigha'],
      }),
    ).rejects.toThrow(
      /Property Management workspace and can't see 2Bigha leads/,
    );
    await expect(
      policy.assertAssignee('team', teamLead, String(pm._id), {
        requireLeadAccess: true,
        leadWorkspaces: ['PROPERTY_MGMT'],
      }),
    ).resolves.toBeTruthy();
  });

  it('without requireLeadAccess the old behaviour is unchanged (tasks / legal callers)', async () => {
    await expect(
      policy.assertAssignee('team', teamLead, String(legal._id)),
    ).resolves.toMatchObject({ label: 'Lena Test' });
  });

  it('Super Admin free-text legacy labels are still accepted (no user behind them)', async () => {
    await expect(
      policy.assertAssignee(
        'all',
        { crmPermissions: ['admin:manage'] },
        'Legacy Owner',
        { requireLeadAccess: true },
      ),
    ).resolves.toMatchObject({ hrmsId: null, label: 'Legacy Owner' });
  });

  it('the Reassign picker lists only people who can open Leads', async () => {
    const res = await policy.assignableUsers('leads', teamLead, {
      requireLeadAccess: true,
    });
    const names = res.items.map((u) => u.firstName).sort();
    expect(names).toEqual(['Pia', 'Ravi', 'Tara']);
    expect(res.total).toBe(3);
  });

  it('…and narrowed to a lead workspace when asked', async () => {
    const res = await policy.assignableUsers('leads', teamLead, {
      requireLeadAccess: true,
      leadWorkspace: '2Bigha',
    });
    expect(res.items.map((u) => u.firstName).sort()).toEqual(['Ravi', 'Tara']);
  });

  it('assertLeadAccess throws ForbiddenException', async () => {
    await expect(
      policy.assertLeadAccess({ hrmsId: legal._id, label: 'Lena Test' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
