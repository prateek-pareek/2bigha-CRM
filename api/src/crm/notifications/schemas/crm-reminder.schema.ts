import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmReminderDocument = CrmReminder & Document;

export type CrmReminderRelatedType =
  | 'Lead'
  | 'Client'
  | 'Contact'
  | 'Task'
  | 'Organization';

export type CrmReminderStatus =
  | 'PENDING'
  | 'DONE'
  | 'CANCELLED'
  | 'NOTIFIED';

export type CrmReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

/** How the assignee should follow up with the contact when the reminder fires. */
export type CrmReminderMedium = 'email' | 'whatsapp' | 'later';

@Schema({ timestamps: true, collection: 'crm_reminders' })
export class CrmReminder {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    required: true,
    enum: ['Lead', 'Client', 'Contact', 'Task', 'Organization'],
    index: true,
  })
  relatedType: CrmReminderRelatedType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  relatedTo: Types.ObjectId;

  /** When the reminder should fire (date + time). */
  @Prop({ type: Date, required: true, index: true })
  scheduledAt: Date;

  /**
   * Next fire time (equals scheduledAt until notified; advanced on recurrence).
   */
  @Prop({ type: Date, required: true, index: true })
  nextFireAt: Date;

  @Prop({
    default: 'PENDING',
    enum: ['PENDING', 'DONE', 'CANCELLED', 'NOTIFIED'],
    index: true,
  })
  status: CrmReminderStatus;

  @Prop({
    default: 'none',
    enum: ['none', 'daily', 'weekly', 'monthly'],
  })
  recurrence: CrmReminderRecurrence;

  /**
   * Follow-up medium chosen by the employee (email or WhatsApp).
   * When set, this is a follow-up reminder (notify assignee — do not auto-send).
   */
  @Prop({ enum: ['email', 'whatsapp', 'later'], index: true })
  medium?: CrmReminderMedium;

  /** HRMS user who created the reminder. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdBy: Types.ObjectId;

  /** Who receives the notification — defaults to createdBy. */
  @Prop({ type: Types.ObjectId, index: true })
  assigneeUserId?: Types.ObjectId;

  @Prop()
  lastNotifiedAt?: Date;

  @Prop({ trim: true })
  createdByName?: string;
}

export const CrmReminderSchema = SchemaFactory.createForClass(CrmReminder);
CrmReminderSchema.index({ status: 1, nextFireAt: 1 });
CrmReminderSchema.index({ createdBy: 1, status: 1, nextFireAt: 1 });
CrmReminderSchema.index({ assigneeUserId: 1, status: 1, nextFireAt: 1 });
