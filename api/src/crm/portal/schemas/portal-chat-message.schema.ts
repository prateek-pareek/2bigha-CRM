import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PortalChatMessageDocument = PortalChatMessage & Document;

@Schema({ timestamps: true })
export class PortalChatMessage {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true, index: true })
  deal: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['client', 'admin'] })
  senderType: 'client' | 'admin';

  @Prop({ type: String, required: true })
  senderId: string;

  @Prop({ type: String, required: true })
  senderName: string;

  @Prop({ type: String, required: true, trim: true })
  text: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const PortalChatMessageSchema =
  SchemaFactory.createForClass(PortalChatMessage);

PortalChatMessageSchema.index({ deal: 1, createdAt: 1 });
