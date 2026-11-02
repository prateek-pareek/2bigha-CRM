import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';

const CLOSED_STATUSES = ['Done', 'Completed', 'Cancelled', 'Deleted'];

export type TaskEscalationDay = {
  date: string; // yyyy-MM-dd in CRM reporting timezone
  escalated: number;
  scheduled: number;
  tasks: Array<{
    id: string;
    title: string;
    kind: 'escalated' | 'scheduled';
    at: string;
    relatedTo?: string;
    relatedType?: string;
  }>;
};

/**
 * Moves tasks into the Escalated lane once their `metadata.escalateAt` passes.
 * The task is handed to the assignee's manager (`reportsTo`) when known; otherwise it
 * stays with the current assignee but is still flagged escalated.
 */
@Injectable()
export class TaskAutoEscalationService {
  private readonly logger = new Logger(TaskAutoEscalationService.name);
  private running = false;

  constructor(
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(User.name)
    private readonly hrmsUserModel: Model<UserDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron('* * * * *')
  async handleCron() {
    if (this.running) return;
    this.running = true;
    try {
      await this.escalateDueTasks();
    } catch (err: any) {
      this.logger.error(`Auto-escalation run failed: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }

  /** Escalates every overdue-by-deadline task; returns how many were escalated. */
  async escalateDueTasks(now: Date = new Date()): Promise<number> {
    const due = await this.activityModel
      .find({
        type: 'Task',
        isDeleted: { $ne: true },
        status: { $nin: CLOSED_STATUSES },
        'metadata.autoEscalate': true,
        'metadata.escalated': { $ne: true },
        'metadata.escalateAt': { $lte: now.toISOString() },
      })
      .limit(200)
      .exec();

    let count = 0;
    for (const task of due) {
      try {
        if (await this.escalateTask(task, now)) count += 1;
      } catch (err: any) {
        this.logger.error(
          `Failed to auto-escalate task ${task._id}: ${err?.message || err}`,
        );
      }
    }
    if (count) this.logger.log(`Auto-escalated ${count} task(s)`);
    return count;
  }

  private async managerOf(userId?: unknown): Promise<string> {
    if (!userId) return '';
    const u: any = await this.hrmsUserModel
      .findById(userId)
      .select('reportsTo')
      .lean()
      .exec();
    return u?.reportsTo && Types.ObjectId.isValid(String(u.reportsTo))
      ? String(u.reportsTo)
      : '';
  }

  private async escalateTask(task: ActivityDocument, now: Date): Promise<boolean> {
    const meta: Record<string, any> = { ...(task.metadata || {}) };
    const prevAssignee = task.assignee ? String(task.assignee) : '';
    const target =
      (await this.managerOf(task.assignee)) ||
      (await this.managerOf(task.author));
    const reassign = Boolean(target) && target !== prevAssignee;

    const nowIso = now.toISOString();
    const log = Array.isArray(meta.activityLog) ? [...meta.activityLog] : [];
    log.unshift({
      id: new Types.ObjectId().toString(),
      at: nowIso,
      actorName: 'System',
      action: 'escalated',
      detail: reassign
        ? 'Auto-escalated to manager (escalation deadline passed)'
        : 'Auto-escalated (escalation deadline passed)',
    });

    const set: Record<string, any> = {
      'metadata.escalated': true,
      'metadata.escalatedAt': nowIso,
      'metadata.autoEscalated': true,
      'metadata.escalatedFrom': prevAssignee || null,
      'metadata.priority': meta.priority === 'Low' ? 'Medium' : 'High',
      'metadata.activityLog': log.slice(0, 80),
    };
    if (reassign) {
      set['metadata.escalatedTo'] = target;
      set.assignee = new Types.ObjectId(target);
    }

    // Atomic claim: a concurrent run / manual escalation wins exactly once.
    const claimed = await this.activityModel
      .findOneAndUpdate(
        {
          _id: task._id,
          'metadata.escalated': { $ne: true },
          status: { $nin: CLOSED_STATUSES },
        },
        { $set: set },
        { new: true },
      )
      .exec();
    if (!claimed) return false;

    const title = String(claimed.title || 'Task');
    const link = '/crm/tasks';
    const common = {
      event: 'task_escalated' as const,
      link,
      type: 'CRM_TASK_ESCALATED',
      metadata: {
        link,
        activityId: String(claimed._id),
        relatedType: claimed.relatedType,
        auto: true,
      },
    };
    const recipients = new Map<string, string>();
    if (reassign) {
      recipients.set(target, `"${title}" passed its escalation deadline and was escalated to you.`);
    }
    const info = `"${title}" passed its escalation deadline and was auto-escalated.`;
    if (prevAssignee) recipients.set(prevAssignee, info);
    if (task.author && !recipients.has(String(task.author))) {
      recipients.set(String(task.author), info);
    }
    for (const [userId, message] of recipients) {
      await this.crmNotify
        .notify({
          ...common,
          title: `Task escalated: ${title}`,
          message,
          recipient: { userId },
        })
        .catch((err) =>
          this.logger.error(`Escalation notify failed: ${err?.message || err}`),
        );
    }
    return true;
  }

  private related(t: any) {
    return t.relatedTo
      ? { relatedTo: String(t.relatedTo), relatedType: t.relatedType }
      : {};
  }

  /**
   * Per-day calendar roll-up: tasks that were escalated on a date and tasks still
   * scheduled to auto-escalate on a date. Days are bucketed in the CRM timezone.
   */
  async calendarSummary(
    start?: string,
    end?: string,
    owner?: string,
  ): Promise<TaskEscalationDay[]> {
    const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
    const dayKey = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    const range = (field: string) => {
      const r: Record<string, string> = {};
      if (s && !Number.isNaN(s.getTime())) r.$gte = s.toISOString();
      if (e && !Number.isNaN(e.getTime())) r.$lte = e.toISOString();
      return Object.keys(r).length ? { [field]: r } : {};
    };
    const base: Record<string, any> = { type: 'Task', isDeleted: { $ne: true } };
    if (owner && owner !== 'All' && Types.ObjectId.isValid(owner)) {
      const oid = new Types.ObjectId(owner);
      base.$and = [{ $or: [{ author: oid }, { assignee: oid }] }];
    }

    const [escalated, scheduled] = await Promise.all([
      this.activityModel
        .find({
          ...base,
          'metadata.escalated': true,
          ...range('metadata.escalatedAt'),
        })
        .select('title relatedTo relatedType metadata.escalatedAt')
        .lean()
        .exec(),
      this.activityModel
        .find({
          ...base,
          status: { $nin: CLOSED_STATUSES },
          'metadata.autoEscalate': true,
          'metadata.escalated': { $ne: true },
          ...range('metadata.escalateAt'),
        })
        .select('title relatedTo relatedType metadata.escalateAt')
        .lean()
        .exec(),
    ]);

    const days = new Map<string, TaskEscalationDay>();
    const bucket = (iso: string) => {
      const date = dayKey(iso);
      let d = days.get(date);
      if (!d) {
        d = { date, escalated: 0, scheduled: 0, tasks: [] };
        days.set(date, d);
      }
      return d;
    };
    for (const t of escalated as any[]) {
      const at = t.metadata?.escalatedAt;
      if (!at) continue;
      const d = bucket(at);
      d.escalated += 1;
      d.tasks.push({ id: String(t._id), title: t.title, kind: 'escalated', at, ...this.related(t) });
    }
    for (const t of scheduled as any[]) {
      const at = t.metadata?.escalateAt;
      if (!at) continue;
      const d = bucket(at);
      d.scheduled += 1;
      d.tasks.push({ id: String(t._id), title: t.title, kind: 'scheduled', at, ...this.related(t) });
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
