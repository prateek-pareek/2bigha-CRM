import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CrmMigrationDuplicateStrategy,
  CrmMigrationEntityType,
  CrmMigrationPlatform,
  MigrationJobStatus,
} from '../migration.types';

export type CrmMigrationJobDocument = CrmMigrationJob & Document;

@Schema({ timestamps: true, collection: 'crm_migration_jobs' })
export class CrmMigrationJob {
  @Prop({ required: true, index: true })
  platform: CrmMigrationPlatform;

  @Prop({ required: true, index: true })
  entityType: CrmMigrationEntityType;

  @Prop({
    required: true,
    enum: [
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'reverted',
    ],
    default: 'pending',
    index: true,
  })
  status: MigrationJobStatus;

  @Prop({
    default: 'merge',
    enum: ['merge', 'replace', 'skip', 'create'],
  })
  duplicateStrategy: CrmMigrationDuplicateStrategy;

  /** Column mapping: target field → source column name. */
  @Prop({ type: Object, default: {} })
  mapping: Record<string, string>;

  @Prop({ default: 0 })
  total: number;

  @Prop({ default: 0 })
  processed: number;

  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failedCount: number;

  @Prop({ default: 0 })
  skippedCount: number;

  @Prop({ default: 0 })
  mergedCount: number;

  @Prop({ default: 0 })
  createdCount: number;

  @Prop({ default: 0 })
  batchCount: number;

  @Prop()
  error?: string;

  /** Last few error samples for debugging. */
  @Prop({ type: [String], default: [] })
  errorSamples: string[];

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop()
  sourceFileName?: string;

  @Prop({ type: Date })
  revertedAt?: Date;

  /** Counts from the last successful revert. */
  @Prop({ default: 0 })
  revertRestoredCount?: number;

  @Prop({ default: 0 })
  revertDeletedCount?: number;
}

export const CrmMigrationJobSchema =
  SchemaFactory.createForClass(CrmMigrationJob);
CrmMigrationJobSchema.index({ createdAt: -1 });
CrmMigrationJobSchema.index({ status: 1, createdAt: -1 });
