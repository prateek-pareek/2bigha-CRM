import { Types } from 'mongoose';
import { CRM_ROLE_SEEDS } from './crm-role-catalog';
import { leadVisibilityFilter, leadVisibilityTier } from './crm-lead-visibility.util';

const seed = (key: string) => CRM_ROLE_SEEDS.find((r) => r.key === key)!;
const viewer = (key: string, first: string, last: string) => {
  const id = new Types.ObjectId();
  const s = seed(key);
  return {
    userId: String(id),
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}@x.test`,
    crmPermissions: s.crmPermissions,
    crmDbUser: {
      email: `${first.toLowerCase()}@x.test`,
      role: 'user',
      roleId: { name: s.name, workspaceModule: s.workspaceModule, crmPermissions: s.crmPermissions },
      permissions: [],
    },
  };
};

// Minimal matcher for the operators the filter emits.
const matches = (doc: any, f: any): boolean =>
  Object.entries(f).every(([k, v]: [string, any]) => {
    if (k === '$or') return v.some((s: any) => matches(doc, s));
    if (k === '$and') return v.every((s: any) => matches(doc, s));
    const val = doc[k];
    if (v instanceof RegExp) return typeof val === 'string' && v.test(val);
    if (v && typeof v === 'object' && '$in' in v) {
      const vals = Array.isArray(val) ? val.map(String) : [String(val)];
      return v.$in.map(String).some((x: string) => vals.includes(x));
    }
    if (v && typeof v === 'object' && '$nin' in v) return !v.$nin.includes(val);
    if (v && typeof v === 'object' && '$ne' in v) return val !== v.$ne;
    return val === v;
  });

describe('lead visibility (Leads / PM Leads / WhatsApp / IVR)', () => {
  const agent = viewer('2bigha_calling_agent', 'Arjun', 'Agent');
  const lead = viewer('2bigha_team_lead', 'Tara', 'Lead');
  const pmAgent = viewer('pm_calling_agent', 'Kabir', 'Pm');
  const pmLead = viewer('pm_team_lead', 'Meera', 'Pmlead');

  const L = {
    assignedToArjun: { module: '2Bigha', leadOwner: 'Arjun Agent' },
    arjunCreatedButReassigned: { module: '2Bigha', leadOwner: 'Someone Else', createdBy: agent.userId },
    otherAgents: { module: '2Bigha', leadOwner: 'Someone Else' },
    unassigned2Bigha: { module: '2Bigha' },
    pmAssignedToKabir: { module: 'PROPERTY_MGMT', leadVertical: 'property_management', leadOwner: 'kabir pm' },
    pmOther: { module: 'PROPERTY_MGMT', leadVertical: 'property_management', leadOwner: 'X' },
  };
  const visible = (u: any) => {
    const f = leadVisibilityFilter(u);
    return Object.entries(L).filter(([, d]) => (f ? matches(d, f) : true)).map(([n]) => n);
  };

  it('tiers', () => {
    expect(leadVisibilityTier(agent)).toBe('own');
    expect(leadVisibilityTier(lead)).toBe('workspace');
    expect(leadVisibilityTier(pmAgent)).toBe('own');
    expect(leadVisibilityTier(pmLead)).toBe('workspace');
  });

  it('a 2Bigha agent sees only leads assigned to them (not ones they created and lost)', () => {
    expect(visible(agent)).toEqual(['assignedToArjun']);
  });

  it('a 2Bigha Team Lead sees every 2Bigha lead, no PM leads', () => {
    expect(visible(lead)).toEqual(['assignedToArjun', 'arjunCreatedButReassigned', 'otherAgents', 'unassigned2Bigha']);
  });

  it('a PM agent sees only their assigned PM leads; PM Team Lead sees all PM leads', () => {
    expect(visible(pmAgent)).toEqual(['pmAssignedToKabir']);
    expect(visible(pmLead)).toEqual(['pmAssignedToKabir', 'pmOther']);
  });

  it('Social Media keeps the leads it created and handed to agents', () => {
    const sm = viewer('2bigha_social_media', 'Sana', 'Social');
    const handedOff = { module: '2Bigha', leadOwner: 'Arjun Agent', createdBy: sm.userId };
    const f = leadVisibilityFilter(sm)!;
    expect(matches(handedOff, f)).toBe(true);
  });
});
