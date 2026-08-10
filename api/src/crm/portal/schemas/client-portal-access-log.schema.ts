import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientPortalAccessLogDocument = ClientPortalAccessLog & Document;

@Schema({ timestamps: true })
export class ClientPortalAccessLog {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true, index: true })
  deal: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const ClientPortalAccessLogSchema =
  SchemaFactory.createForClass(ClientPortalAccessLog);
ClientPortalAccessLogSchema.index({ deal: 1, createdAt: -1 });
