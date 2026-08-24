import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailDocument = Email & Document;

@Schema({ timestamps: true })
export class Email {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserEmailAccount' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  recipient: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: String, required: true })
  module: string; // 'leads', 'contacts'

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({
    default: 'sent',
    enum: ['sent', 'failed', 'opened', 'clicked', 'draft'],
  })
  status: string;

  @Prop({ default: false })
  hasAttachments: boolean;

  @Prop({ type: Object })
  meta: any; // SMTP response, error messages, etc.
}

export const EmailSchema = SchemaFactory.createForClass(Email);
