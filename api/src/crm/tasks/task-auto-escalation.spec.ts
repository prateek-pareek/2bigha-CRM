import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { canManageTaskEscalation } from '../shared/crm-admin-access.util';
import {
  escalationDeadlineChanged,
  normalizeTaskEscalationMeta,
} from './task-escalation.util';
import { TaskAutoEscalationService } from './task-auto-escalation.service';

describe('canManageTaskEscalation', () => {
  it('allows admins and the team-lead tier', () => {
    expect(canManageTaskEscalation({ role: 'Admin' })).toBe(true);
    expect(canManageTaskEscalation({ role: 'Agent', crmPermissions: ['leads:read:team'] })).toBe(true);
    expect(canManageTaskEscalation({ role: 'Team Lead / Manager' })).toBe(true);
  });

  it('rejects agents / team members even if they created or own the task', () => {
    expect(
      canManageTaskEscalation({
        role: 'Sales Agent',
        crmPermissions: ['activities:read', 'activities:write', 'leads:read'],
      }),
    ).toBe(false);
    expect(canManageTaskEscalation(undefined)).toBe(false);
  });
});

describe('normalizeTaskEscalationMeta', () => {
  const future = new Date(Date.now() + 3600_000).toISOString();

  it('stores escalateAt as ISO and enables the flag', () => {
    const m = normalizeTaskEscalationMeta({ escalateAt: future, autoEscalate: true });
    expect(m.autoEscalate).toBe(true);
    expect(m.escalateAt).toBe(future);
  });

  it('requires a date when enabled and a future date when asked', () => {
    expect(() => normalizeTaskEscalationMeta({ autoEscalate: true })).toThrow(BadRequestException);
    expect(() =>
      normalizeTaskEscalationMeta(
        { autoEscalate: true, escalateAt: '2020-01-01T00:00:00Z' },
        { requireFuture: true },
      ),
    ).toThrow(BadRequestException);
    expect(() => normalizeTaskEscalationMeta({ escalateAt: 'nope' })).toThrow(BadRequestException);
  });

  it('turning it off clears the deadline', () => {
    const m = normalizeTaskEscalationMeta({ autoEscalate: false, escalateAt: future });
    expect(m.escalateAt).toBeNull();
  });

  it('detects deadline changes', () => {
    expect(escalationDeadlineChanged({ autoEscalate: true, escalateAt: future }, { autoEscalate: true, escalateAt: future })).toBe(false);
    expect(escalationDeadlineChanged({}, { autoEscalate: true, escalateAt: future })).toBe(true);
  });
});

describe('TaskAutoEscalationService.escalateDueTasks', () => {
  const managerId = new Types.ObjectId();
  const assigneeId = new Types.ObjectId();
  const authorId = new Types.ObjectId();

  function build(opts: { claimed: boolean; reportsTo?: Types.ObjectId }) {
    const task: any = {
      _id: new Types.ObjectId(),
      title: 'Call client',
      assignee: assigneeId,
      author: authorId,
      metadata: { priority: 'Low', autoEscalate: true },
    };
    const find = jest.fn().mockReturnValue({
      limit: () => ({ exec: async () => [task] }),
    });
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: async () => (opts.claimed ? { ...task, title: task.title } : null),
    });
    const activityModel: any = { find, findOneAndUpdate };
    const hrms: any = {
      findById: () => ({
        select: () => ({
          lean: () => ({
            exec: async () => (opts.reportsTo ? { reportsTo: opts.reportsTo } : {}),
          }),
        }),
      }),
    };
    const notify = jest.fn().mockResolvedValue(undefined);
    const svc = new TaskAutoEscalationService(activityModel, hrms, { notify } as any);
    return { svc, find, findOneAndUpdate, notify };
  }

  it('flags the task escalated, hands it to the manager and notifies', async () => {
    const { svc, find, findOneAndUpdate, notify } = build({ claimed: true, reportsTo: managerId });
    const n = await svc.escalateDueTasks(new Date('2026-11-02T10:00:00Z'));
    expect(n).toBe(1);
    expect(find.mock.calls[0][0]['metadata.escalateAt']).toEqual({ $lte: '2026-11-02T10:00:00.000Z' });
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter['metadata.escalated']).toEqual({ $ne: true });
    expect(update.$set['metadata.escalated']).toBe(true);
    expect(update.$set['metadata.priority']).toBe('Medium');
    expect(String(update.$set.assignee)).toBe(String(managerId));
    expect(notify).toHaveBeenCalledTimes(3); // manager, previous assignee, author
  });

  it('keeps the assignee when no manager is known', async () => {
    const { svc, findOneAndUpdate } = build({ claimed: true });
    await svc.escalateDueTasks();
    const update = findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.assignee).toBeUndefined();
    expect(update.$set['metadata.escalated']).toBe(true);
  });

  it('does nothing (and does not notify) when another run already claimed it', async () => {
    const { svc, notify } = build({ claimed: false, reportsTo: managerId });
    expect(await svc.escalateDueTasks()).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
