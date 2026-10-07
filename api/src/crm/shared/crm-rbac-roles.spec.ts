// Schemas use decorator metadata that ts-jest (isolatedModules) cannot emit — stub them.
jest.mock('../crm-users/schemas/user.schema', () => ({ CRMUser: class CRMUser {} }));
jest.mock('../../users/schemas/user.schema', () => ({ User: class User {} }));
jest.mock('../crm-users/crm-users.service', () => ({ CRMUsersService: class CRMUsersService {} }));

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { CRM_ROLE_SEEDS } from './crm-role-catalog';
import {
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
  hasCrmFullDataAccess,
  rolePermissionNames,
} from './crm-admin-access.util';
import { CrmAssignmentPolicyService } from './crm-assignment-policy.service';
import {
  leadModuleFilter,
  leadWorkspace,
  roleAllowsLead,
  workspaceForNewLead,
} from './crm-workspace-module.util';
import { RbacGuard } from '../crm-users/rbac.guard';

const seed = (key: string) => {
  const s = CRM_ROLE_SEEDS.find((r) => r.key === key);
  if (!s) throw new Error(`no seed ${key}`);
  return s;
};
const roleDoc = (key: string) => {
  const s = seed(key);
  return { _id: new Types.ObjectId(), name: s.name, workspaceModule: s.workspaceModule, crmPermissions: s.crmPermissions, permissions: [], isActive: true };
};
const crmUser = (key: string) => ({ email: `${key}@x.test`, isActive: true, role: 'user', roleId: roleDoc(key), permissions: [] });

describe('CRM role catalog (Roles Overview)', () => {
  it('defines exactly the 9 roles from the requirement doc, one workspace each', () => {
    expect(CRM_ROLE_SEEDS.map((r) => [r.name, r.workspaceModule])).toEqual([
      ['Super Admin', 'ALL'],
      ['Team Lead / Manager (2Bigha)', '2Bigha'],
      ['Calling Agent (2Bigha)', '2Bigha'],
      ['Social Media Executive', '2Bigha'],
      ['Property Approval Team', '2Bigha'],
      ['Team Lead / Manager (PM)', 'PROPERTY_MGMT'],
      ['Calling Agent (PM)', 'PROPERTY_MGMT'],
      ['Legal Executive', 'LEGAL'],
      ['Legal Team Lead', 'LEGAL'],
    ]);
  });

  it('gives no role except Super Admin any admin-level grant', () => {
    const adminLevel = /^(admin:|settings:|.*:export$|.*:read:all$|leads:delete$|contacts:delete$)/;
    for (const r of CRM_ROLE_SEEDS.filter((x) => x.key !== 'super_admin')) {
      expect(r.workspaceModule).not.toBe('ALL');
      expect(r.crmPermissions.filter((p) => adminLevel.test(p))).toEqual([]);
    }
  });

  it('only Team Leads / Social Media can reassign leads; only the Legal Team Lead reassigns cases', () => {
    const with_ = (p: string) => CRM_ROLE_SEEDS.filter((r) => r.crmPermissions.includes(p)).map((r) => r.key);
    expect(with_('leads:assign')).toEqual(['2bigha_team_lead', '2bigha_social_media', 'pm_team_lead']);
    expect(with_('legal:assign')).toEqual(['legal_team_lead']);
    expect(with_('approval-queue:read')).toEqual(['2bigha_property_approval']);
    expect(with_('leads:read:team')).toEqual(['2bigha_team_lead', 'pm_team_lead']);
    expect(with_('legal:read:team')).toEqual(['legal_team_lead']);
  });

  it('keeps Legal out of lead lists and 2Bigha/PM out of the legal workspace (status hand-off only)', () => {
    for (const k of ['legal_executive', 'legal_team_lead']) {
      expect(seed(k).crmPermissions.some((p) => p.startsWith('leads:'))).toBe(false);
    }
    for (const k of ['2bigha_calling_agent', 'pm_calling_agent', '2bigha_team_lead', 'pm_team_lead']) {
      const legal = seed(k).crmPermissions.filter((p) => p.startsWith('legal:'));
      expect(legal).toEqual(['legal:status']);
    }
  });
});

