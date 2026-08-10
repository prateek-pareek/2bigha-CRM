import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InboxRuleDocument = InboxRule & Document;

@Schema({ timestamps: true })
export class InboxRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  pattern: string; // email address or @domain.com

  @Prop({ required: true, enum: ['sender', 'domain'] })
  type: string;

  @Prop({ required: true, enum: ['business', 'promotional', 'social', 'other'] })
  category: string;
}

export const InboxRuleSchema = SchemaFactory.createForClass(InboxRule);

InboxRuleSchema.index({ userId: 1, pattern: 1 }, { unique: true });
