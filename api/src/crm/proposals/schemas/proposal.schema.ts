import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ProposalDocument = CrmProposal & Document;

@Schema({ timestamps: true, collection: 'crm_proposals' })
export class CrmProposal {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: ['proposal', 'quotation', 'contract'] })
  kind: string;

  /** PDF/DOCX letterhead: company (logo + footer) vs personal details */
  @Prop({ default: 'agency', enum: ['agency', 'freelancer'] })
  issuerProfile: string;

  @Prop({
    default: 'draft',
    enum: ['draft', 'sent', 'accepted', 'declined', 'expired', 'archived'],
  })
  status: string;

  /** Customizable pipeline (same pattern as leads/deals). */
  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline?: Types.ObjectId;

  /** Stage name from the selected pipeline. */
  @Prop({ type: String, index: true })
  stage?: string;

  @Prop({ default: '' })
  clientName: string;

  @Prop({ default: '' })
  clientEmail: string;

  /** Email subject when sending from CRM */
  @Prop({ default: '' })
  subject: string;

  @Prop({ required: true, default: '' })
  bodyHtml: string;

  @Prop({ type: String })
  relatedModule?: string;

  @Prop({ type: Types.ObjectId })
  relatedTo?: Types.ObjectId;

  @Prop({ type: Number })
  totalAmount?: number;

  @Prop({ default: 'INR' })
  currency?: string;

  @Prop({ type: Date })
  validityUntil?: Date;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Object })
  meta?: Record<string, unknown>;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const CrmProposalSchema = SchemaFactory.createForClass(CrmProposal);
applyCrmSoftDeletePlugin(CrmProposalSchema);
CrmProposalSchema.index({ isDeleted: 1, deletedAt: -1 });
CrmProposalSchema.index({ pipeline: 1, stage: 1 });
