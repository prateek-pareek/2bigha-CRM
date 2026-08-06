import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkflowEnrollmentDocument = WorkflowEnrollment & Document;

/** Tracks which records have already run a "only once" workflow. */
@Schema({ timestamps: true })
export class WorkflowEnrollment {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: ['Lead', 'Deal', 'Contact', 'Organization'] })
  entityType: 'Lead' | 'Deal' | 'Contact' | 'Organization';

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;
}

export const WorkflowEnrollmentSchema =
  SchemaFactory.createForClass(WorkflowEnrollment);
WorkflowEnrollmentSchema.index(
  { workflowId: 1, entityType: 1, entityId: 1 },
  { unique: true },
);
