import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmSnippetDocument = CrmSnippet & Document;

/** Reusable text blocks (notes, links, email, anywhere). Keeps collection name for existing data. */
@Schema({ timestamps: true, collection: 'emailsnippets' })
export class CrmSnippet {
  @Prop({ required: true, trim: true })
  name: string;

  /** Optional label for search (e.g. "sig"). */
  @Prop({ trim: true })
  shortcut?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  /** Optional — CRM service offerings (Settings → Services) for filtering in composer. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'ServiceOffering' }], default: [] })
  serviceOfferingIds: Types.ObjectId[];

  /** Who this content is for — composer can filter by agency vs freelancer. */
  @Prop({
    enum: ['all', 'agency', 'freelancer'],
    default: 'all',
  })
  categoryAudience: string;

  /** CV vs portfolio focus — composer can filter. */
  @Prop({
    enum: ['all', 'cv', 'portfolio', 'case_study'],
    default: 'all',
  })
  categoryMaterial: string;

  @Prop({ default: true })
  isActive: boolean;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const CrmSnippetSchema = SchemaFactory.createForClass(CrmSnippet);
applyCrmSoftDeletePlugin(CrmSnippetSchema);
CrmSnippetSchema.index({ isDeleted: 1, deletedAt: -1 });

CrmSnippetSchema.index({ isActive: 1, name: 1 });
CrmSnippetSchema.index({ shortcut: 1 });
