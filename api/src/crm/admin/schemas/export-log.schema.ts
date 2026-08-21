import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExportLogDocument = ExportLog & Document;

/** One row per export attempt — Super Admin's daily quota usage + Export History page. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'crm_export_logs' })
export class ExportLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ trim: true })
  userName?: string;

  /** 'leads' | 'deals' | 'contacts' | 'ivr' | any other entity type routed through exportToCsv. */
  @Prop({ required: true, index: true })
  exportType: string;

  @Prop({ default: 0 })
  rowCount: number;

  @Prop({ type: Object })
  filters?: Record<string, unknown>;
}

export const ExportLogSchema = SchemaFactory.createForClass(ExportLog);
ExportLogSchema.index({ userId: 1, createdAt: -1 });
