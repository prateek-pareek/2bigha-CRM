import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

// The service only needs these as injection tokens; loading the real schemas is not needed here.
jest.mock('../schemas/activity.schema', () => ({ Activity: { name: 'Activity' } }));
jest.mock('../schemas/lead.schema', () => ({ Lead: { name: 'Lead' } }));
jest.mock('../schemas/client.schema', () => ({ Client: { name: 'Client' } }));
jest.mock('../../users/schemas/user.schema', () => ({ User: { name: 'User' } }));
jest.mock('../notifications/crm-notify.service', () => ({ CrmNotifyService: class {} }));
jest.mock('../shared/crm-assignment-policy.service', () => ({
  CrmAssignmentPolicyService: class {},
}));

import { CrmRecordTasksService, type RecordTaskRef } from './crm-record-tasks.service';

const id = () => new Types.ObjectId();
const A = id(); // owner
const B = id(); // another team member
const C = id(); // outsider
const M = id(); // manager

function build(opts: { tier: 'all' | 'team' | 'own' | null; team?: Types.ObjectId[] }) {
  const users = new Map([A, B, C, M].map((u, i) => [String(u), `User${i}`]));
  const policy: any = {
    assignTier: () => opts.tier,
    resolveAssignee: async (r: string) =>
      users.has(String(r))
        ? { hrmsId: new Types.ObjectId(String(r)), label: users.get(String(r)), email: 'x@y.z' }
        : null,
    teamOf: async () => ({ ids: (opts.team || []).map(String), labels: [] }),
    assertAssignee: jest.fn(async (_t: any, _a: any, ref: string) => {
      if (opts.tier === 'team' && !(opts.team || []).map(String).includes(String(ref))) {
        throw new ForbiddenException('team only');
      }
      return { hrmsId: new Types.ObjectId(String(ref)), label: users.get(String(ref)) };
    }),
  };
  const svc = new CrmRecordTasksService(
    null as any,
    null as any,
    null as any,
    null as any,
    policy,
    { notify: jest.fn() } as any,
  );
  return { svc, policy };
}

const record = (owners: Types.ObjectId[]): RecordTaskRef => ({
  type: 'Lead',
  id: id(),
  name: 'Asha',
  ownerIds: owners.map(String),
  ownerLabel: owners.length ? 'Owner' : '',
  link: '/crm/leads/x',
});

describe('CrmRecordTasksService.planAssignment', () => {
  it('defaults to the record owner and keeps the owner unchanged', async () => {
    const { svc } = build({ tier: 'all' });
    const plan = await svc.planAssignment(record([A]), '', { userId: String(M) }, { allowDefault: true });
    expect(String(plan.assigneeId)).toBe(String(A));
    expect(plan.ownerChange).toBe(false);
  });

  it('lets the owner create a task for themself without any assign right', async () => {
    const { svc } = build({ tier: null });
    const plan = await svc.planAssignment(record([A]), String(A), { userId: String(A) }, { allowDefault: true });
    expect(plan.ownerChange).toBe(false);
  });

  it('blocks a plain agent from assigning a record task to someone else', async () => {
    const { svc } = build({ tier: null });
    await expect(
      svc.planAssignment(record([A]), String(B), { userId: String(A) }, { allowDefault: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a team lead create a task for a direct report', async () => {
    const { svc } = build({ tier: 'team', team: [M, A] });
    const plan = await svc.planAssignment(record([A]), String(A), { userId: String(M) }, { allowDefault: true });
    expect(String(plan.assigneeId)).toBe(String(A));
    expect(plan.ownerChange).toBe(false);
  });

  it('blocks a team lead from tasking a record owned outside the team', async () => {
    const { svc } = build({ tier: 'team', team: [M, A] });
    await expect(
      svc.planAssignment(record([C]), String(C), { userId: String(M) }, { allowDefault: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reassigns the record when a team lead picks another team member', async () => {
    const { svc, policy } = build({ tier: 'team', team: [M, A, B] });
    const plan = await svc.planAssignment(record([A]), String(B), { userId: String(M) }, { allowDefault: true });
    expect(String(plan.assigneeId)).toBe(String(B));
    expect(plan.ownerChange).toBe(true);
    expect(policy.assertAssignee).toHaveBeenCalled();
  });

  it('rejects reassigning to someone outside the team', async () => {
    const { svc } = build({ tier: 'team', team: [M, A] });
    await expect(
      svc.planAssignment(record([A]), String(C), { userId: String(M) }, { allowDefault: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assigns a fresh (unowned) lead to the picked person and makes them the owner', async () => {
    const { svc } = build({ tier: 'all' });
    const plan = await svc.planAssignment(record([]), String(B), { userId: String(M) }, { allowDefault: true });
    expect(plan.ownerChange).toBe(true);
    expect(String(plan.assigneeId)).toBe(String(B));
  });

  it('leaves a fresh lead task unassigned when nobody is picked', async () => {
    const { svc } = build({ tier: 'all' });
    const plan = await svc.planAssignment(record([]), '', { userId: String(M) }, { allowDefault: true });
    expect(plan.assigneeId).toBeUndefined();
    expect(plan.ownerChange).toBe(false);
  });

  it('removing the assignee on update never touches the record owner', async () => {
    const { svc } = build({ tier: 'all' });
    const plan = await svc.planAssignment(record([A]), '', { userId: String(M) }, { allowDefault: false });
    expect(plan.assigneeId).toBeUndefined();
    expect(plan.ownerChange).toBe(false);
  });
});
