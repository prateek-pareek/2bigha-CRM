import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PortalClientNeedDocument = PortalClientNeed & Document;

@Schema({ timestamps: true, collection: 'crm_portal_client_needs' })
export class PortalClientNeed {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true, index: true })
  deal: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['asset', 'credential', 'document', 'access', 'other'],
  })
  category: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ default: 'open', enum: ['open', 'received', 'not_needed'] })
  status: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop()
  satisfiedDocUrl?: string;

  @Prop({ type: Date })
  satisfiedAt?: Date;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const PortalClientNeedSchema =
  SchemaFactory.createForClass(PortalClientNeed);
applyCrmSoftDeletePlugin(PortalClientNeedSchema);
PortalClientNeedSchema.index({ isDeleted: 1, deletedAt: -1 });
