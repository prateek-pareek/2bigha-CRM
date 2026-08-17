import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Fires an in-app reminder notification when a lead's `nextFollowUpAt`
 * date/time arrives. Mirrors the reminder-dispatch pattern used for
 * calendar tasks (see CrmCalendarCronService) but reads straight off the
 * Lead document instead of a linked Activity.
 */
@Injectable()
export class LeadFollowUpReminderCronService {
  private readonly logger = new Logger(LeadFollowUpReminderCronService.name);

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private readonly crmUserModel: Model<CRMUserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processFollowUpReminders() {
    const now = new Date();
    // A 24h grace window makes reminders resilient to a short cron/deploy
    // outage without replaying reminders for very stale follow-up dates.
    const graceWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const dueLeads = await this.leadModel.find({
      isDeleted: { $ne: true },
      nextFollowUpAt: { $exists: true, $ne: null, $lte: now, $gte: graceWindowStart },
      // Matches both `null` and a missing field.
      followUpReminderSentAt: null,
    });

    if (!dueLeads.length) return;

    for (const lead of dueLeads) {
      try {
        await this.sendReminder(lead);
      } catch (err: any) {
        this.logger.error(
          `Failed to send follow-up reminder for lead ${lead._id}: ${err?.message || err}`,
        );
      }
    }
  }

  private async resolveRecipient(lead: LeadDocument): Promise<CRMUserDocument | null> {
    const createdBy = (lead as any).createdBy;
    if (createdBy) {
      const byCreator = await this.crmUserModel.findById(createdBy).exec();
      if (byCreator) return byCreator;
    }

    const ownerLabel = String((lead as any).leadOwner || '').trim();
    if (!ownerLabel) return null;
    const escaped = ownerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.crmUserModel
      .findOne({
        isActive: { $ne: false },
        $or: [
          { email: new RegExp(`^${escaped}$`, 'i') },
          { firstName: new RegExp(`^${escaped}$`, 'i') },
          { lastName: new RegExp(`^${escaped}$`, 'i') },
        ],
      })
      .exec();
  }

  private async sendReminder(lead: LeadDocument) {
    // Mark first so a slow notification/email step can't cause a duplicate
    // send on the next minute's cron tick.
    await this.leadModel
      .findByIdAndUpdate(lead._id, { $set: { followUpReminderSentAt: new Date() } })
      .exec();

    const recipient = await this.resolveRecipient(lead);
    if (!recipient) {
      this.logger.warn(
        `No CRM user resolved for lead ${lead._id} follow-up reminder (owner="${(lead as any).leadOwner || ''}")`,
      );
      return;
    }

    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || 'this lead';
    const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
    const dueAt = new Date((lead as any).nextFollowUpAt).toLocaleString('en-US', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await this.notificationsService.create({
      recipient: String(recipient._id),
      title: `Follow-up reminder: ${name}`,
      message: `It's time to follow up with ${name}.\nScheduled for: ${dueAt}`,
      type: 'Reminder',
      metadata: {
        link: `/crm/leads/${lead._id}`,
        entityId: String(lead._id),
        relatedType: 'Lead',
      },
    });
  }
}
