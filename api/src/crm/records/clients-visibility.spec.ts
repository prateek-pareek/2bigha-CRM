jest.mock('@nestjs/mongoose', () => {
  const actual = jest.requireActual('@nestjs/mongoose');
  const { Schema } = jest.requireActual('mongoose');
  return { ...actual, Prop: () => () => undefined, SchemaFactory: { createForClass: () => new Schema({}) } };
});

import { ClientsService } from './clients.service';
import { leadVisibilityTier } from '../shared/crm-lead-visibility.util';

/** Who sees every client/lead vs only what is assigned to them. */
describe('client + lead visibility by role', () => {
  const svc: any = Object.create(ClientsService.prototype);
  const id = '6ae1d9d6eeee325bf8804fb6';

  const superAdmin = { userId: id, role: 'Employee', crmPermissions: ['admin:manage'] };
  const adminByDbRole = {
    userId: id,
    role: 'Employee',
    crmPermissions: [],
    crmDbUser: { roleId: { name: 'Super Admin', crmPermissions: ['admin:manage'] } },
  };
  const teamLead = { userId: id, role: 'Employee', crmPermissions: ['clients:read:team', 'leads:read:team'] };
  const agent = { userId: id, role: 'Employee', crmPermissions: ['clients:read', 'leads:read'] };

  it('Admin / Super Admin see all clients and all leads', () => {
    for (const u of [superAdmin, adminByDbRole]) {
      expect(svc.canManageAllClients(u)).toBe(true);
      expect(leadVisibilityTier(u)).toBe('all');
    }
  });

  it('Team Lead and agents see only the clients assigned to them', () => {
    expect(svc.canManageAllClients(teamLead)).toBe(false);
    expect(svc.canManageAllClients(agent)).toBe(false);
  });

  it('agents see only their own leads', () => {
    expect(leadVisibilityTier(agent)).toBe('own');
  });
});
