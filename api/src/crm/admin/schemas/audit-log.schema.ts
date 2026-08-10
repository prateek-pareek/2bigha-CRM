import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  action: string; // 'create', 'update', 'delete', 'login', etc.

  @Prop({ required: true })
  module: string; // 'leads', 'deals', 'contacts', etc.

  @Prop({ type: Types.ObjectId, required: false })
  entityId: Types.ObjectId;

  @Prop({ type: Object })
  changes: any; // { field: { old: val, new: val } }

  @Prop()
  description: string;

  @Prop()
  userAgent: string;

  @Prop()
  ipAddress?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
