import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Document } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CustomFieldDocument = CustomField & Document;

export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTI_SELECT = 'multiselect',
  URL = 'url',
  CHECKBOX = 'checkbox',
}

@Schema({ timestamps: true })
export class CustomField {
  @Prop({ required: true })
  name: string; // The label shown to user

  @Prop({ required: true })
  key: string; // Internal key — unique per module (enforced by compound index below)

  @Prop({ required: true, enum: CustomFieldType })
  type: CustomFieldType;

  @Prop({ required: true })
  module: string; // 'leads', 'contacts', 'organizations', 'clients'

  @Prop({ type: [String], default: [] })
  options: string[]; // For SELECT type

  @Prop({ default: false })
  required: boolean;

  @Prop()
  description: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  order: number;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const CustomFieldSchema = SchemaFactory.createForClass(CustomField);
applyCrmSoftDeletePlugin(CustomFieldSchema);
CustomFieldSchema.index({ isDeleted: 1, deletedAt: -1 });

// Compound unique index: same key can exist in different modules, but not twice in the same module
CustomFieldSchema.index({ key: 1, module: 1 }, { unique: true });
