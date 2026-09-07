import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PropertyListing, PropertyListingDocument } from './schemas/property-listing.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { CrmNotifyService } from '../notifications/crm-notify.service';

@Injectable()
export class PropertyListingExpiryCronService {
  private readonly logger = new Logger(PropertyListingExpiryCronService.name);
  private running = false;

  constructor(
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly listingModel: Model<PropertyListingDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    private readonly crmNotify: CrmNotifyService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processListingExpiryNotifications() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.process7DaysBeforeExpiry(now);
      await this.process3DaysBeforeExpiry(now);
      await this.processDayOfExpiry(now);
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

  private listingTitle(listing: PropertyListingDocument) {
    return listing.title || 'Untitled property';
  }

  private async notifyExpiry(
    listing: PropertyListingDocument,
    lead: LeadDocument | null,
    sentField: string,
    title: string,
    message: string,
  ) {
    if (!lead) {
      this.logger.warn(`No lead found for property listing ${listing._id}, skipping notification`);
      return;
    }

    await this.listingModel
      .findByIdAndUpdate(listing._id, { $set: { [sentField]: new Date() } })
      .exec();

    const link = `/crm/property-listings/${listing._id}`;
    const delivered = await this.crmNotify.notify({
      event: 'property_listing_expiring',
      title,
      message,
      recipient: this.getCallingAgent(lead),
      link,
      metadata: {
        link,
        entityId: String(listing._id),
        relatedType: 'PropertyListing',
        leadId: String(lead._id),
      },
      type: 'PropertyExpiry',
    });

    if (!delivered.length) {
      this.logger.warn(
        `No recipient for property ${listing._id} (calling agent: ${(lead as any).leadOwner || 'unknown'})`,
      );
    }
  }

  /** 7 days before expiry. */
  private async process7DaysBeforeExpiry(now: Date) {
    const windowStart = new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000);

    const listings = await this.listingModel.find({
      isDeleted: { $ne: true },
      listingExpiryDate: { $gte: windowStart, $lte: windowEnd },
      expiryNotification7DaysSentAt: null,
      leadId: { $exists: true, $ne: null },
    });

    for (const listing of listings) {
      try {
        const lead = await this.leadModel
          .findById((listing as any).leadId)
          .select('_id createdBy leadOwner')
          .lean()
          .exec();

        const expiryDate = new Date((listing as any).listingExpiryDate);
        await this.notifyExpiry(
          listing,
          lead as LeadDocument | null,
          'expiryNotification7DaysSentAt',
          `Property listing expiring soon: ${this.listingTitle(listing)}`,
          `The property "${this.listingTitle(listing)}" will expire in 7 days.\nExpiry date: ${expiryDate.toLocaleDateString()}`,
        );
      } catch (err: any) {
        this.logger.error(`7-day expiry check failed for ${listing._id}: ${err?.message || err}`);
      }
    }
  }

  /** 3 days before expiry. */
  private async process3DaysBeforeExpiry(now: Date) {
    const windowStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    const listings = await this.listingModel.find({
      isDeleted: { $ne: true },
      listingExpiryDate: { $gte: windowStart, $lte: windowEnd },
      expiryNotification3DaysSentAt: null,
      leadId: { $exists: true, $ne: null },
    });

    for (const listing of listings) {
      try {
        const lead = await this.leadModel
          .findById((listing as any).leadId)
          .select('_id createdBy leadOwner')
          .lean()
          .exec();

        const expiryDate = new Date((listing as any).listingExpiryDate);
        await this.notifyExpiry(
          listing,
          lead as LeadDocument | null,
          'expiryNotification3DaysSentAt',
          `Property listing expiring soon: ${this.listingTitle(listing)}`,
          `The property "${this.listingTitle(listing)}" will expire in 3 days.\nExpiry date: ${expiryDate.toLocaleDateString()}`,
        );
      } catch (err: any) {
        this.logger.error(`3-day expiry check failed for ${listing._id}: ${err?.message || err}`);
      }
    }
  }

  /** Day of expiry. */
  private async processDayOfExpiry(now: Date) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const listings = await this.listingModel.find({
      isDeleted: { $ne: true },
      listingExpiryDate: { $gte: dayStart, $lte: dayEnd },
      expiryNotificationDaySentAt: null,
      leadId: { $exists: true, $ne: null },
    });

    for (const listing of listings) {
      try {
        const lead = await this.leadModel
          .findById((listing as any).leadId)
          .select('_id createdBy leadOwner')
          .lean()
          .exec();

        const expiryDate = new Date((listing as any).listingExpiryDate);
        await this.notifyExpiry(
          listing,
          lead as LeadDocument | null,
          'expiryNotificationDaySentAt',
          `Property listing expires today: ${this.listingTitle(listing)}`,
          `The property "${this.listingTitle(listing)}" expires today.`,
        );
      } catch (err: any) {
        this.logger.error(`Day-of expiry check failed for ${listing._id}: ${err?.message || err}`);
      }
    }
  }
}
