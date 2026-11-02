import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  /** Acting user; absent for system-detected events (e.g. a stage changed directly in 2bigha). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  user?: Types.ObjectId;

  @Prop({ required: true })
  action: string; // 'create', 'update', 'delete', 'login', etc.

  @Prop({ required: true })
  module: string; // 'leads', 'contacts', etc.

  @Prop({ type: Types.ObjectId, required: false })
  entityId: Types.ObjectId;

  /** Non-ObjectId record key for externally stored records (2bigha `pm_…` ids, slugs). */
  @Prop({ index: true })
  entityKey?: string;

  /** Display name of the record at the time of the event. */
  @Prop()
  entityName?: string;

  /** Actor label for events without a CRM user (e.g. "2bigha"). */
  @Prop()
  actorName?: string;

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
