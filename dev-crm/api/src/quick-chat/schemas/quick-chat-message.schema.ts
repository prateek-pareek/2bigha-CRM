import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuickChatMessageDocument = QuickChatMessage & Document;

@Schema({ timestamps: true })
export class QuickChatMessage {
  @Prop({ required: true, index: true })
  conversationKey: string;

  @Prop({ type: [String], required: true, index: true })
  participants: string[];

  @Prop({ required: true, index: true })
  fromUserId: string;

  @Prop({ required: true, index: true })
  toUserId: string;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const QuickChatMessageSchema =
  SchemaFactory.createForClass(QuickChatMessage);

