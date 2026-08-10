import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type QuickChatConversationStateDocument = QuickChatConversationState &
  Document;

@Schema({ timestamps: true })
export class QuickChatConversationState {
  @Prop({ required: true, unique: true, index: true })
  conversationKey: string;

  @Prop({ type: [String], required: true, index: true })
  participants: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  lastReadAt: Record<string, string>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  lastTypingAt: Record<string, string>;
}

export const QuickChatConversationStateSchema = SchemaFactory.createForClass(
  QuickChatConversationState,
);

