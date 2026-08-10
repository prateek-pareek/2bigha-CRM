import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SalesAgentApprovalStatus,
  SalesAgentRecordType,
  SalesAgentRiskTier,
} from '../sales-agent.types';

export type SalesAgentApprovalDocument = SalesAgentApproval & Document;

@Schema({ timestamps: true })
export class SalesAgentApproval {
  @Prop({ type: Types.ObjectId, ref: 'SalesAgentRun', required: true, index: true })
  runId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ required: true, enum: ['low', 'high'], default: 'high' })
  riskTier: SalesAgentRiskTier;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: SalesAgentApprovalStatus;

  @Prop()
  previewSummary?: string;

  @Prop({ enum: ['Lead', 'Deal', 'Contact'] })
  recordType?: SalesAgentRecordType;

  @Prop({ type: Types.ObjectId })
  recordId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;

  @Prop()
  executedAt?: Date;

  @Prop({ type: Object })
  executionResult?: Record<string, unknown>;

  @Prop()
  executionError?: string;
}

export const SalesAgentApprovalSchema =
  SchemaFactory.createForClass(SalesAgentApproval);
SalesAgentApprovalSchema.index({ status: 1, createdAt: -1 });
