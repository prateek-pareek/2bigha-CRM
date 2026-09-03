import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';
import type { CrmNotifyEvent } from '../notifications/crm-notification-events';

/**
 * Lead follow-up / intent reminders:
 * - upcoming (~1h before nextFollowUpAt)
 * - due (nextFollowUpAt reached)
 * - overdue (past due, still open — daily nudge within a window)
 * - intent follow-up (leadIntentFollowUpAt reached)
 *
 * Recipients resolve to HRMS user ids via CrmNotifyService (bell + optional email).
 */
@Injectable()
export class LeadFollowUpReminderCronService {
  private readonly logger = new Logger(LeadFollowUpReminderCronService.name);
  private running = false;

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processFollowUpReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.processUpcoming(now);
      await this.processDue(now);
      await this.processOverdue(now);
      await this.processIntentDue(now);
    } finally {
      this.running = false;
    }
  }

  private leadHint(lead: LeadDocument) {
    return {
      userId: (lead as any).createdBy,
      label: String((lead as any).leadOwner || '').trim() || undefined,
    };
  }

  private leadName(lead: LeadDocument) {
    return (
      [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() ||
      'this lead'
    );
  }

  private formatDue(d: Date) {
    const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
    return d.toLocaleString('en-US', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  private async notifyLead(
    lead: LeadDocument,
    event: CrmNotifyEvent,
    title: string,
    message: string,
    sentField: string,
  ) {
    await this.leadModel
      .findByIdAndUpdate(lead._id, { $set: { [sentField]: new Date() } })
      .exec();

    const link = `/crm/leads/${lead._id}`;
    const delivered = await this.crmNotify.notify({
      event,
      title,
      message,
      recipient: this.leadHint(lead),
      link,
      metadata: {
        link,
        entityId: String(lead._id),
        relatedType: 'Lead',
      },
      type: event.includes('overdue') ? 'OVERDUE_FOLLOWUP' : 'Reminder',
    });

    if (!delivered.length) {
      this.logger.warn(
        `No HRMS recipient for lead ${lead._id} (${event}, owner="${(lead as any).leadOwner || ''}")`,
      );
    }
  }

  /** ~60 minutes before due (window 45–75 min to absorb cron jitter). */
  private async processUpcoming(now: Date) {
    const windowStart = new Date(now.getTime() + 45 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 75 * 60 * 1000);
    const leads = await this.leadModel.find({
      isDeleted: { $ne: true },
      nextFollowUpAt: { $gte: windowStart, $lte: windowEnd },
      followUpUpcomingReminderSentAt: null,
    });
    for (const lead of leads) {
      try {
        const due = new Date((lead as any).nextFollowUpAt);
        await this.notifyLead(
          lead,
          'lead_follow_up_upcoming',
          `Upcoming follow-up: ${this.leadName(lead)}`,
          `Follow-up with ${this.leadName(lead)} is due soon.\nScheduled for: ${this.formatDue(due)}`,
          'followUpUpcomingReminderSentAt',
        );
      } catch (err: any) {
        this.logger.error(
          `Upcoming follow-up failed for ${lead._id}: ${err?.message || err}`,
        );
      }
    }
  }

  private async processDue(now: Date) {
    const graceStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const leads = await this.leadModel.find({
      isDeleted: { $ne: true },
      nextFollowUpAt: { $exists: true, $ne: null, $lte: now, $gte: graceStart },
      followUpReminderSentAt: null,
    });
    for (const lead of leads) {
      try {
        const due = new Date((lead as any).nextFollowUpAt);
        await this.notifyLead(
          lead,
          'lead_follow_up_due',
          `Follow-up due: ${this.leadName(lead)}`,
          `It's time to follow up with ${this.leadName(lead)}.\nScheduled for: ${this.formatDue(due)}`,
          'followUpReminderSentAt',
        );
      } catch (err: any) {
        this.logger.error(
          `Due follow-up failed for ${lead._id}: ${err?.message || err}`,
        );
      }
    }
  }

  /**
   * Overdue nudge: follow-up was due 1–7 days ago, due reminder already sent
   * (or missed), and we haven't sent an overdue nudge yet for this date.
   */
  private async processOverdue(now: Date) {
    const overdueStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const overdueEnd = new Date(now.getTime() - 60 * 60 * 1000);
    const leads = await this.leadModel.find({
      isDeleted: { $ne: true },
      nextFollowUpAt: {
        $exists: true,
        $ne: null,
        $lte: overdueEnd,
        $gte: overdueStart,
      },
      followUpOverdueReminderSentAt: null,
    });
    for (const lead of leads) {
      try {
        const due = new Date((lead as any).nextFollowUpAt);
        await this.notifyLead(
          lead,
          'lead_follow_up_overdue',
          `Overdue follow-up: ${this.leadName(lead)}`,
          `Follow-up with ${this.leadName(lead)} is overdue.\nWas scheduled for: ${this.formatDue(due)}`,
          'followUpOverdueReminderSentAt',
        );
      } catch (err: any) {
        this.logger.error(
          `Overdue follow-up failed for ${lead._id}: ${err?.message || err}`,
        );
      }
    }
  }

  private async processIntentDue(now: Date) {
    const graceStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const leads = await this.leadModel.find({
      isDeleted: { $ne: true },
      leadIntentFollowUpAt: {
        $exists: true,
        $ne: null,
        $lte: now,
        $gte: graceStart,
      },
      intentFollowUpReminderSentAt: null,
    });
    for (const lead of leads) {
      try {
        const due = new Date((lead as any).leadIntentFollowUpAt);
        const intents = Array.isArray((lead as any).leadIntents)
          ? (lead as any).leadIntents.join(', ')
          : '';
        await this.notifyLead(
          lead,
          'lead_intent_follow_up',
          `Intent follow-up: ${this.leadName(lead)}`,
          `Lead intent follow-up is due for ${this.leadName(lead)}${intents ? ` (${intents})` : ''}.\nScheduled for: ${this.formatDue(due)}`,
          'intentFollowUpReminderSentAt',
        );
      } catch (err: any) {
        this.logger.error(
          `Intent follow-up failed for ${lead._id}: ${err?.message || err}`,
        );
      }
    }
  }
}
