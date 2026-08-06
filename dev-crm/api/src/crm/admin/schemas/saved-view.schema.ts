import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type SavedViewDocument = SavedView & Document;

@Schema({ timestamps: true })
export class SavedView {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  module: string; // 'leads', 'deals', 'contacts', 'organizations'

  @Prop({ required: true })
  name: string;

  @Prop({ type: [Object], default: [] })
  filters: { property: string; operator: string; value: string }[];

  @Prop({ type: [Object], default: [] })
  columns: { key: string; label: string; visible: boolean }[];

  @Prop({ default: 'createdAt' })
  sortBy: string;

  @Prop({ default: 'desc' })
  sortOrder: string;

  @Prop({ default: false })
  isDefault: boolean;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const SavedViewSchema = SchemaFactory.createForClass(SavedView);
applyCrmSoftDeletePlugin(SavedViewSchema);
SavedViewSchema.index({ isDeleted: 1, deletedAt: -1 });
SavedViewSchema.index({ user: 1, module: 1 });
