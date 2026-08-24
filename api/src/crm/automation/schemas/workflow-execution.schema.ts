import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { WorkflowTrigger } from './workflow.schema';

export type WorkflowExecutionDocument = WorkflowExecution & Document;

@Schema({ timestamps: true })
export class WorkflowExecution {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: ['Lead', 'Contact', 'Organization'] })
  entityType: 'Lead' | 'Contact' | 'Organization';

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  trigger: WorkflowTrigger;

  @Prop({ enum: ['success', 'skipped', 'failed'], required: true })
  status: 'success' | 'skipped' | 'failed';

  @Prop()
  skipReason?: string;

  @Prop({ type: [String], default: [] })
  actionResults: string[];

  @Prop()
  errorMessage?: string;

  @Prop()
  branchLabel?: string;

  @Prop({ default: false })
  hadScheduledDelay?: boolean;

  /** A/B arm when workflow used an `wf_ab_split` node. */
  @Prop({ enum: ['A', 'B'] })
  variant?: 'A' | 'B';

  @Prop({ default: false })
  goalMet?: boolean;
}

export const WorkflowExecutionSchema =
  SchemaFactory.createForClass(WorkflowExecution);
WorkflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
