import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmObjectRecordDocument = CrmObjectRecord & Document;

/**
 * Instance of a tenant-defined custom object.
 * Indexed for crore-scale list/search by objectTypeKey.
 */
@Schema({ timestamps: true, collection: 'crm_object_records' })
export class CrmObjectRecord {
  @Prop({ type: Types.ObjectId, ref: 'CrmObjectType', required: true })
  objectTypeId: Types.ObjectId;

  @Prop({ required: true })
  objectTypeKey: string;

  /** Denormalized display title for lists/search. */
  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  properties: Record<string, unknown>;

  @Prop({ type: Types.ObjectId })
  ownerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const CrmObjectRecordSchema =
  SchemaFactory.createForClass(CrmObjectRecord);
applyCrmSoftDeletePlugin(CrmObjectRecordSchema);
CrmObjectRecordSchema.index({ isDeleted: 1, deletedAt: -1 });
// Primary list path: type → recent records
CrmObjectRecordSchema.index({ objectTypeKey: 1, _id: -1 });
CrmObjectRecordSchema.index({ objectTypeKey: 1, updatedAt: -1, _id: -1 });
// Prefix search within a type (use anchored regex / collation-friendly)
CrmObjectRecordSchema.index({ objectTypeKey: 1, name: 1, _id: -1 });
CrmObjectRecordSchema.index({ objectTypeKey: 1, ownerId: 1, _id: -1 });
