import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionNotificationTrackerDocument = SubscriptionNotificationTracker & Document;

@Schema({ timestamps: true, collection: 'subscription_notification_trackers' })
export class SubscriptionNotificationTracker {
  /** userPropertyId from 2bigha */
  @Prop({ required: true, index: true, trim: true })
  userPropertyId: string;

  /** The notification type: '7days', '3days', 'expiry' */
  @Prop({
    required: true,
    enum: ['7days', '3days', 'expiry'],
    index: true,
  })
  notificationType: '7days' | '3days' | 'expiry';

  /** The end date of the subscription (from 2bigha) */
  @Prop({ required: true, index: true })
  subscriptionEndDate: Date;

  /** When this notification was sent */
  @Prop({ required: true, index: true })
  sentAt: Date;
}

export const SubscriptionNotificationTrackerSchema =
  SchemaFactory.createForClass(SubscriptionNotificationTracker);
