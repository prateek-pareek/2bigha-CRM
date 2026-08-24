import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { TeamsIntegrationService } from '../integrations/teams-integration.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import { SlackIntegrationService } from '../integrations/slack-integration.service';

@Injectable()
export class CrmCalendarCronService {
  private readonly logger = new Logger(CrmCalendarCronService.name);

  constructor(
    @InjectModel(Activity.name, 'crmConnection') private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(CRMUser.name, 'crmConnection') private readonly crmUserModel: Model<CRMUserDocument>,
    private readonly teamsIntegration: TeamsIntegrationService,
    private readonly slackIntegration: SlackIntegrationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('* * * * *') // Run every minute to accurately hit 10/30m intervals
  async processCalendarReminders() {
    // Find incomplete scheduled activities that may need a reminder.
    const tasks = await this.activityModel.find({
      type: { $in: ['Task', 'Meeting'] },
      status: { $nin: ['Completed', 'Done', 'Cancelled'] },
      $or: [
        { 'metadata.isCalendarEvent': true },
        { 'metadata.reminderAt': { $exists: true, $ne: null } },
      ],
      'metadata.dueDate': { $exists: true, $ne: null },
    });

    if (!tasks || tasks.length === 0) return;

    const now = new Date();

    for (const task of tasks) {
      // New calendar events can explicitly opt out of reminders.
      if (task.metadata.reminderDisabled) continue;

      const dueDate = new Date(task.metadata.dueDate);
      const configuredReminderAt = task.metadata.reminderAt
        ? new Date(task.metadata.reminderAt)
        : null;
      const hasConfiguredReminder = Boolean(
        configuredReminderAt &&
          !Number.isNaN(configuredReminderAt.getTime()),
      );
      const reminderTarget = hasConfiguredReminder
        ? configuredReminderAt!
        : dueDate;
      const diffMs = reminderTarget.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 1000 / 60);

      const sentReminders = Array.isArray(task.metadata.remindersSent)
        ? task.metadata.remindersSent
        : [];

      let reminderToPush: string | null = null;
      let reminderLabel = '';

      // Do not run legacy fixed-interval reminders for explicitly scheduled events.
      if (hasConfiguredReminder && diffMins > 0) continue;

      // User-selected follow-up or exact custom reminder. A 24-hour overdue
      // window makes reminders resilient to a short deployment/cron outage.
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
      }
      // Check intervals (allowing a small window so we don't miss it if cron skips a second)
      // 1 week before (7 days = 10080 mins)
      else if (diffMins <= 10080 && diffMins > 10080 - 1440 && !sentReminders.includes('1w')) {
        reminderToPush = '1w';
        reminderLabel = '1 week';
      }
      // 2 days before (2880 mins)
      else if (diffMins <= 2880 && diffMins > 1440 && !sentReminders.includes('2d')) {
        reminderToPush = '2d';
        reminderLabel = '2 days';
      }
      // 1 day before (1440 mins)
      else if (diffMins <= 1440 && diffMins > 360 && !sentReminders.includes('1d')) {
        reminderToPush = '1d';
        reminderLabel = '1 day';
      }
      // On the day of the task (Triggered if we reach midnight of the due date day)
      // We'll approximate this by checking if it's the same calendar day, but simpler is to use a 12h check
      // For precision, let's just use 8h window if it hasn't fired
      else if (diffMins <= 720 && diffMins > 360 && !sentReminders.includes('day_of')) {
        reminderToPush = 'day_of';
        reminderLabel = 'Today';
      }
      // 6 hours before (360 mins)
      else if (diffMins <= 360 && diffMins > 180 && !sentReminders.includes('6h')) {
        reminderToPush = '6h';
        reminderLabel = '6 hours';
      }
      // 3 hours before (180 mins)
      else if (diffMins <= 180 && diffMins > 60 && !sentReminders.includes('3h')) {
        reminderToPush = '3h';
        reminderLabel = '3 hours';
      }
      // 1 hour before (60 mins)
      else if (diffMins <= 60 && diffMins > 30 && !sentReminders.includes('1h')) {
        reminderToPush = '1h';
        reminderLabel = '1 hour';
      }
      // 30 mins before (30 mins)
      else if (diffMins <= 30 && diffMins > 10 && !sentReminders.includes('30m')) {
        reminderToPush = '30m';
        reminderLabel = '30 minutes';
      }
      // 10 mins before (10 mins)
      else if (diffMins <= 10 && diffMins >= -10 && !sentReminders.includes('10m')) {
        reminderToPush = '10m';
        reminderLabel = '10 minutes';
      }

      if (reminderToPush) {
        sentReminders.push(reminderToPush);

        // Update the task to prevent duplicate sending
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
        const title = `${reminderType} Reminder: ${task.title}`;
        const customMessage = String(
          task.metadata.reminderMessage || '',
        ).trim();
        const message = hasConfiguredReminder
          ? `${customMessage || `${reminderLabel} for your calendar event.`}\nEvent due at: ${formattedDueDate}`
          : `Your calendar task is due in ${reminderLabel}.\nDue at: ${formattedDueDate}`;

        let link = '/crm/tasks';
        const relatedId = task.relatedTo ? String(task.relatedTo) : '';
        const relatedType = String(task.relatedType || '').toLowerCase();
        if (relatedId && Types.ObjectId.isValid(relatedId)) {
          if (relatedType === 'lead') link = `/crm/leads/${relatedId}`;
          else if (relatedType === 'contact')
            link = `/crm/contacts/${relatedId}`;
          else if (relatedType === 'client')
            link = `/crm/clients/${relatedId}`;
          else if (relatedType === 'organization')
            link = `/crm/organizations/${relatedId}`;
        }

        // Resolve author to get the recipient for in-app notifications.
        const ownerId = task.assignee || task.author;
        const recipientLabel = String(
          task.metadata.reminderRecipientLabel || '',
        ).trim();
        const escapedLabel = recipientLabel.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        );
        const owner = ownerId
          ? await this.crmUserModel.findById(ownerId)
          : recipientLabel
            ? await this.crmUserModel.findOne({
                isActive: { $ne: false },
                $or: [
                  { email: new RegExp(`^${escapedLabel}$`, 'i') },
                  { firstName: new RegExp(`^${escapedLabel}$`, 'i') },
                  { lastName: new RegExp(`^${escapedLabel}$`, 'i') },
                ],
              })
            : null;
        if (owner) {
          await this.notificationsService.create({
            recipient: String(owner._id),
            title,
            message,
            type: 'Reminder',
            metadata: {
              link,
              entityId: relatedId || undefined,
              relatedType: task.relatedType,
            },
          }).catch(err => this.logger.error(`Failed to send in-app notification: ${err.message}`));
        }

        // Channel notifications do not require an individually resolved CRM owner.
        await this.teamsIntegration.notifyTeams('crm', {
          title,
          text: `${message}\n\nTask: ${task.title}\nContact: ${task.relatedType || 'Unknown'} - ${task.relatedTo || 'None'}`,
        }).catch(err => this.logger.error(`Failed to send teams notification: ${err.message}`));

        await this.slackIntegration.notifySlack('crm', {
          title,
          text: `${message}\n\n*Task:* ${task.title}\n*Contact:* ${task.relatedType || 'Unknown'} - ${task.relatedTo || 'None'}`,
        }).catch(err => this.logger.error(`Failed to send Slack notification: ${err.message}`));
      }
    }
  }
}
