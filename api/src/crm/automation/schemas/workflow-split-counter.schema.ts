import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Atomic counter for round-robin mailbox selection per workflow + split key. */
export type WorkflowSplitCounterDocument = WorkflowSplitCounter & Document;

@Schema({ timestamps: true })
export class WorkflowSplitCounter {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ default: 0 })
  counter: number;
}

export const WorkflowSplitCounterSchema =
  SchemaFactory.createForClass(WorkflowSplitCounter);
WorkflowSplitCounterSchema.index({ workflowId: 1, key: 1 }, { unique: true });
