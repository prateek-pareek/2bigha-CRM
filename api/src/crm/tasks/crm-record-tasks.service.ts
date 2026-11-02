import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import {
  CrmAssignmentPolicyService,
  type AssignableUser,
  type CrmAssignTier,
  type ResolvedAssignee,
} from '../shared/crm-assignment-policy.service';
import { CrmNotifyService } from '../notifications/crm-notify.service';

/** Records a task can be created from. The task owner and the record owner stay in sync. */
export type RecordTaskType = 'Lead' | 'Client';

export const isRecordTaskType = (t: unknown): t is RecordTaskType =>
  t === 'Lead' || t === 'Client';

const CLOSED_TASK_STATUSES = ['Done', 'Completed', 'Cancelled', 'Deleted'];

export type RecordTaskRef = {
  type: RecordTaskType;
  id: Types.ObjectId;
  name: string;
  /** HRMS ids of the current owner(s): lead → 0/1, client → `assignedTo`. */
  ownerIds: string[];
  ownerLabel: string;
  link: string;
};

export type RecordTaskPlan = {
  record: RecordTaskRef;
  assigneeId?: Types.ObjectId;
  assigneeLabel?: string;
  assigneeEmail?: string;
  /** The record owner has to change to `assigneeId` (fresh lead or reassignment). */
  ownerChange: boolean;
};

export type RecordTaskContext = {
  record: { type: RecordTaskType; id: string; name: string; link: string };
  owner: { id: string; label: string } | null;
  unassigned: boolean;
  tier: CrmAssignTier;
  /** May the caller create a task on this record at all? */
  canCreate: boolean;
  reason?: string;
  /** May the caller pick someone other than the current owner (this reassigns the record too)? */
  canReassign: boolean;
  defaultAssigneeId: string | null;
  assignees: AssignableUser[];
};

const ref = (v: unknown): string => {
  let s = String(v ?? '').trim();
  if (s.startsWith('twobigha:')) s = s.slice('twobigha:'.length);
  if (s.startsWith('crm:')) s = s.slice('crm:'.length);
  return s;
};

