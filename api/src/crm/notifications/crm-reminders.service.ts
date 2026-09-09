import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Activity, ActivityDocument } from '../records/schemas/activity.schema';
import { CallLog, CallLogDocument } from '../ivr/schemas/call-log.schema';
import {
  CrmReminder,
  CrmReminderDocument,
  CrmReminderMedium,
  CrmReminderRecurrence,
  CrmReminderRelatedType,
} from './schemas/crm-reminder.schema';
import { CrmNotifyService } from './crm-notify.service';

export type TeamScheduleKind =
  | 'custom'
  | 'lead_follow_up'
  | 'intent_follow_up'
  | 'callback'
  | 'task';

export type TeamScheduleItem = {
  kind: TeamScheduleKind;
  title: string;
  scheduledAt: Date;
  status: 'upcoming' | 'due' | 'overdue';
  ownerLabel?: string;
  link: string;
  relatedType?: string;
  relatedTo?: string;
};

@Injectable()
export class CrmRemindersService {
  constructor(
    @InjectModel(CrmReminder.name, 'crmConnection')
    private readonly reminderModel: Model<CrmReminderDocument>,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(CallLog.name, 'crmConnection')
    private readonly callLogModel: Model<CallLogDocument>,
    @Inject(forwardRef(() => CrmNotifyService))
    private readonly crmNotify: CrmNotifyService,
  ) {}

  private userOid(user?: any): Types.ObjectId | null {
    const raw = user?.userId ?? user?._id ?? user?.id;
    if (!raw || !Types.ObjectId.isValid(String(raw))) return null;
    return new Types.ObjectId(String(raw));
  }

  private actorName(user?: any): string {
    if (!user) return 'User';
    return (
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.fullName ||
      user.email ||
      'User'
    );
  }

  private crmPermissionSet(user?: any): Set<string> {
    const hrms = Array.isArray(user?.permissions) ? user.permissions : [];
    const crm = Array.isArray(user?.crmPermissions) ? user.crmPermissions : [];
    return new Set([...hrms, ...crm].map((p: any) => String(p || '').trim()));
  }

  private canReadTeam(user?: any): boolean {
    if (hasCrmFullDataAccess(user)) return true;
    const perms = this.crmPermissionSet(user);
    return (
      perms.has('leads:read:team') ||
      perms.has('leads:read:all') ||
      perms.has('tasks:read:team') ||
      perms.has('tasks:read:all')
    );
  }

  private async teamMemberIds(user?: any): Promise<Types.ObjectId[]> {
    const selfId = this.userOid(user);
    if (!selfId) return [];
    const reports = await this.hrmsUserModel
      .find({ reportsTo: selfId })
      .select('_id')
      .lean()
      .exec();
    return [selfId, ...reports.map((r: any) => r._id as Types.ObjectId)];
  }

  private advanceRecurrence(
    from: Date,
    recurrence: CrmReminderRecurrence,
  ): Date | null {
    if (!recurrence || recurrence === 'none') return null;
    const next = new Date(from.getTime());
    if (recurrence === 'daily') next.setDate(next.getDate() + 1);
    else if (recurrence === 'weekly') next.setDate(next.getDate() + 7);
    else if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
    else return null;
    return next;
  }

  private normalizeMedium(raw?: string): CrmReminderMedium | undefined {
    const v = String(raw || '')
      .trim()
      .toLowerCase();
    if (v === 'email' || v === 'whatsapp' || v === 'later') return v;
    return undefined;
  }

  private mediumLabel(medium?: CrmReminderMedium | string | null): string {
    if (medium === 'whatsapp') return 'WhatsApp';
    if (medium === 'email') return 'Email';
    if (medium === 'later') return 'decide later';
    return '';
  }

  /** Resolve leadOwner display label to an HRMS user id when possible. */
  private async resolveLeadOwnerUserId(
    leadOwnerLabel?: string | null,
  ): Promise<Types.ObjectId | null> {
    const label = String(leadOwnerLabel || '').trim();
    if (!label) return null;
    const resolved = await this.crmNotify.resolveRecipient({ label });
    if (resolved?.userId && Types.ObjectId.isValid(resolved.userId)) {
      return new Types.ObjectId(resolved.userId);
    }
    return null;
  }

