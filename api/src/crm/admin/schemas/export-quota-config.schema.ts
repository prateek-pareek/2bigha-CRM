import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExportQuotaConfigDocument = ExportQuotaConfig & Document;

/**
 * Singleton config (one row) for Super Admin daily export limits — applies
 * across both the Lead Manager export flow and the IVR export flow, per the
 * FRD's "Export & Quota Management" section.
 */
@Schema({ timestamps: true, collection: 'crm_export_quota_config' })
export class ExportQuotaConfig {
  @Prop({ default: 5 })
  dailyLimitDefault: number;

  /** Keyed by user id string — overrides `dailyLimitDefault` for specific Super Admins. */
  @Prop({ type: Object, default: {} })
  perUserOverrides: Record<string, number>;
}

export const ExportQuotaConfigSchema = SchemaFactory.createForClass(ExportQuotaConfig);
