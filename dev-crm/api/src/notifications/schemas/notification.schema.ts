import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  recipient: string; // User ID or 'ALL'

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'Info' })
  type: string; // 'Announcement', 'Leave', 'Payroll', 'Expense', 'Info'

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata: any;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
