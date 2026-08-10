import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ProposalBlockDocument = CrmProposalBlock & Document;

export const PROPOSAL_BLOCK_CATEGORIES = [
  'portfolio',
  'payment_terms',
  'about_intro',
  'scope_boilerplate',
  'legal',
  'commercials',
  'cv_section',
  'other',
] as const;

export type ProposalBlockCategory = (typeof PROPOSAL_BLOCK_CATEGORIES)[number];

@Schema({ timestamps: true, collection: 'crm_proposal_blocks' })
export class CrmProposalBlock {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    enum: [...PROPOSAL_BLOCK_CATEGORIES],
    default: 'other',
  })
  category: string;

  @Prop({ required: true, default: '' })
  bodyHtml: string;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const CrmProposalBlockSchema =
  SchemaFactory.createForClass(CrmProposalBlock);
applyCrmSoftDeletePlugin(CrmProposalBlockSchema);
CrmProposalBlockSchema.index({ isDeleted: 1, deletedAt: -1 });

CrmProposalBlockSchema.index({ isActive: 1, category: 1, name: 1 });
