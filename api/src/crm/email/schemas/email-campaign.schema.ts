import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type EmailCampaignDocument = EmailCampaign & Document;

export type EmailCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type EmailCampaignRecipientStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped';

@Schema({ _id: false })
export class EmailCampaignRecipient {
  @Prop({ required: true })
  email: string;

  @Prop()
  name?: string;

  @Prop({
    enum: ['leads', 'contacts', 'organizations', 'clients'],
  })
  module?: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
  })
  status: EmailCampaignRecipientStatus;

  @Prop()
  errorMessage?: string;

  @Prop()
  sentAt?: Date;

  @Prop({ type: Types.ObjectId })
  accountId?: Types.ObjectId;
}

const EmailCampaignRecipientSchema = SchemaFactory.createForClass(
  EmailCampaignRecipient,
);

@Schema({ timestamps: true })
export class EmailCampaign {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({
    required: true,
    enum: ['draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed'],
    default: 'draft',
  })
  status: EmailCampaignStatus;

  @Prop({ required: true, default: '' })
  subject: string;

  @Prop({ required: true, default: '' })
  bodyHtml: string;

  @Prop({ type: Types.ObjectId, ref: 'EmailTemplate' })
  templateId?: Types.ObjectId;

  /** When recipients were loaded from a CRM segment list. */
  @Prop({ type: Types.ObjectId, ref: 'CrmSegment' })
  segmentId?: Types.ObjectId;

  @Prop({ type: [EmailCampaignRecipientSchema], default: [] })
  recipients: EmailCampaignRecipient[];

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: true })
  enforceCrmRecipient: boolean;

  @Prop({ default: false })
  aiDraftPerRecipient: boolean;

  @Prop({ default: '' })
  aiInstructions?: string;

  @Prop({ default: true })
  retryOnSendFail: boolean;

  @Prop()
  maxEmailsPerSenderInBatch?: number;

  @Prop({ type: Object })
  mailboxSplit?: {
    mode?: 'round_robin' | 'random' | 'sticky_entity';
    accountIds?: string[];
  };

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

}

export const EmailCampaignSchema = SchemaFactory.createForClass(EmailCampaign);
applyCrmSoftDeletePlugin(EmailCampaignSchema);
EmailCampaignSchema.index({ isDeleted: 1, deletedAt: -1 });
EmailCampaignSchema.index({ createdBy: 1, status: 1, updatedAt: -1 });
EmailCampaignSchema.index({ status: 1, scheduledAt: 1 });
