import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CallLog, CallLogDocument } from '../ivr/schemas/call-log.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';

/**
 * Fires when CallLog.callbackScheduledAt is due — notifies the agent who
 * initiated/logged the call (HRMS id on initiatedByUserId).
 */
@Injectable()
export class CallbackReminderCronService {
  private readonly logger = new Logger(CallbackReminderCronService.name);
  private running = false;

  constructor(
    @InjectModel(CallLog.name, 'crmConnection')
    private readonly callLogModel: Model<CallLogDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processCallbackReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const graceStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const due = await this.callLogModel.find({
        callbackScheduledAt: {
          $exists: true,
          $ne: null,
          $lte: now,
          $gte: graceStart,
        },
        callbackReminderSentAt: null,
      });

      for (const row of due) {
        try {
          await this.callLogModel
            .findByIdAndUpdate(row._id, {
              $set: { callbackReminderSentAt: new Date() },
            })
            .exec();

          const customer =
            String(row.customerName || '').trim() ||
            String(row.customerNumber || '').trim() ||
            'customer';
          const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
          const dueAt = new Date(row.callbackScheduledAt as Date).toLocaleString(
            'en-US',
            { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' },
          );

          let link = '/crm/ivr';
          const relatedId = row.relatedTo ? String(row.relatedTo) : '';
          const relatedType = String(row.relatedType || '').toLowerCase();
          if (relatedId) {
            if (relatedType === 'lead') link = `/crm/leads/${relatedId}`;
            else if (relatedType === 'contact')
              link = `/crm/contacts/${relatedId}`;
            else if (relatedType === 'client')
              link = `/crm/clients/${relatedId}`;
          }

          const delivered = await this.crmNotify.notify({
            event: 'callback_due',
            title: `Callback due: ${customer}`,
            message: `Scheduled callback with ${customer} is due.\nScheduled for: ${dueAt}`,
            recipient: {
              userId: row.initiatedByUserId,
              label: row.agentName,
            },
            link,
            metadata: {
              link,
              callLogId: String(row._id),
              entityId: relatedId || undefined,
              relatedType: row.relatedType,
            },
            type: 'MISSED_CALLBACK',
          });

          if (!delivered.length) {
            this.logger.warn(
              `No recipient for callback reminder on call log ${row._id}`,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Callback reminder failed for ${row._id}: ${err?.message || err}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
