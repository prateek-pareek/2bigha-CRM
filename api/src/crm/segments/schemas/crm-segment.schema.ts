import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmSegmentDocument = CrmSegment & Document;

export type CrmSegmentListType = 'dynamic' | 'static';

export type CrmSegmentMemberModule =
  | 'leads'
  | 'contacts'
  | 'platform-opportunities';

export const CRM_SEGMENT_MEMBER_MODULES: CrmSegmentMemberModule[] = [
  'leads',
  'contacts',
  'platform-opportunities',
];

@Schema({ _id: false })
export class CrmSegmentMember {
  @Prop({
    required: true,
    enum: ['leads', 'contacts', 'platform-opportunities'],
  })
  module: CrmSegmentMemberModule;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;
}

export const CrmSegmentMemberSchema =
  SchemaFactory.createForClass(CrmSegmentMember);

@Schema({ _id: false })
export class CrmSegmentFilterCriterion {
  @Prop({ required: true })
  property: string;

  @Prop({ required: true })
  operator: string;

  @Prop({ default: '' })
  value: string;
}

export const CrmSegmentFilterCriterionSchema = SchemaFactory.createForClass(
  CrmSegmentFilterCriterion,
);

/**
 * Marketing / outreach list: leads, contacts, and platform opportunities
 * grouped by filter rules or manual membership.
 */
@Schema({ timestamps: true })
export class CrmSegment {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({ required: true, enum: ['dynamic', 'static'], default: 'dynamic' })
  listType: CrmSegmentListType;

  /** Dynamic lists: CRM filter rows (same shape as saved views / list filters). */
  @Prop({ type: [CrmSegmentFilterCriterionSchema], default: [] })
  leadFilters: CrmSegmentFilterCriterion[];

  @Prop({ type: [CrmSegmentFilterCriterionSchema], default: [] })
  contactFilters: CrmSegmentFilterCriterion[];

  @Prop({ type: [CrmSegmentFilterCriterionSchema], default: [] })
  platformOpportunityFilters: CrmSegmentFilterCriterion[];

  /** Static lists: explicit membership. */
  @Prop({ type: [CrmSegmentMemberSchema], default: [] })
  members: CrmSegmentMember[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const CrmSegmentSchema = SchemaFactory.createForClass(CrmSegment);
applyCrmSoftDeletePlugin(CrmSegmentSchema);
CrmSegmentSchema.index({ isDeleted: 1, deletedAt: -1 });
CrmSegmentSchema.index({ name: 1 });
CrmSegmentSchema.index({ listType: 1, updatedAt: -1 });
CrmSegmentSchema.index({ createdBy: 1 });
