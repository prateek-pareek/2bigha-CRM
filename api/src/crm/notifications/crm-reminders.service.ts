import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';
import {
  CrmReminder,
  CrmReminderDocument,
  CrmReminderRecurrence,
  CrmReminderRelatedType,
} from './schemas/crm-reminder.schema';

@Injectable()
export class CrmRemindersService {
  constructor(
    @InjectModel(CrmReminder.name, 'crmConnection')
    private readonly reminderModel: Model<CrmReminderDocument>,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
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

  async create(
    body: {
      title?: string;
      description?: string;
      relatedType?: string;
      relatedTo?: string;
      scheduledAt?: string;
      recurrence?: string;
      assigneeUserId?: string;
    },
    user?: any,
  ) {
    const createdBy = this.userOid(user);
    if (!createdBy) throw new ForbiddenException('Unauthorized');

    const title = String(body.title || '').trim();
    if (!title) throw new BadRequestException('Title is required');

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

    const recurrence = (['none', 'daily', 'weekly', 'monthly'].includes(
      String(body.recurrence || 'none'),
    )
      ? String(body.recurrence || 'none')
      : 'none') as CrmReminderRecurrence;

    let assigneeUserId = createdBy;
    if (body.assigneeUserId && Types.ObjectId.isValid(String(body.assigneeUserId))) {
      assigneeUserId = new Types.ObjectId(String(body.assigneeUserId));
    }

    return this.reminderModel.create({
      title,
      description: String(body.description || '').trim() || undefined,
      relatedType,
      relatedTo: new Types.ObjectId(String(body.relatedTo)),
      scheduledAt,
      nextFireAt: scheduledAt,
      status: 'PENDING',
      recurrence,
      createdBy,
      assigneeUserId,
      createdByName: this.actorName(user),
    });
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
}
