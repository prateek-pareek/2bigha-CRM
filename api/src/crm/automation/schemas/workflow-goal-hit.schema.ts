import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { WorkflowTrigger } from './workflow.schema';
import type { WorkflowEntityType } from './workflow-delayed-job.schema';

export type WorkflowGoalHitDocument = WorkflowGoalHit & Document;

@Schema({ timestamps: true })
export class WorkflowGoalHit {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: ['Lead', 'Deal', 'Contact', 'Organization'] })
  entityType: WorkflowEntityType;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop()
  label?: string;

  @Prop()
  trigger: WorkflowTrigger;
}

export const WorkflowGoalHitSchema =
  SchemaFactory.createForClass(WorkflowGoalHit);
WorkflowGoalHitSchema.index({ workflowId: 1, entityId: 1 }, { unique: true });
WorkflowGoalHitSchema.index({ workflowId: 1, createdAt: -1 });