describe('admin bypass is Admin / Super Admin only', () => {
  it.each(['Manager', 'Team Lead / Manager (2Bigha)', 'Executive', 'Legal Executive', 'Director', 'Sub Admin'])(
    'role "%s" is not an admin',
    (name) => {
      expect(hasCrmAdminFromDbUser({ role: name, roleId: { name, crmPermissions: [] } })).toBe(false);
      expect(hasCrmAdminJwtBypass({ role: name, email: 'a@b.c', crmPermissions: [] })).toBe(false);
    },
  );

  it.each(['Super Admin', 'Admin', 'Administrator'])('role "%s" is an admin', (name) => {
    expect(hasCrmAdminFromDbUser({ role: 'user', roleId: { name, crmPermissions: [] } })).toBe(true);
  });

  it('the seeded Super Admin bypasses through admin:manage', () => {
    expect(hasCrmAdminFromDbUser(crmUser('super_admin'))).toBe(true);
    expect(hasCrmAdminFromDbUser(crmUser('2bigha_team_lead'))).toBe(false);
  });

  it('rolePermissionNames merges crmPermissions with legacy Permission refs and ignores inactive roles', () => {
    expect(rolePermissionNames({ crmPermissions: ['leads:read'], permissions: [{ name: 'legal:read' }] }).sort()).toEqual(['leads:read', 'legal:read']);
    expect(rolePermissionNames({ crmPermissions: ['leads:read'], isActive: false })).toEqual([]);
  });

  // Minimal Mongo matcher for the operators leadModuleFilter emits ($or, $nin, $ne, equality).
  const matches = (doc: any, f: any): boolean =>
    Object.entries(f).every(([k, v]: [string, any]) => {
      if (k === '$or') return v.some((sub: any) => matches(doc, sub));
      if (k === '$and') return v.every((sub: any) => matches(doc, sub));
      const val = doc[k];
      if (v && typeof v === 'object' && '$nin' in v) return !v.$nin.includes(val);
      if (v && typeof v === 'object' && '$ne' in v) return val !== v.$ne;
      return val === v;
    });
  const LEADS = {
    twoBigha: { module: '2Bigha', leadVertical: 'property_listing' },
    legacy: {},
    pmByVertical: { module: '2Bigha', leadVertical: 'property_management' },
    pmByModule: { module: 'PROPERTY_MGMT' },
  };

  it('PM roles see only PM leads; 2Bigha roles only 2Bigha leads; Super Admin everything', () => {
    const visible = (key: string) =>
      Object.entries(LEADS)
        .filter(([, lead]) => matches(lead, leadModuleFilter(crmUser(key))))
        .map(([name]) => name);
    for (const k of ['2bigha_calling_agent', '2bigha_team_lead', '2bigha_social_media']) {
      expect(visible(k)).toEqual(['twoBigha', 'legacy']);
    }
    for (const k of ['pm_calling_agent', 'pm_team_lead']) {
      expect(visible(k)).toEqual(['pmByVertical', 'pmByModule']);
    }
    expect(visible('legal_executive')).toEqual([]);
    expect(visible('super_admin')).toEqual(Object.keys(LEADS));
  });

  it('single-record check (roleAllowsLead) agrees with the list filter', () => {
    for (const key of CRM_ROLE_SEEDS.map((r) => r.key)) {
      for (const lead of Object.values(LEADS)) {
        expect(roleAllowsLead(crmUser(key), lead)).toBe(matches(lead, leadModuleFilter(crmUser(key))));
      }
    }
    expect(leadWorkspace(LEADS.pmByVertical)).toBe('PROPERTY_MGMT');
    expect(leadWorkspace(LEADS.legacy)).toBe('2Bigha');
  });

  it('new leads land in the creator\'s workspace (a PM agent cannot create a 2Bigha lead)', () => {
    expect(workspaceForNewLead(crmUser('pm_calling_agent'), { leadVertical: 'property_listing' }))
      .toEqual({ module: 'PROPERTY_MGMT', leadVertical: 'property_management' });
    expect(workspaceForNewLead(crmUser('2bigha_calling_agent'), { leadVertical: 'property_management' }))
      .toEqual({ module: '2Bigha', leadVertical: 'property_listing' });
    expect(workspaceForNewLead(crmUser('super_admin'), { leadVertical: 'property_management' }))
      .toEqual({ module: 'PROPERTY_MGMT', leadVertical: 'property_management' });
    expect(workspaceForNewLead(crmUser('super_admin'), {})).toEqual({ module: '2Bigha' });
  });
});

