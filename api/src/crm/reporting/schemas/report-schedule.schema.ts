import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportScheduleDocument = ReportSchedule & Document;

@Schema({ timestamps: true })
export class ReportSchedule {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true, enum: ['agent', 'team'] })
  reportType: 'agent' | 'team';

  @Prop({ type: String, required: true, enum: ['daily', 'weekly', 'monthly'] })
  frequency: 'daily' | 'weekly' | 'monthly';

  @Prop({ type: [String], required: true })
  emailRecipients: string[];

  @Prop({ type: Object, required: true })
  filters: Record<string, any>;

  @Prop({ type: Date })
  lastSentAt?: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ReportScheduleSchema = SchemaFactory.createForClass(ReportSchedule);
