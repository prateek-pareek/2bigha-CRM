import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmObjectTypeDocument = CrmObjectType & Document;

/**
 * Tenant-defined CRM object type (HubSpot custom object definition).
 * Built-in modules (leads/contacts/…) are NOT stored here.
 */
@Schema({ timestamps: true, collection: 'crm_object_types' })
export class CrmObjectType {
  /** Unique slug used in routes and associations, e.g. projects, vendors. */
  @Prop({ required: true, unique: true, index: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  singularLabel: string;

  @Prop({ required: true })
  pluralLabel: string;

  @Prop()
  description?: string;

  /** Property key used as the record title (default: name). */
  @Prop({ default: 'name' })
  primaryPropertyKey?: string;

  @Prop()
  icon?: string;

  @Prop({ default: true })
  isActive?: boolean;

  @Prop({ default: 0 })
  order?: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const CrmObjectTypeSchema = SchemaFactory.createForClass(CrmObjectType);
applyCrmSoftDeletePlugin(CrmObjectTypeSchema);
CrmObjectTypeSchema.index({ isDeleted: 1, deletedAt: -1 });
CrmObjectTypeSchema.index({ isActive: 1, order: 1 });
