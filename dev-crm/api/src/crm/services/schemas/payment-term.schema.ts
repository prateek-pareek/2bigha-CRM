import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PaymentTermDocument = PaymentTerm & Document;

@Schema({ timestamps: true })
export class PaymentTerm {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true })
  deal: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ default: 'Pending', enum: ['Pending', 'Paid', 'Partial', 'Overdue'] })
  status: string;

  @Prop()
  notes: string;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const PaymentTermSchema = SchemaFactory.createForClass(PaymentTerm);
applyCrmSoftDeletePlugin(PaymentTermSchema);
PaymentTermSchema.index({ isDeleted: 1, deletedAt: -1 });
