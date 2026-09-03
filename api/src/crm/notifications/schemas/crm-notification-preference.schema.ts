import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { CrmNotifyPreferencesMap } from '../crm-notification-events';

export type CrmNotificationPreferenceDocument = CrmNotificationPreference &
  Document;

@Schema({ timestamps: true, collection: 'crm_notification_preferences' })
export class CrmNotificationPreference {
  /** HRMS user id (JWT sub) — matches NotificationsService.recipient */
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  events: CrmNotifyPreferencesMap;
}

export const CrmNotificationPreferenceSchema = SchemaFactory.createForClass(
  CrmNotificationPreference,
);
