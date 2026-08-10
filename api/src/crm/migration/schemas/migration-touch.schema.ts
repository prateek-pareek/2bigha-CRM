import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CrmMigrationTouchDocument = CrmMigrationTouch & Document;

export type MigrationTouchOutcome = 'created' | 'merged';

/**
 * One touch per CRM document written by a migration job.
 * `previous === null` means the doc was inserted by this job (delete on revert).
 * Otherwise restore the prior document via replaceOne.
 *
 * Only the first write to a doc within a job is recorded ($setOnInsert) so
 * revert always restores the pre-job state, not an intermediate one.
 */
@Schema({ timestamps: false, collection: 'crm_migration_touches' })
export class CrmMigrationTouch {
  @Prop({
    type: Types.ObjectId,
    ref: 'CrmMigrationJob',
    required: true,
    index: true,
  })
  jobId: Types.ObjectId;

  /** organizations | contacts | leads | deals | activities */
  @Prop({ required: true })
  entityType: string;

  @Prop({ type: Types.ObjectId, required: true })
  docId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['created', 'merged'],
    required: true,
  })
  outcome: MigrationTouchOutcome;

  /** null = newly inserted by this migration */
  @Prop({ type: Object, default: null })
  previous: Record<string, unknown> | null;
}

export const CrmMigrationTouchSchema =
  SchemaFactory.createForClass(CrmMigrationTouch);

CrmMigrationTouchSchema.index({ jobId: 1, docId: 1 }, { unique: true });
CrmMigrationTouchSchema.index({ jobId: 1, entityType: 1 });
