import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailTrackingDocument = EmailTracking & Document;

/**
 * Per-send tracking for outbound CRM email: tracking pixel (opens) and wrapped links (clicks).
 * Applies to inbox sends, workflow “send email template” actions, and other paths that use EmailTrackingService.
 */
@Schema({ timestamps: true })
export class EmailTracking {
  @Prop({ required: true, unique: true })
  trackingToken: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserEmailAccount' })
  accountId?: Types.ObjectId; // when sent via inbox

  @Prop({ type: Types.ObjectId, ref: 'Email' })
  emailId?: Types.ObjectId; // when sent via communications

  @Prop({ required: true })
  recipient: string;

  @Prop()
  subject: string;

  @Prop()
  module: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  /** When sent from a workflow / template automation */
  @Prop({ type: Types.ObjectId, ref: 'EmailTemplate' })
  templateId?: Types.ObjectId;

  /** Sending mailbox address (inbox account or SMTP from), for deliverability / identity reporting */
  @Prop()
  fromEmail?: string;

  /**
   * Provider RFC Message-ID (no angle brackets). Used to match In-Reply-To / References
   * for Graph sends that cannot set our custom SMTP Message-ID shape.
   */
  @Prop()
  rfcMessageId?: string;

  @Prop({ default: 0 })
  openCount: number;

  @Prop()
  lastOpenedAt: Date;

  @Prop({ type: [{ url: String, clickedAt: Date }], default: [] })
  clicks: Array<{ url: string; clickedAt: Date }>;
}

export const EmailTrackingSchema = SchemaFactory.createForClass(EmailTracking);
EmailTrackingSchema.index({ entityId: 1, module: 1 });
EmailTrackingSchema.index({ userId: 1, createdAt: -1 });
EmailTrackingSchema.index({ templateId: 1, createdAt: -1 });
EmailTrackingSchema.index({ lastOpenedAt: 1 });
EmailTrackingSchema.index({ rfcMessageId: 1 }, { sparse: true });
