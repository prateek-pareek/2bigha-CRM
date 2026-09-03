import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { TeamsIntegrationService } from '../integrations/teams-integration.service';
import { SlackIntegrationService } from '../integrations/slack-integration.service';
import { CrmNotifyService } from '../notifications/crm-notify.service';
import type { CrmNotifyEvent } from '../notifications/crm-notification-events';

@Injectable()
export class CrmCalendarCronService {
  private readonly logger = new Logger(CrmCalendarCronService.name);

  constructor(
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly teamsIntegration: TeamsIntegrationService,
    private readonly slackIntegration: SlackIntegrationService,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron('* * * * *')
  async processCalendarReminders() {
    const tasks = await this.activityModel.find({
      type: { $in: ['Task', 'Meeting'] },
      status: { $nin: ['Completed', 'Done', 'Cancelled'] },
      $or: [
        { 'metadata.isCalendarEvent': true },
        { 'metadata.reminderAt': { $exists: true, $ne: null } },
        { type: 'Task', 'metadata.dueDate': { $exists: true, $ne: null } },
      ],
      'metadata.dueDate': { $exists: true, $ne: null },
    });

    if (!tasks?.length) return;

    const now = new Date();

    for (const task of tasks) {
      if (task.metadata?.reminderDisabled) continue;

      const dueDate = new Date(task.metadata.dueDate);
      const configuredReminderAt = task.metadata.reminderAt
        ? new Date(task.metadata.reminderAt)
        : null;
      const hasConfiguredReminder = Boolean(
        configuredReminderAt && !Number.isNaN(configuredReminderAt.getTime()),
      );
      const reminderTarget = hasConfiguredReminder
        ? configuredReminderAt!
        : dueDate;
      const diffMs = reminderTarget.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 1000 / 60);

      const sentReminders = Array.isArray(task.metadata.remindersSent)
        ? [...task.metadata.remindersSent]
        : [];

      let reminderToPush: string | null = null;
      let reminderLabel = '';
      let event: CrmNotifyEvent = 'task_due';

      if (hasConfiguredReminder && diffMins > 0) continue;

      if (
        hasConfiguredReminder &&
        diffMins <= 0 &&
        diffMins > -1440 &&
        !task.metadata.reminderSentAt
      ) {
        reminderToPush = `custom:${configuredReminderAt!.toISOString()}`;
        reminderLabel =
          task.metadata.reminderType === 'custom'
            ? 'Custom reminder'
            : 'Follow-up reminder';
        event =
          task.metadata.reminderType === 'custom'
            ? 'custom_reminder'
            : 'task_due';
      } else if (
        !hasConfiguredReminder &&
        diffMins <= -60 &&
        diffMins > -7 * 24 * 60 &&
        !sentReminders.includes('overdue')
      ) {
        reminderToPush = 'overdue';
        reminderLabel = 'Overdue';
        event = 'task_overdue';
      } else if (
        diffMins <= 10080 &&
        diffMins > 10080 - 1440 &&
        !sentReminders.includes('1w')
      ) {
        reminderToPush = '1w';
        reminderLabel = '1 week';
      } else if (
        diffMins <= 2880 &&
        diffMins > 1440 &&
        !sentReminders.includes('2d')
      ) {
        reminderToPush = '2d';
        reminderLabel = '2 days';
      } else if (
        diffMins <= 1440 &&
        diffMins > 360 &&
        !sentReminders.includes('1d')
      ) {
        reminderToPush = '1d';
        reminderLabel = '1 day';
      } else if (
        diffMins <= 720 &&
        diffMins > 360 &&
        !sentReminders.includes('day_of')
      ) {
        reminderToPush = 'day_of';
        reminderLabel = 'Today';
      } else if (
        diffMins <= 360 &&
        diffMins > 180 &&
        !sentReminders.includes('6h')
      ) {
        reminderToPush = '6h';
        reminderLabel = '6 hours';
      } else if (
        diffMins <= 180 &&
        diffMins > 60 &&
        !sentReminders.includes('3h')
      ) {
        reminderToPush = '3h';
        reminderLabel = '3 hours';
      } else if (
        diffMins <= 60 &&
        diffMins > 30 &&
        !sentReminders.includes('1h')
      ) {
        reminderToPush = '1h';
        reminderLabel = '1 hour';
      } else if (
        diffMins <= 30 &&
        diffMins > 10 &&
        !sentReminders.includes('30m')
      ) {
        reminderToPush = '30m';
        reminderLabel = '30 minutes';
      } else if (
        diffMins <= 10 &&
        diffMins >= -10 &&
        !sentReminders.includes('10m')
      ) {
        reminderToPush = '10m';
        reminderLabel = '10 minutes';
      }

      if (!reminderToPush) continue;

      sentReminders.push(reminderToPush);
      await this.activityModel.findByIdAndUpdate(task._id, {
        $set: {
          'metadata.remindersSent': sentReminders,
          ...(hasConfiguredReminder
            ? { 'metadata.reminderSentAt': now.toISOString() }
            : {}),
        },
      });

      const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
      const formattedDueDate = dueDate.toLocaleString('en-US', {
        timeZone: tz,
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const reminderType =
        task.metadata.reminderType === 'custom' ? 'Custom' : 'Follow-up';
      const title =
        event === 'task_overdue'
          ? `Task overdue: ${task.title}`
          : `${reminderType} Reminder: ${task.title}`;
      const customMessage = String(task.metadata.reminderMessage || '').trim();
      const message =
        event === 'task_overdue'
          ? `Your task is overdue.\nWas due at: ${formattedDueDate}`
          : hasConfiguredReminder
            ? `${customMessage || `${reminderLabel} for your calendar event.`}\nEvent due at: ${formattedDueDate}`
            : `Your calendar task is due in ${reminderLabel}.\nDue at: ${formattedDueDate}`;

      let link = '/crm/tasks';
      const relatedId = task.relatedTo ? String(task.relatedTo) : '';
      const relatedType = String(task.relatedType || '').toLowerCase();
      if (relatedId && Types.ObjectId.isValid(relatedId)) {
        if (relatedType === 'lead') link = `/crm/leads/${relatedId}`;
        else if (relatedType === 'contact') link = `/crm/contacts/${relatedId}`;
        else if (relatedType === 'client') link = `/crm/clients/${relatedId}`;
        else if (relatedType === 'organization')
          link = `/crm/organizations/${relatedId}`;
      }

      await this.crmNotify
        .notify({
          event,
          title,
          message,
          recipient: {
            userId: task.assignee || task.author,
            label: task.metadata.reminderRecipientLabel,
            email: task.metadata.assigneeEmail,
            twobighaAdminId: task.metadata.twobighaAdminId,
          },
          link,
          metadata: {
            link,
            activityId: String(task._id),
            entityId: relatedId || undefined,
            relatedType: task.relatedType,
          },
          type: event === 'task_overdue' ? 'CRM_TASK_OVERDUE' : 'Reminder',
        })
        .catch((err) =>
          this.logger.error(`Failed to notify task reminder: ${err.message}`),
        );

      await this.teamsIntegration
        .notifyTeams('crm', {
          title,
          text: `${message}\n\nTask: ${task.title}\nContact: ${task.relatedType || 'Unknown'} - ${task.relatedTo || 'None'}`,
        })
        .catch((err) =>
          this.logger.error(`Failed to send teams notification: ${err.message}`),
        );

      await this.slackIntegration
        .notifySlack('crm', {
          title,
          text: `${message}\n\n*Task:* ${task.title}\n*Contact:* ${task.relatedType || 'Unknown'} - ${task.relatedTo || 'None'}`,
        })
        .catch((err) =>
          this.logger.error(`Failed to send Slack notification: ${err.message}`),
        );
    }
  }
}
