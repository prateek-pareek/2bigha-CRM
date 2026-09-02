import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from '../schemas/activity.schema';

export type PmActivityEventType =
  | 'pm_payment_order_created'
  | 'pm_payment_verified'
  | 'pm_payment_failed'
  | 'pm_property_created'
  | 'pm_sync_success'
  | 'pm_sync_failed';

export interface LogPmActivityInput {
  leadId?: string;
  propertyListingId?: string;
  authorId?: string;
  eventType: PmActivityEventType;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface PmActivityEntry {
  id: string;
  eventType: PmActivityEventType | string;
  title: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PmActivityLogService {
  constructor(
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
  ) {}

  async log(input: LogPmActivityInput): Promise<void> {
    const involved: { id: Types.ObjectId; type: string }[] = [];
    let relatedTo: Types.ObjectId | undefined;
    let relatedType: string | undefined;

    if (input.leadId && Types.ObjectId.isValid(input.leadId)) {
      const leadOid = new Types.ObjectId(input.leadId);
      involved.push({ id: leadOid, type: 'Lead' });
      relatedTo = leadOid;
      relatedType = 'Lead';
    }
    if (input.propertyListingId && Types.ObjectId.isValid(input.propertyListingId)) {
      involved.push({ id: new Types.ObjectId(input.propertyListingId), type: 'PropertyListing' });
      if (!relatedTo) {
        relatedTo = new Types.ObjectId(input.propertyListingId);
        relatedType = 'PropertyListing';
      }
    }

    const author =
      input.authorId && Types.ObjectId.isValid(input.authorId)
        ? new Types.ObjectId(input.authorId)
        : undefined;

    await this.activityModel.create({
      type: 'System',
      title: input.title,
      content: input.content,
      relatedTo,
      relatedType,
      author,
      metadata: {
        pmEvent: true,
        eventType: input.eventType,
        leadId: input.leadId,
        propertyListingId: input.propertyListingId,
        ...(input.metadata || {}),
      },
      involvedEntities: involved,
    });
  }

  async listForLead(leadId: string, limit = 30): Promise<PmActivityEntry[]> {
    if (!Types.ObjectId.isValid(leadId)) return [];
    const leadOid = new Types.ObjectId(leadId);
    const rows = await this.activityModel
      .find({
        isDeleted: { $ne: true },
        'metadata.pmEvent': true,
        $or: [{ relatedTo: leadOid }, { 'involvedEntities.id': leadOid }],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map((row) => this.toEntry(row));
  }

  async listForProperty(propertyListingId: string, limit = 30): Promise<PmActivityEntry[]> {
    if (!Types.ObjectId.isValid(propertyListingId)) return [];
    const propOid = new Types.ObjectId(propertyListingId);
    const rows = await this.activityModel
      .find({
        isDeleted: { $ne: true },
        'metadata.pmEvent': true,
        $or: [
          { relatedTo: propOid },
          { 'involvedEntities.id': propOid },
          { 'metadata.propertyListingId': propertyListingId },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map((row) => this.toEntry(row));
  }

  private toEntry(row: Record<string, any>): PmActivityEntry {
    return {
      id: String(row._id),
      eventType: row.metadata?.eventType || 'pm_event',
      title: row.title || 'PM event',
      content: row.content || '',
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      metadata: row.metadata,
    };
  }
}
