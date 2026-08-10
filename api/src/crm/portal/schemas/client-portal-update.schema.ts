import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientPortalUpdateDocument = ClientPortalUpdate & Document;

@Schema({ timestamps: true })
export class ClientPortalUpdate {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true, index: true })
  deal: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title: string;

  @Prop({ type: String, required: true, trim: true })
  body: string;

  @Prop({ type: String, enum: ['daily', 'weekly', 'general'], default: 'general' })
  cadence: 'daily' | 'weekly' | 'general';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const ClientPortalUpdateSchema =
  SchemaFactory.createForClass(ClientPortalUpdate);

ClientPortalUpdateSchema.index({ deal: 1, createdAt: -1 });
