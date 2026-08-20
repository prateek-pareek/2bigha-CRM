import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type WhatsAppCampaignDocument = WhatsAppCampaign & Document;

export type WhatsAppCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type WhatsAppCampaignRecipientStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped';

@Schema({ _id: false })
export class WhatsAppCampaignRecipient {
  @Prop({ required: true })
  waId: string; // digits-only phone number

  @Prop()
  name?: string;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  /** Ordered values for the template's {{1}}, {{2}}... placeholders. */
  @Prop({ type: [String], default: [] })
  templateParams: string[];

  @Prop({
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  status: WhatsAppCampaignRecipientStatus;

  @Prop()
  errorMessage?: string;

  @Prop()
  providerMessageId?: string;

  @Prop()
  sentAt?: Date;
}

const WhatsAppCampaignRecipientSchema = SchemaFactory.createForClass(
  WhatsAppCampaignRecipient,
);

/**
 * A bulk/segmented WhatsApp template send — mirrors EmailCampaign's shape
 * (recipients embedded, cron-driven scheduling, soft delete) but adds
 * `throttlePerMinute` since WhatsApp BSPs rate-limit sends much more
 * aggressively than SMTP does. Sending currently runs in-process
 * (fire-and-forget from `launch()`, throttled via a delay loop) — for very
 * large audiences this should move to a real job queue, but that's
 * overkill at this CRM's current scale.
 */
@Schema({ timestamps: true })
export class WhatsAppCampaign {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({
    required: true,
    enum: ['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed'],
    default: 'draft',
  })
  status: WhatsAppCampaignStatus;

  @Prop({ type: Types.ObjectId, ref: 'WhatsAppTemplate', required: true })
  templateId: Types.ObjectId;

  // Denormalized from the template at launch time so a later template edit
  // doesn't retroactively change what an already-running/completed
  // campaign claims it sent.
  @Prop({ required: true })
  templateName: string;

  @Prop({ required: true })
  aisensyCampaignName: string;

  @Prop({ type: [WhatsAppCampaignRecipientSchema], default: [] })
  recipients: WhatsAppCampaignRecipient[];

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser', required: true })
  createdBy: Types.ObjectId;

  /** Sends per minute — kept conservative by default; AiSensy/WhatsApp rate-limit aggressively. */
  @Prop({ default: 60, min: 1, max: 1000 })
  throttlePerMinute: number;

  @Prop({ default: 0 })
  totalRecipients: number;

  @Prop({ default: 0 })
  sentCount: number;

  @Prop({ default: 0 })
  failedCount: number;

  @Prop()
  lastError?: string;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

  @Prop()
  mediaUrl?: string;

  @Prop()
  mediaFilename?: string;
}

export const WhatsAppCampaignSchema = SchemaFactory.createForClass(WhatsAppCampaign);
applyCrmSoftDeletePlugin(WhatsAppCampaignSchema);
WhatsAppCampaignSchema.index({ isDeleted: 1, deletedAt: -1 });
WhatsAppCampaignSchema.index({ createdBy: 1, status: 1, updatedAt: -1 });
WhatsAppCampaignSchema.index({ status: 1, scheduledAt: 1 });
