import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PropertyListing, PropertyListingDocument } from '../property-listings/schemas/property-listing.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';
import { TwoBighaSubscriptionsService } from './twobigha-subscriptions.service';
import {
  SubscriptionNotificationTracker,
  SubscriptionNotificationTrackerDocument,
} from './schemas/subscription-notification-tracker.schema';

@Injectable()
export class SubscriptionPlanExpiryCronService {
  private readonly logger = new Logger(SubscriptionPlanExpiryCronService.name);
  private running = false;

  constructor(
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly listingModel: Model<PropertyListingDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(SubscriptionNotificationTracker.name, 'crmConnection')
    private readonly trackerModel: Model<SubscriptionNotificationTrackerDocument>,
    private readonly subscriptions: TwoBighaSubscriptionsService,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processSubscriptionExpiryNotifications() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.process7DaysBeforeExpiry(now);
      await this.process3DaysBeforeExpiry(now);
      await this.processDayOfExpiry(now);
    } catch (err: any) {
      this.logger.error(`Subscription expiry cron failed: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }

  private getCallingAgent(lead: LeadDocument) {
    return {
      userId: (lead as any).createdBy,
      label: String((lead as any).leadOwner || '').trim() || undefined,
    };
  }

  private async notifySubscriptionExpiry(
    userPropertyId: string,
    lead: LeadDocument | null,
    listing: PropertyListingDocument | null,
    notificationType: '7days' | '3days' | 'expiry',
    planName: string,
    endDate: Date,
    title: string,
    message: string,
  ) {
    if (!lead) {
      this.logger.warn(`No lead found for property ${userPropertyId}, skipping notification`);
      return;
    }

    const link = listing ? `/crm/property-listings/${listing._id}` : '/crm/property-listings';

    const delivered = await this.crmNotify.notify({
      event: 'subscription_plan_expiring',
      title,
      message,
      recipient: this.getCallingAgent(lead),
      link,
      metadata: {
        link,
        userPropertyId,
        entityId: listing ? String(listing._id) : userPropertyId,
        relatedType: 'PropertyListing',
        leadId: String(lead._id),
        notificationType,
      },
      type: 'SubscriptionExpiry',
    });

    if (delivered.length) {
      await this.trackerModel.create({
        userPropertyId,
        notificationType,
        subscriptionEndDate: endDate,
        sentAt: new Date(),
      });
    } else {
      this.logger.warn(
        `No recipient for subscription ${userPropertyId} (calling agent: ${(lead as any).leadOwner || 'unknown'})`,
      );
    }
  }

  private async checkAndNotify(
    now: Date,
    notificationType: '7days' | '3days' | 'expiry',
    getDaysOffset: () => { start: number; end: number },
  ) {
    try {
      const daysOffset = getDaysOffset();
      const windowStart = new Date(now.getTime() + daysOffset.start * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + daysOffset.end * 24 * 60 * 60 * 1000);

      const listings = await this.listingModel
        .find({
          isDeleted: { $ne: true },
          userPropertyId: { $exists: true, $ne: null },
          leadId: { $exists: true, $ne: null },
        })
        .select('_id userPropertyId leadId')
        .lean()
        .exec();

      for (const listing of listings) {
        try {
          const userPropertyId = listing.userPropertyId as string;
          const leadId = listing.leadId;

          const alreadyNotified = await this.trackerModel
            .findOne({
              userPropertyId,
              notificationType,
            })
            .sort({ sentAt: -1 })
            .lean()
            .exec();

          if (alreadyNotified) {
            const daysSinceSent = (new Date().getTime() - alreadyNotified.sentAt.getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceSent < 1) continue;
          }

          const plan = await this.subscriptions.getActivePropertyPlan(userPropertyId);
          if (!plan || !plan.endDate) continue;

          const endDate = new Date(plan.endDate);
          if (endDate < windowStart || endDate > windowEnd) continue;

          const lead = await this.leadModel
            .findById(leadId)
            .select('_id createdBy leadOwner')
            .lean()
            .exec();

          let title = '';
          let message = '';

          if (notificationType === '7days') {
            title = `Subscription plan expiring soon: ${plan.planName}`;
            message = `The subscription plan "${plan.planName}" for property will expire in 7 days.\nExpiry date: ${endDate.toLocaleDateString()}`;
          } else if (notificationType === '3days') {
            title = `Subscription plan expiring soon: ${plan.planName}`;
            message = `The subscription plan "${plan.planName}" for property will expire in 3 days.\nExpiry date: ${endDate.toLocaleDateString()}`;
          } else {
            title = `Subscription plan expires today: ${plan.planName}`;
            message = `The subscription plan "${plan.planName}" for property expires today.`;
          }

          await this.notifySubscriptionExpiry(
            userPropertyId,
            lead as LeadDocument | null,
            listing as PropertyListingDocument,
            notificationType,
            plan.planName,
            endDate,
            title,
            message,
          );
        } catch (err: any) {
          this.logger.error(
            `Subscription expiry check failed for ${listing.userPropertyId}: ${err?.message || err}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Subscription ${notificationType} expiry process failed: ${err?.message || err}`);
    }
  }

  /** 7 days before expiry. */
  private async process7DaysBeforeExpiry(now: Date) {
    await this.checkAndNotify(now, '7days', () => ({ start: 6.5, end: 7.5 }));
  }

  /** 3 days before expiry. */
  private async process3DaysBeforeExpiry(now: Date) {
    await this.checkAndNotify(now, '3days', () => ({ start: 2.5, end: 3.5 }));
  }

  /** Day of expiry. */
  private async processDayOfExpiry(now: Date) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const dayStartOffset = dayStart.getTime() - now.getTime();
    const dayEndOffset = dayEnd.getTime() - now.getTime();
    const startDays = dayStartOffset / (24 * 60 * 60 * 1000);
    const endDays = dayEndOffset / (24 * 60 * 60 * 1000);

    await this.checkAndNotify(now, 'expiry', () => ({ start: startDays, end: endDays }));
  }
}
