import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Document } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ServiceOfferingDocument = ServiceOffering & Document;

@Schema({ timestamps: true })
export class ServiceOffering {
  @Prop({ required: true, trim: true })
  name: string;

  /** Short line for cards / directory */
  @Prop({ trim: true, default: '' })
  summary: string;

  /** Longer internal description */
  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

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

}

export const ServiceOfferingSchema =
  SchemaFactory.createForClass(ServiceOffering);
applyCrmSoftDeletePlugin(ServiceOfferingSchema);
ServiceOfferingSchema.index({ isDeleted: 1, deletedAt: -1 });
