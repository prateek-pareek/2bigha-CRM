import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConversationRefDocument = ConversationRef & Document;

@Schema({ timestamps: true, collection: 'teams_conversation_refs' })
export class ConversationRef {
  /** User's Microsoft 365 email — primary lookup key */
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  userEmail: string;

  /** Azure AD Object ID of the user (from Bot activity) */
  @Prop({ required: false })
  aadObjectId?: string;

  /** Full Bot Framework ConversationReference JSON — required to send proactive messages */
  @Prop({ type: Object, required: true })
  conversationReference: Record<string, unknown>;

  /** The Bot Framework channel service URL captured from the incoming message */
  @Prop({ required: false })
  serviceUrl?: string;
}

export const ConversationRefSchema =
  SchemaFactory.createForClass(ConversationRef);
