import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WebsiteChatSessionDocument = WebsiteChatSession & Document;

@Schema({ _id: false })
export class WebsiteChatMessage {
  @Prop({ required: true, trim: true })
  body: string;

  @Prop({
    type: String,
    enum: ['visitor', 'staff'],
    required: true,
  })
  sender: string;

  @Prop({ trim: true })
  staffName?: string;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;
}

@Schema({ timestamps: true, collection: 'crm_website_chat_sessions' })
export class WebsiteChatSession {
  /** Client-generated id (uuid) — stable across page loads */
  @Prop({ required: true, trim: true, unique: true })
  sessionKey: string;

  @Prop({ trim: true })
  visitorName?: string;

  @Prop({ trim: true, lowercase: true })
  visitorEmail?: string;

  @Prop({
    type: String,
    enum: ['freelancer', 'agency', 'both'],
    default: 'both',
  })
  audience: string;

  @Prop({ trim: true })
  pageUrl?: string;

  @Prop({ trim: true })
  websiteHost?: string;

  @Prop({
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
  })
  status: string;

  @Prop({ type: [WebsiteChatMessage], default: [] })
  messages: WebsiteChatMessage[];

  @Prop({ type: Date })
  lastMessageAt?: Date;

  @Prop({ type: Boolean, default: true })
  unreadByStaff: boolean;

  @Prop({ trim: true })
  staffNotes?: string;

  @Prop({ type: String })
  convertedLeadId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WebsiteChatSessionSchema =
  SchemaFactory.createForClass(WebsiteChatSession);
WebsiteChatSessionSchema.index({ status: 1, lastMessageAt: -1 });
WebsiteChatSessionSchema.index({ unreadByStaff: 1, lastMessageAt: -1 });
