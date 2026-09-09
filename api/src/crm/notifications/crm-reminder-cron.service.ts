import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CrmRemindersService } from './crm-reminders.service';
import { CrmNotifyService } from './crm-notify.service';

@Injectable()
export class CrmReminderCronService {
  private readonly logger = new Logger(CrmReminderCronService.name);
  private running = false;

  constructor(
    private readonly remindersService: CrmRemindersService,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processCustomReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.remindersService.findDue();
      for (const reminder of due) {
        try {
          const relatedId = String(reminder.relatedTo);
          let link = '/crm/notifications';
          const t = reminder.relatedType;
          if (t === 'Lead') link = `/crm/leads/${relatedId}`;
          else if (t === 'Client') link = `/crm/clients/${relatedId}`;
          else if (t === 'Contact') link = `/crm/contacts/${relatedId}`;
          else if (t === 'Organization') link = `/crm/organizations/${relatedId}`;
          else if (t === 'Task') link = `/crm/tasks`;

          const medium = String((reminder as any).medium || '').toLowerCase();
          const mediumLabel =
            medium === 'whatsapp'
              ? 'WhatsApp'
              : medium === 'email'
                ? 'Email'
                : medium === 'later'
                  ? 'decide later'
                  : '';
          const isFollowUpReminder =
            medium === 'email' || medium === 'whatsapp' || medium === 'later';
          const dueMessage = isFollowUpReminder
            ? medium === 'later'
              ? `Time to follow up — choose Email or WhatsApp${
                  reminder.description ? ` — ${reminder.description}` : ''
                }`
              : `Time to follow up via ${mediumLabel}${
                  reminder.description ? ` — ${reminder.description}` : ''
                }`
            : reminder.description ||
              `Reminder for ${reminder.relatedType}: ${reminder.title}`;

          await this.crmNotify.notify({
            event: isFollowUpReminder ? 'follow_up_reminder' : 'custom_reminder',
            title: isFollowUpReminder
              ? medium === 'later'
                ? 'Follow up now'
                : `Follow up via ${mediumLabel}`
              : reminder.title,
            message: dueMessage,
            recipient: {
              userId: reminder.assigneeUserId || reminder.createdBy,
            },
            link,
            metadata: {
              reminderId: String(reminder._id),
              relatedType: reminder.relatedType,
              entityId: relatedId,
              medium: medium || null,
              link,
            },
            type: 'Reminder',
          });

          await this.remindersService.afterNotified(reminder);
        } catch (err: any) {
          this.logger.error(
            `Custom reminder ${reminder._id} failed: ${err?.message || err}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
