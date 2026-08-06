import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { WorkflowTrigger } from './workflow.schema';

export type WorkflowTriggerProgressDocument = WorkflowTriggerProgress & Document;

/**
 * Tracks which trigger types have fired for a record when `triggerCombine === 'all'`.
 * When every required trigger has fired, entry criteria are evaluated; on success the doc is removed.
 */
@Schema({ timestamps: true })
export class WorkflowTriggerProgress {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: ['Lead', 'Deal', 'Contact', 'Organization'] })
  entityType: 'Lead' | 'Deal' | 'Contact' | 'Organization';

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  /** Distinct trigger types that have fired for this workflow + record. */
  @Prop({ type: [String], default: [] })
  fired: WorkflowTrigger[];
}

export const WorkflowTriggerProgressSchema = SchemaFactory.createForClass(
  WorkflowTriggerProgress,
);
WorkflowTriggerProgressSchema.index(
  { workflowId: 1, entityType: 1, entityId: 1 },
  { unique: true },
);