@Injectable()
export class CrmRecordTasksService {
  constructor(
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    private readonly assignmentPolicy: CrmAssignmentPolicyService,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  private actorId(user?: any): string {
    const raw = user?.userId ?? user?._id ?? user?.id;
    return raw ? String(raw) : '';
  }

  private userLabel(u: any): string {
    return (
      [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() ||
      u?.fullName ||
      u?.email ||
      ''
    );
  }

  /** Who may be given a record task: Lead assign tier is the shared "can assign" policy. */
  private tierOf(user?: any): CrmAssignTier {
    return this.assignmentPolicy.assignTier('leads', user);
  }

  async loadRecord(type: RecordTaskType, rawId: unknown): Promise<RecordTaskRef> {
    const id = String(rawId ?? '').trim();
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid record id');
    }
    const oid = new Types.ObjectId(id);
    if (type === 'Lead') {
      const lead: any = await this.leadModel
        .findById(oid)
        .select('firstName lastName leadOwner')
        .lean()
        .exec();
      if (!lead) throw new BadRequestException('Lead not found');
      const label = String(lead.leadOwner || '').trim();
      const owner = label ? await this.assignmentPolicy.resolveAssignee(label) : null;
      return {
        type,
        id: oid,
        name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lead',
        ownerIds: owner?.hrmsId ? [String(owner.hrmsId)] : [],
        ownerLabel: owner?.label || label,
        link: `/crm/leads/${id}`,
      };
    }
    const client: any = await this.clientModel
      .findById(oid)
      .select('name assignedTo')
      .lean()
      .exec();
    if (!client) throw new BadRequestException('Client not found');
    const ownerIds = (Array.isArray(client.assignedTo) ? client.assignedTo : []).map(String);
    let ownerLabel = '';
    if (ownerIds.length) {
      const u: any = await this.hrmsUserModel
        .findById(ownerIds[0])
        .select('firstName lastName email')
        .lean()
        .exec();
      ownerLabel = this.userLabel(u);
    }
    return {
      type,
      id: oid,
      name: String(client.name || '').trim() || 'Client',
      ownerIds,
      ownerLabel,
      link: `/crm/clients/${id}`,
    };
  }

  /** Does `actor` have authority over the record's current owner (is them, or manages them)? */
  private async coversOwner(
    tier: CrmAssignTier,
    actor: any,
    record: RecordTaskRef,
  ): Promise<boolean> {
    const me = this.actorId(actor);
    if (me && record.ownerIds.includes(me)) return true;
    if (tier === 'all') return true;
    if (tier === 'team') {
      const team = await this.assignmentPolicy.teamOf(actor);
      return record.ownerIds.some((id) => team.ids.includes(id));
    }
    return false;
  }

  /**
   * Decide who a task on `record` may be assigned to and whether the record owner changes with it.
   * `requested` is the assignee the UI sent; empty means "default" (current owner) on create and
   * "unassign" on update (`allowDefault=false`).
   */
  async planAssignment(
    record: RecordTaskRef,
    requested: unknown,
    actor: any,
    opts: { allowDefault: boolean },
  ): Promise<RecordTaskPlan> {
    const tier = this.tierOf(actor);
    const me = this.actorId(actor);
    const hasOwner = record.ownerIds.length > 0;
    const requestedRef = ref(requested);

    let target: ResolvedAssignee | null = null;
    if (requestedRef) {
      target = await this.assignmentPolicy.resolveAssignee(requestedRef);
      if (!target?.hrmsId) {
        throw new BadRequestException('Pick an assignee from the user list.');
      }
    } else if (opts.allowDefault && hasOwner) {
      target = await this.assignmentPolicy.resolveAssignee(record.ownerIds[0]);
    }
    if (!target?.hrmsId) {
      // Fresh lead and nobody picked: task stays unassigned (any task writer may create it).
      // On update this is an explicit "remove the assignee" — the record owner is left untouched.
      return { record, ownerChange: false };
    }

    const targetId = String(target.hrmsId);
    const base = {
      record,
      assigneeId: target.hrmsId,
      assigneeLabel: target.label,
      assigneeEmail: target.email,
    };
    const covers = await this.coversOwner(tier, actor, record);

    if (record.ownerIds.includes(targetId)) {
      if (!covers) {
        throw new ForbiddenException(
          'Only the assigned person, or their Team Lead / Manager / Admin, can create tasks on this record.',
        );
      }
      return { ...base, ownerChange: false };
    }

    // The target is not the current owner → this reassigns the record along with the task.
    if (!tier) {
      if (!hasOwner && targetId === me) return { ...base, ownerChange: false };
      throw new ForbiddenException(
        'Tasks from a lead or client can only be assigned to the person it is assigned to.',
      );
    }
    if (hasOwner && !covers) {
      throw new ForbiddenException(
        'You can only reassign records that belong to you or your team.',
      );
    }
    await this.assignmentPolicy.assertAssignee(tier, actor, targetId);
    return { ...base, ownerChange: true };
  }

  /** Picker data for the "create task from lead/client" form. */
  async getContext(type: RecordTaskType, rawId: unknown, actor: any): Promise<RecordTaskContext> {
    const record = await this.loadRecord(type, rawId);
    const tier = this.tierOf(actor);
    const me = this.actorId(actor);
    const hasOwner = record.ownerIds.length > 0;
    const covers = await this.coversOwner(tier, actor, record);
    const canCreate = !hasOwner || covers;
    const canReassign = !!tier && (!hasOwner || covers);

    let assignees: AssignableUser[] = [];
    if (canReassign) {
      const page = await this.assignmentPolicy.assignableUsers('leads', actor, { limit: 200 });
      assignees = page.items;
    }
    // Owner and caller are always selectable (owner = default; caller = own task on a fresh lead).
    const need = new Set<string>();
    if (hasOwner && canCreate) need.add(record.ownerIds[0]);
    if (me && (canCreate || !hasOwner)) need.add(me);
    const missing = [...need].filter((id) => !assignees.some((a) => a._id === id));
    if (missing.length) {
      const rows: any[] = await this.hrmsUserModel
        .find({ _id: { $in: missing.map((id) => new Types.ObjectId(id)) } })
        .select('firstName lastName email')
        .lean()
        .exec();
      for (const u of rows) {
        // A caller who cannot reassign may only pick the owner (or themself on a fresh lead).
        if (!canReassign && hasOwner && String(u._id) !== record.ownerIds[0]) continue;
        assignees.push({
          _id: String(u._id),
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          email: u.email,
          label: this.userLabel(u),
        });
      }
    }

    return {
      record: { type, id: String(record.id), name: record.name, link: record.link },
      owner: hasOwner ? { id: record.ownerIds[0], label: record.ownerLabel } : null,
      unassigned: !hasOwner,
      tier,
      canCreate,
      reason: canCreate
        ? undefined
        : 'This record is assigned to someone outside your team, so you cannot create tasks on it.',
      canReassign,
      defaultAssigneeId: hasOwner ? record.ownerIds[0] : null,
      assignees,
    };
  }

  /** Make the client's `assignedTo` the given user (client reassignment from a task). */
  async applyClientOwner(
    record: RecordTaskRef,
    newOwnerId: Types.ObjectId,
    actor: any,
  ): Promise<void> {
    await this.clientModel
      .updateOne({ _id: record.id }, { $set: { assignedTo: [newOwnerId] } })
      .exec();
    const newId = String(newOwnerId);
    const link = record.link;
    const meta = { link, entityId: String(record.id), relatedType: 'Client' };
    void this.crmNotify
      .notify({
        event: record.ownerIds.length ? 'lead_reassigned' : 'lead_assigned',
        title: 'Client assigned to you',
        message: `${record.name} has been assigned to you by ${this.userLabel(actor) || 'a manager'}.`,
        recipient: { userId: newId },
        link,
        metadata: { ...meta, action: 'client_owner_changed_in' },
        type: 'CLIENT_ASSIGNED',
      })
      .catch(() => null);
    for (const prev of record.ownerIds.filter((id) => id !== newId)) {
      void this.crmNotify
        .notify({
          event: 'lead_reassigned',
          title: 'Client reassigned',
          message: `${record.name} has been reassigned to someone else.`,
          recipient: { userId: prev },
          link,
          metadata: { ...meta, action: 'client_owner_changed_out' },
          type: 'CLIENT_ASSIGNED',
        })
        .catch(() => null);
    }
  }

  /**
   * The record owner changed (lead/client reassignment, bulk assign, task-driven reassign):
   * every open task on those records follows the new owner so they never drift apart.
   * Closed tasks keep their historical assignee.
   */
  async syncOpenTasksToOwner(opts: {
    relatedType: RecordTaskType;
    recordIds: Array<string | Types.ObjectId>;
    newOwner: unknown;
    actor?: any;
    /** Notify the new owner; off when the caller already notifies about the record itself. */
    notify?: boolean;
  }): Promise<{ updated: number }> {
    const oids = opts.recordIds
      .map((i) => String(i))
      .filter((i) => Types.ObjectId.isValid(i))
      .map((i) => new Types.ObjectId(i));
    if (!oids.length) return { updated: 0 };
    const owner = await this.assignmentPolicy.resolveAssignee(ref(opts.newOwner));
    if (!owner?.hrmsId) return { updated: 0 };

    const tasks = await this.activityModel
      .find({
        type: 'Task',
        relatedType: opts.relatedType,
        relatedTo: { $in: oids },
        status: { $nin: CLOSED_TASK_STATUSES },
        'metadata.syncAssignee': { $ne: false },
        $or: [{ assignee: { $ne: owner.hrmsId } }, { assignee: null }],
      })
      .exec();
    if (!tasks.length) return { updated: 0 };

    const actorName = this.userLabel(opts.actor) || 'System';
    const newId = String(owner.hrmsId);
    const previous = new Set<string>();
    const perRecord = new Map<string, number>();
    for (const t of tasks) {
      if (t.assignee && String(t.assignee) !== newId) previous.add(String(t.assignee));
      perRecord.set(String(t.relatedTo), (perRecord.get(String(t.relatedTo)) || 0) + 1);
      const meta: Record<string, any> = { ...(t.metadata || {}) };
      const log = Array.isArray(meta.activityLog) ? [...meta.activityLog] : [];
      log.unshift({
        id: new Types.ObjectId().toString(),
        at: new Date().toISOString(),
        actorId: this.actorId(opts.actor),
        actorName,
        action: 'reassigned',
        detail: `Assignee synced with ${opts.relatedType.toLowerCase()} owner (${owner.label})`,
      });
      meta.activityLog = log.slice(0, 80);
      meta.assigneeName = owner.label;
      meta.assigneeEmail = owner.email;
      t.assignee = owner.hrmsId as any;
      t.metadata = meta;
      t.markModified('metadata');
      await t.save();
    }

    if (opts.notify !== false) {
      const n = tasks.length;
      const first = tasks[0];
      const link =
        n === 1
          ? opts.relatedType === 'Lead'
            ? `/crm/leads/${first.relatedTo}`
            : `/crm/clients/${first.relatedTo}`
          : '/crm/tasks';
      void this.crmNotify
        .notify({
          event: 'task_reassigned',
          title: n === 1 ? `Task reassigned: ${first.title || 'Task'}` : `${n} tasks reassigned to you`,
          message:
            n === 1
              ? `${actorName} reassigned a task to you.`
              : `${actorName} reassigned ${n} open tasks to you.`,
          recipient: { userId: newId, email: owner.email },
          link,
          metadata: { link, relatedType: opts.relatedType, activityId: String(first._id) },
          type: 'CRM_TASK_REASSIGNED',
        })
        .catch(() => null);
      for (const prev of previous) {
        void this.crmNotify
          .notify({
            event: 'task_reassigned',
            title: 'Task reassigned',
            message: `A task assigned to you was moved to ${owner.label}.`,
            recipient: { userId: prev },
            link: '/crm/tasks',
            metadata: { link: '/crm/tasks' },
            type: 'CRM_TASK_REASSIGNED',
          })
          .catch(() => null);
      }
    }
    return { updated: tasks.length };
  }
}