describe('RbacGuard', () => {
  const run = async (dbUser: any, required: string[]) => {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    const users = { findOne: async () => dbUser } as any;
    const guard = new RbacGuard(reflector, users);
    const req: any = { user: { email: dbUser.email, role: 'Employee', permissions: [], crmPermissions: [] } };
    const ctx: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) };
    const ok = await guard.canActivate(ctx);
    return { ok, req };
  };

  it('grants from the CRM role template and publishes them on req.user', async () => {
    const { ok, req } = await run(crmUser('2bigha_team_lead'), ['leads:assign']);
    expect(ok).toBe(true);
    expect(req.user.crmPermissions).toContain('leads:read:team');
    expect(hasCrmFullDataAccess(req.user)).toBe(false);
  });

  it('a Calling Agent cannot reassign', async () => {
    await expect(run(crmUser('2bigha_calling_agent'), ['leads:assign'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('legal:* is pinned to the LEGAL workspace even if a 2Bigha role were granted it', async () => {
    const u = crmUser('2bigha_team_lead');
    u.roleId.crmPermissions = [...u.roleId.crmPermissions, 'legal:read'];
    await expect(run(u, ['legal:read'])).rejects.toThrow(/LEGAL workspace/);
  });

  it('legal:status is the read-only hand-off open to 2Bigha / PM', async () => {
    await expect(run(crmUser('pm_calling_agent'), ['legal:read', 'legal:status'])).resolves.toMatchObject({ ok: true });
  });

  it('Legal Executive passes legal routes, not lead routes', async () => {
    await expect(run(crmUser('legal_executive'), ['legal:read'])).resolves.toMatchObject({ ok: true });
    await expect(run(crmUser('legal_executive'), ['leads:read'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Property Approval Team reaches the approval queue; agents do not', async () => {
    await expect(run(crmUser('2bigha_property_approval'), ['approval-queue:read'])).resolves.toMatchObject({ ok: true });
    await expect(run(crmUser('2bigha_calling_agent'), ['approval-queue:read'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('settings / exports stay admin-only', async () => {
    for (const k of CRM_ROLE_SEEDS.filter((r) => r.key !== 'super_admin').map((r) => r.key)) {
      await expect(run(crmUser(k), ['settings:admin'])).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run(crmUser(k), ['admin:manage'])).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(run(crmUser('super_admin'), ['admin:manage'])).resolves.toMatchObject({ ok: true });
  });
});

describe('CrmAssignmentPolicyService', () => {
  const lead = { _id: new Types.ObjectId(), firstName: 'Tara', lastName: 'Lead', email: 'tl@x.test' };
  const report = { _id: new Types.ObjectId(), firstName: 'Ravi', lastName: 'Agent', email: 'ravi@x.test' };
  const outsider = { _id: new Types.ObjectId(), firstName: 'Oscar', lastName: 'Other', email: 'oscar@x.test' };
  const pmAgent = { _id: new Types.ObjectId(), firstName: 'Pia', lastName: 'Pm', email: 'pia@x.test' };
  const all = [lead, report, outsider, pmAgent];
  const q = (rows: any) => ({ select: () => q(rows), lean: () => q(rows), limit: () => q(rows), populate: () => q(rows), exec: async () => rows });
  const hrms: any = {
    find: (f: any) =>
      q(f.reportsTo ? all.filter((u) => String(u === report ? lead._id : '') === String(f.reportsTo)) : all.filter((u) => f.firstName.test(u.firstName) && (!f.lastName || f.lastName.test(u.lastName)))),
    findById: (id: any) => q(all.find((u) => String(u._id) === String(id)) || null),
    findOne: (f: any) => q(all.find((u) => f.email.test(u.email)) || null),
  };
  const crm: any = {
    findById: () => q(null),
    findOne: (f: any) => q(f.email.test(pmAgent.email) ? crmUser('pm_calling_agent') : crmUser('2bigha_calling_agent')),
  };
  const policy = new CrmAssignmentPolicyService(hrms, crm);
  const actor = (key: string, who: any) => ({
    userId: String(who._id),
    firstName: who.firstName,
    lastName: who.lastName,
    email: who.email,
    crmPermissions: seed(key).crmPermissions,
    crmDbUser: crmUser(key),
  });

  it('tiers: Team Lead → team, Social Media → own, Calling Agent → none, Super Admin → all', () => {
    expect(policy.assignTier('leads', actor('2bigha_team_lead', lead))).toBe('team');
    expect(policy.assignTier('leads', actor('2bigha_social_media', lead))).toBe('own');
    expect(policy.assignTier('leads', actor('2bigha_calling_agent', lead))).toBeNull();
    expect(policy.assignTier('leads', { ...actor('super_admin', lead), crmPermissions: ['admin:manage'] })).toBe('all');
    expect(() => policy.requireTier('leads', actor('2bigha_calling_agent', lead))).toThrow(ForbiddenException);
  });

  it('a Team Lead can assign to a direct report but not outside the team', async () => {
    const tl = actor('2bigha_team_lead', lead);
    await expect(policy.assertAssignee('team', tl, 'Ravi Agent')).resolves.toMatchObject({ label: 'Ravi Agent' });
    await expect(policy.assertAssignee('team', tl, String(report._id))).resolves.toMatchObject({ label: 'Ravi Agent' });
    await expect(policy.assertAssignee('team', tl, 'Oscar Other')).rejects.toThrow(/own team/);
  });

  it('Social Media can hand leads to a 2Bigha agent but not to a PM agent', async () => {
    const sm = actor('2bigha_social_media', outsider);
    await expect(policy.assertAssignee('own', sm, 'ravi@x.test')).resolves.toMatchObject({ label: 'Ravi Agent' });
    await expect(policy.assertAssignee('own', sm, 'pia@x.test')).rejects.toThrow(/own workspace/);
  });

  it('non-admins must pick a real user', async () => {
    await expect(policy.assertAssignee('team', actor('2bigha_team_lead', lead), 'Nobody Here')).rejects.toThrow(/user list/);
  });

  describe('assignableUsers (Reassign picker)', () => {
    const chain = (rows: any[]) => {
      const c: any = { select: () => c, sort: () => c, skip: () => c, limit: () => c, lean: () => c, populate: () => c, exec: async () => rows };
      return c;
    };
    const pickerPolicy = (onFilter: (f: any) => void) =>
      new CrmAssignmentPolicyService(
        {
          ...hrms,
          // `teamOf` lookup by reportsTo; the paged query is captured.
          find: (f: any) => {
            if (f.reportsTo) return chain([report]);
            onFilter(f);
            return chain([lead, report]);
          },
          countDocuments: () => ({ exec: async () => 2 }),
        } as any,
        crm,
      );

    it('a Team Lead only gets themself + direct reports, searchable and paged', async () => {
      let captured: any;
      const p = pickerPolicy((f) => (captured = f));
      const res = await p.assignableUsers('leads', actor('2bigha_team_lead', lead), { search: 'ravi', page: '2', limit: '5' });
      expect(res).toMatchObject({ tier: 'team', total: 2, page: 2, limit: 5 });
      expect(res.items.map((u) => u.label)).toEqual(['Tara Lead', 'Ravi Agent']);
      const ids = captured.$and[0]._id.$in.map(String);
      expect(ids.sort()).toEqual([String(lead._id), String(report._id)].sort());
      expect(ids).not.toContain(String(outsider._id));
      expect(captured.$and[1].$or[0].firstName.test('Ravi')).toBe(true);
    });

    it('a role without leads:assign gets an empty list', async () => {
      const p = pickerPolicy(() => {
        throw new Error('should not query');
      });
      await expect(p.assignableUsers('leads', actor('2bigha_calling_agent', lead))).resolves.toMatchObject({ items: [], total: 0, tier: null });
    });

    it('clamps page size to 50', async () => {
      const p = pickerPolicy(() => undefined);
      const res = await p.assignableUsers('leads', actor('2bigha_team_lead', lead), { limit: '500' });
      expect(res.limit).toBe(50);
    });
  });
});
