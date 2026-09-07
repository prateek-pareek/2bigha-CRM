import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HrmsSyncEventLogDocument = HrmsSyncEventLog & Document;

@Schema({ timestamps: true, collection: 'hrms_sync_event_logs' })
export class HrmsSyncEventLog {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ type: Object })
  payload: Record<string, unknown>;

  @Prop({
    enum: ['processed', 'ignored', 'failed'],
    default: 'processed',
    index: true,
  })
  status: 'processed' | 'ignored' | 'failed';

  @Prop()
  error?: string;

  @Prop()
  processedAt?: Date;
}

export const HrmsSyncEventLogSchema =
  SchemaFactory.createForClass(HrmsSyncEventLog);
HrmsSyncEventLogSchema.index({ createdAt: -1 });
