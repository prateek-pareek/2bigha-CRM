import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InboxEmailDocument = InboxEmail & Document;

@Schema({ timestamps: true })
export class InboxEmail {
  @Prop({ type: Types.ObjectId, ref: 'UserEmailAccount', required: true })
  accountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  messageId: string; // IMAP message UID

  @Prop({ required: true })
  folder: string; // INBOX, Sent, etc.

  @Prop({ required: true })
  from: string;

  @Prop()
  fromName?: string;

  @Prop({ required: true })
  to: string;

  @Prop()
  toName?: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ default: '' })
  body: string;

  @Prop({ default: '' })
  bodyHtml: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  hasAttachments: boolean;

  /** True when this inbound mail looks like a calendar / meeting invite (.ics / text/calendar / invite subject). */
  @Prop({ default: false })
  isMeetingInvite: boolean;

  /** ICS METHOD when known: REQUEST | CANCEL | REPLY | PUBLISH */
  @Prop()
  inviteMethod?: string;

  @Prop()
  inviteSummary?: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, enum: ['business', 'promotional', 'social', 'other'], default: 'other' })
  category: string;

  @Prop({ type: String, enum: ['business', 'promotional', 'social', 'other'] })
  categoryOverride?: string;

  @Prop({ type: String, enum: ['freelancer', 'agency', 'both'] })
  relationshipLabel?: 'freelancer' | 'agency' | 'both';

  @Prop({ default: 0 })
  score: number;

  @Prop({ default: 0 })
  confidence: number;

  @Prop({ default: 1 })
  classificationVersion: number;

  @Prop({ type: [String], default: [] })
  classificationReasons: string[];

  @Prop({ type: Object })
  meta?: Record<string, any>; // Raw headers, etc.
}

export const InboxEmailSchema = SchemaFactory.createForClass(InboxEmail);

InboxEmailSchema.index(
  { accountId: 1, messageId: 1, folder: 1 },
  { unique: true },
);
InboxEmailSchema.index({ userId: 1, date: -1 });
InboxEmailSchema.index({ userId: 1, isMeetingInvite: 1, date: -1 });