  async create(
    body: {
      title?: string;
      description?: string;
      relatedType?: string;
      relatedTo?: string;
      scheduledAt?: string;
      recurrence?: string;
      assigneeUserId?: string;
      medium?: string;
      /** When true, notify the lead owner instead of the creator (default: creator). */
      assignToLeadOwner?: boolean;
      /** Also write Lead.nextFollowUpAt so list / cron stay aligned. */
      syncLeadNextFollowUp?: boolean;
    },
    user?: any,
  ) {
    const createdBy = this.userOid(user);
    if (!createdBy) throw new ForbiddenException('Unauthorized');

    const medium = this.normalizeMedium(body.medium);
    const relatedType = String(body.relatedType || '').trim() as CrmReminderRelatedType;
    if (!['Lead', 'Client', 'Contact', 'Task', 'Organization'].includes(relatedType)) {
      throw new BadRequestException('Invalid relatedType');
    }
    if (!body.relatedTo || !Types.ObjectId.isValid(String(body.relatedTo))) {
      throw new BadRequestException('relatedTo is required');
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Date & time must be at least now (or in the future)');
    }

    let recordLabel = `${relatedType}`;
    let leadOwnerLabel: string | undefined;
    if (relatedType === 'Lead') {
      const lead = await this.leadModel
        .findById(body.relatedTo)
        .select('firstName lastName leadOwner email')
        .lean()
        .exec();
      if (!lead) throw new NotFoundException('Lead not found');
      recordLabel =
        [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() ||
        'Lead';
      leadOwnerLabel = String((lead as any).leadOwner || '').trim() || undefined;
    }

    const mediumText = this.mediumLabel(medium);
    let title = String(body.title || '').trim();
    if (!title) {
      if (!medium) throw new BadRequestException('Title is required');
      title =
        medium === 'later'
          ? `Follow up (decide later): ${recordLabel}`
          : `Follow up via ${mediumText}: ${recordLabel}`;
    }

    const recurrence = (['none', 'daily', 'weekly', 'monthly'].includes(
      String(body.recurrence || 'none'),
    )
      ? String(body.recurrence || 'none')
      : 'none') as CrmReminderRecurrence;

    let assigneeUserId = createdBy;
    // Prefer the employee who schedules the reminder (they need the popup).
    // Only override when an assignee is passed explicitly.
    if (body.assigneeUserId && Types.ObjectId.isValid(String(body.assigneeUserId))) {
      assigneeUserId = new Types.ObjectId(String(body.assigneeUserId));
    } else if (
      body.assignToLeadOwner === true &&
      relatedType === 'Lead' &&
      leadOwnerLabel
    ) {
      const ownerId = await this.resolveLeadOwnerUserId(leadOwnerLabel);
      if (ownerId) assigneeUserId = ownerId;
    }

    const note = String(body.description || '').trim();
    const description =
      note ||
      (medium === 'later'
        ? `Remind to follow up with ${recordLabel} (channel TBD).`
        : medium
          ? `Remind to follow up with ${recordLabel} via ${mediumText}.`
          : undefined);

    const reminder = await this.reminderModel.create({
      title,
      description,
      relatedType,
      relatedTo: new Types.ObjectId(String(body.relatedTo)),
      scheduledAt,
      nextFireAt: scheduledAt,
      status: 'PENDING',
      recurrence,
      ...(medium ? { medium } : {}),
      createdBy,
      assigneeUserId,
      createdByName: this.actorName(user),
    });

    if (
      relatedType === 'Lead' &&
      body.syncLeadNextFollowUp === true &&
      medium
    ) {
      // Keep list "Next follow-up" in sync, but suppress duplicate lead-field
      // cron toasts — the CrmReminder (medium) owns the popup for this flow.
      const suppressAt = new Date();
      await this.leadModel
        .updateOne(
          { _id: new Types.ObjectId(String(body.relatedTo)) },
          {
            $set: {
              nextFollowUpAt: scheduledAt,
              followUpReminderSentAt: suppressAt,
              followUpUpcomingReminderSentAt: suppressAt,
              followUpOverdueReminderSentAt: suppressAt,
            },
          },
        )
        .exec();
    }

    const when = scheduledAt.toLocaleString('en-US', {
      timeZone: process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    void this.crmNotify.notify({
      event: medium ? 'follow_up_reminder' : 'custom_reminder',
      title: medium
        ? medium === 'later'
          ? 'Follow-up reminder set'
          : `Follow-up reminder set (${mediumText})`
        : 'Reminder scheduled',
      message: medium
        ? medium === 'later'
          ? `You'll be reminded to follow up with ${recordLabel} on ${when} — pick Email or WhatsApp then.`
          : `You'll be reminded to follow up with ${recordLabel} via ${mediumText} on ${when}.`
        : `"${title}" is set for ${when}.`,
      recipient: { userId: assigneeUserId },
      link:
        relatedType === 'Lead'
          ? `/crm/leads/${body.relatedTo}`
          : relatedType === 'Contact'
            ? `/crm/contacts/${body.relatedTo}`
            : '/crm/notifications',
      metadata: {
        reminderId: String(reminder._id),
        relatedType,
        entityId: String(body.relatedTo),
        medium: medium || null,
        scheduledAt: scheduledAt.toISOString(),
      },
      type: 'Reminder',
    });

    return reminder;
  }

  async listMine(
    query: {
      status?: string;
      relatedType?: string;
      relatedTo?: string;
      team?: string;
      limit?: number;
    },
    user?: any,
  ) {
    const selfId = this.userOid(user);
    if (!selfId) return { items: [], total: 0 };

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    else filter.status = { $in: ['PENDING', 'NOTIFIED'] };

    if (query.relatedType) filter.relatedType = query.relatedType;
    if (query.relatedTo && Types.ObjectId.isValid(query.relatedTo)) {
      filter.relatedTo = new Types.ObjectId(query.relatedTo);
    }

    const wantTeam = String(query.team || '') === '1' || String(query.team || '') === 'true';
    if (wantTeam && this.canReadTeam(user)) {
      const ids = await this.teamMemberIds(user);
      filter.$or = [
        { createdBy: { $in: ids } },
        { assigneeUserId: { $in: ids } },
      ];
    } else {
      filter.$or = [{ createdBy: selfId }, { assigneeUserId: selfId }];
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const [items, total] = await Promise.all([
      this.reminderModel
        .find(filter)
        .sort({ nextFireAt: 1 })
        .limit(limit)
        .lean()
        .exec(),
      this.reminderModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async markDone(id: string, user?: any) {
    const selfId = this.userOid(user);
    if (!selfId) throw new ForbiddenException('Unauthorized');
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id');

    const reminder = await this.reminderModel.findById(id).exec();
    if (!reminder) throw new NotFoundException('Reminder not found');

    const isOwner =
      String(reminder.createdBy) === String(selfId) ||
      String(reminder.assigneeUserId || '') === String(selfId);
    if (!isOwner && !hasCrmFullDataAccess(user)) {
      throw new ForbiddenException('Not allowed');
    }

    reminder.status = 'DONE';
    await reminder.save();
    return reminder;
  }

  async reschedule(
    id: string,
    body: { scheduledAt?: string; recurrence?: string },
    user?: any,
  ) {
    const selfId = this.userOid(user);
    if (!selfId) throw new ForbiddenException('Unauthorized');
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id');

    const reminder = await this.reminderModel.findById(id).exec();
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.status === 'DONE') {
      throw new BadRequestException('Completed reminders cannot be rescheduled');
    }

    const isOwner =
      String(reminder.createdBy) === String(selfId) ||
      String(reminder.assigneeUserId || '') === String(selfId);
    if (!isOwner && !hasCrmFullDataAccess(user)) {
      throw new ForbiddenException('Not allowed');
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is required');
    }

    reminder.scheduledAt = scheduledAt;
    reminder.nextFireAt = scheduledAt;
    reminder.status = 'PENDING';
    reminder.lastNotifiedAt = undefined;
    if (
      body.recurrence &&
      ['none', 'daily', 'weekly', 'monthly'].includes(body.recurrence)
    ) {
      reminder.recurrence = body.recurrence as CrmReminderRecurrence;
    }
    await reminder.save();
    return reminder;
  }

  /** Called by cron after a successful notify. */
  async afterNotified(reminder: CrmReminderDocument, notifiedAt = new Date()) {
    const next = this.advanceRecurrence(reminder.nextFireAt, reminder.recurrence);
    if (next) {
      reminder.lastNotifiedAt = notifiedAt;
      reminder.nextFireAt = next;
      reminder.scheduledAt = next;
      reminder.status = 'PENDING';
    } else {
      reminder.lastNotifiedAt = notifiedAt;
      reminder.status = 'NOTIFIED';
    }
    await reminder.save();
    return reminder;
  }

  async findDue(now = new Date(), graceMs = 24 * 60 * 60 * 1000) {
    const graceStart = new Date(now.getTime() - graceMs);
    return this.reminderModel
      .find({
        status: 'PENDING',
        nextFireAt: { $lte: now, $gte: graceStart },
      })
      .exec();
  }

  private scheduleStatus(at: Date, now: Date): 'upcoming' | 'due' | 'overdue' {
    const diff = at.getTime() - now.getTime();
    if (diff < -60 * 60 * 1000) return 'overdue';
    if (diff <= 15 * 60 * 1000) return 'due';
    return 'upcoming';
  }

  private memberLabels(
    rows: Array<{ firstName?: string; lastName?: string; email?: string }>,
  ) {
    const labels: string[] = [];
    for (const row of rows) {
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
      if (name) labels.push(name);
      if (row.email) labels.push(String(row.email).trim());
    }
    return [...new Set(labels.filter(Boolean))];
  }

  /**
   * Unified follow-up / callback / task / custom reminder view for managers
   * and team leads (spec §11.3).
   */
  async listTeamSchedule(user?: any, limit = 80) {
    if (!this.canReadTeam(user)) {
      return { canViewTeam: false, items: [] as TeamScheduleItem[] };
    }

    const perms = this.crmPermissionSet(user);
    const allAccess =
      hasCrmFullDataAccess(user) ||
      perms.has('leads:read:all') ||
      perms.has('tasks:read:all');

    const selfId = this.userOid(user);
    const reports = selfId
      ? await this.hrmsUserModel
          .find({ reportsTo: selfId })
          .select('_id firstName lastName email')
          .lean()
          .exec()
      : [];
    const self = selfId
      ? await this.hrmsUserModel
          .findById(selfId)
          .select('_id firstName lastName email')
          .lean()
          .exec()
      : null;
    const members = [self, ...reports].filter(Boolean) as Array<{
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>;
    const ids = members.map((m) => m._id);
    const labels = this.memberLabels(members);

    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const cap = Math.min(Math.max(Number(limit) || 80, 1), 200);
    const items: TeamScheduleItem[] = [];

    const leadDateClause = {
      $or: [
        { nextFollowUpAt: { $gte: from, $lte: to } },
        { leadIntentFollowUpAt: { $gte: from, $lte: to } },
      ],
    };
    const leadOwnerClause = {
      $or: [{ leadOwner: { $in: labels } }, { createdBy: { $in: ids } }],
    };
    const leads = await this.leadModel
      .find({
        isDeleted: { $ne: true },
        $and: [leadDateClause, ...(allAccess ? [] : [leadOwnerClause])],
      })
      .select('firstName lastName leadOwner nextFollowUpAt leadIntentFollowUpAt')
      .limit(cap)
      .lean()
      .exec();

    for (const lead of leads) {
      const name =
        [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() ||
        'Lead';
      const follow = (lead as any).nextFollowUpAt
        ? new Date((lead as any).nextFollowUpAt)
        : null;
      if (follow && !Number.isNaN(follow.getTime())) {
        items.push({
          kind: 'lead_follow_up',
          title: `Follow-up: ${name}`,
          scheduledAt: follow,
          status: this.scheduleStatus(follow, now),
          ownerLabel: String((lead as any).leadOwner || '') || undefined,
          link: `/crm/leads/${lead._id}`,
          relatedType: 'Lead',
          relatedTo: String(lead._id),
        });
      }
      const intent = (lead as any).leadIntentFollowUpAt
        ? new Date((lead as any).leadIntentFollowUpAt)
        : null;
      if (intent && !Number.isNaN(intent.getTime())) {
        items.push({
          kind: 'intent_follow_up',
          title: `Intent follow-up: ${name}`,
          scheduledAt: intent,
          status: this.scheduleStatus(intent, now),
          ownerLabel: String((lead as any).leadOwner || '') || undefined,
          link: `/crm/leads/${lead._id}`,
          relatedType: 'Lead',
          relatedTo: String(lead._id),
        });
      }
    }

    const taskFilter: Record<string, unknown> = {
      type: { $in: ['Task', 'Meeting'] },
      status: { $nin: ['Completed', 'Done', 'Cancelled'] },
      isDeleted: { $ne: true },
      'metadata.dueDate': { $exists: true, $ne: null },
    };
    if (!allAccess) {
      taskFilter.$or = [{ assignee: { $in: ids } }, { author: { $in: ids } }];
    }
    const tasks = await this.activityModel
      .find(taskFilter)
      .select('title assignee metadata relatedTo relatedType')
      .limit(cap)
      .lean()
      .exec();
    for (const task of tasks) {
      const dueRaw = (task as any).metadata?.dueDate;
      const due = dueRaw ? new Date(dueRaw) : null;
      if (!due || Number.isNaN(due.getTime())) continue;
      if (due < from || due > to) continue;
      items.push({
        kind: 'task',
        title: `Task: ${(task as any).title || 'Untitled'}`,
        scheduledAt: due,
        status: this.scheduleStatus(due, now),
        ownerLabel: (task as any).metadata?.assigneeName,
        link: '/crm/tasks',
        relatedType: 'Task',
        relatedTo: String(task._id),
      });
    }

    const callbackFilter: Record<string, unknown> = {
      callbackScheduledAt: { $gte: from, $lte: to },
    };
    if (!allAccess) {
      callbackFilter.initiatedByUserId = { $in: ids };
    }
    const callbacks = await this.callLogModel
      .find(callbackFilter)
      .select(
        'customerName customerNumber callbackScheduledAt relatedTo relatedType agentName',
      )
      .limit(cap)
      .lean()
      .exec();
    for (const row of callbacks) {
      const due = new Date((row as any).callbackScheduledAt);
      if (Number.isNaN(due.getTime())) continue;
      const relatedId = (row as any).relatedTo
        ? String((row as any).relatedTo)
        : '';
      const relatedType = String((row as any).relatedType || '').toLowerCase();
      let link = '/crm/ivr';
      if (relatedId && relatedType === 'lead') link = `/crm/leads/${relatedId}`;
      else if (relatedId && relatedType === 'contact')
        link = `/crm/contacts/${relatedId}`;
      else if (relatedId && relatedType === 'client')
        link = `/crm/clients/${relatedId}`;
      items.push({
        kind: 'callback',
        title: `Callback: ${String((row as any).customerName || (row as any).customerNumber || 'customer')}`,
        scheduledAt: due,
        status: this.scheduleStatus(due, now),
        ownerLabel: (row as any).agentName,
        link,
        relatedType: (row as any).relatedType,
        relatedTo: relatedId || undefined,
      });
    }

    const custom = await this.listMine({ team: '1', limit: cap }, user);
    for (const r of custom.items as any[]) {
      const at = r.nextFireAt ? new Date(r.nextFireAt) : null;
      if (!at || Number.isNaN(at.getTime())) continue;
      items.push({
        kind: 'custom',
        title: r.title,
        scheduledAt: at,
        status: this.scheduleStatus(at, now),
        ownerLabel: r.createdByName,
        link:
          r.relatedType === 'Lead'
            ? `/crm/leads/${r.relatedTo}`
            : r.relatedType === 'Client'
              ? `/crm/clients/${r.relatedTo}`
              : r.relatedType === 'Contact'
                ? `/crm/contacts/${r.relatedTo}`
                : '/crm/tasks',
        relatedType: r.relatedType,
        relatedTo: r.relatedTo ? String(r.relatedTo) : undefined,
      });
    }

    items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return { canViewTeam: true, items: items.slice(0, cap) };
  }
}
