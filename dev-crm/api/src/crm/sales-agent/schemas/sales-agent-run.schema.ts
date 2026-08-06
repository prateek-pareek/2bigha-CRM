import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SalesAgentRecordType,
  SalesAgentRole,
  SalesAgentRunStatus,
  SalesAgentToolCall,
  SalesAgentTrigger,
} from '../sales-agent.types';

export type SalesAgentRunDocument = SalesAgentRun & Document;

@Schema({ timestamps: true })
export class SalesAgentRun {
  @Prop({ required: true, enum: ['Lead', 'Deal', 'Contact'] })
  recordType: SalesAgentRecordType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  recordId: Types.ObjectId;

  @Prop({ default: 'sales', enum: ['sales', 'sdr', 'qualification', 'ae', 'renewal'] })
  agentRole: SalesAgentRole;

  @Prop({
    required: true,
    enum: [
      'queued',
      'running',
      'completed',
      'failed',
      'pending_approval',
      'cancelled',
    ],
    default: 'queued',
    index: true,
  })
  status: SalesAgentRunStatus;

  @Prop({
    required: true,
    enum: [
      'manual',
      'copilot',
      'cron',
      'lead_created',
      'lead_stage_changed',
      'deal_created',
      'deal_stage_changed',
      'email_reply_received',
      'website_inbound',
      'chat_inbound',
      'stale_lead',
    ],
  })
  trigger: SalesAgentTrigger;

  @Prop()
  summary?: string;

  @Prop()
  reasoning?: string;

  @Prop({ type: [Object], default: [] })
  toolCalls: SalesAgentToolCall[];

  @Prop()
  errorMessage?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  triggeredBy?: Types.ObjectId;

  @Prop()
  ownerScope?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  model?: string;

  @Prop({ default: 0 })
  toolRoundCount?: number;

  /** Anthropic conversation snapshot when paused for approval (resume after approve). */
  @Prop({ type: [Object], default: [] })
  pausedMessages?: Array<Record<string, unknown>>;

  @Prop()
  pausedAtRound?: number;
}

export const SalesAgentRunSchema = SchemaFactory.createForClass(SalesAgentRun);
SalesAgentRunSchema.index({ recordType: 1, recordId: 1, createdAt: -1 });
SalesAgentRunSchema.index({ status: 1, createdAt: -1 });
