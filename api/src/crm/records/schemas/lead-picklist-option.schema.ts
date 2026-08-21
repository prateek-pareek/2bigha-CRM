import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type LeadPicklistOptionDocument = LeadPicklistOption & Document;

/**
 * Admin-configurable option lists backing the Add Lead "Lead Type" and "Group"
 * fields, the lead-type tab bar, and the "Group" filter — mirrors the
 * ServiceOffering pattern (see services/schemas/service-offering.schema.ts)
 * instead of hardcoding Reference/Investor/Lead/Buyer/Seller as enums.
 */
@Schema({ timestamps: true })
export class LeadPicklistOption {
  /** Which picklist this option belongs to, e.g. 'leadCategory' or 'group'. */
  @Prop({ required: true, trim: true, index: true })
  listKey: string;

  /** Display label — also the value stored on Lead.leadCategory / Lead.group. */
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

  /** Who created this option — surfaced on the Groups page ("created by"). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ trim: true })
  createdByName?: string;
}

export const LeadPicklistOptionSchema = SchemaFactory.createForClass(
  LeadPicklistOption,
);
applyCrmSoftDeletePlugin(LeadPicklistOptionSchema);
LeadPicklistOptionSchema.index({ isDeleted: 1, deletedAt: -1 });
/** One label per list; prevents duplicate "Reference" entries within leadCategory, etc. */
LeadPicklistOptionSchema.index({ listKey: 1, label: 1 }, { unique: true });
