import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsAppMessageDocument = WhatsAppMessage & Document;

@Schema({ timestamps: true })
export class WhatsAppMessage {
  @Prop({ required: true })
  waId: string; // WhatsApp ID (phone number without +)

  @Prop({ required: true })
  direction: 'inbound' | 'outbound';

  @Prop({ required: true })
  body: string;

  @Prop()
  messageId?: string; // Meta message ID

  @Prop({ type: Types.ObjectId, ref: 'User' })
  sentBy?: Types.ObjectId;

  @Prop({ type: String })
  module?: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ default: 'sent', enum: ['sent', 'delivered', 'read', 'failed'] })
  status: string;

  @Prop({ type: Object })
  meta?: Record<string, any>;
}

export const WhatsAppMessageSchema =
  SchemaFactory.createForClass(WhatsAppMessage);

WhatsAppMessageSchema.index({ waId: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ messageId: 1 }, { sparse: true });
