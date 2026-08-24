import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SalesAgentSettingsDocument = SalesAgentSettings & Document;

@Schema({ timestamps: true })
export class SalesAgentSettings {
  /** Singleton key — only one org-wide settings doc expected. */
  @Prop({ default: 'default', unique: true })
  key: string;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: true })
  cronEnabled: boolean;

  /** Cron interval label; worker runs every 15 min when enabled. */
  @Prop({ default: '15m' })
  cronSchedule: string;

  @Prop({ default: 10 })
  maxRunsPerCronTick: number;

  /** Skip records with an agent run in the last N hours. */
  @Prop({ default: 24 })
  cooldownHours: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Pipeline' }], default: [] })
  enabledLeadPipelineIds: Types.ObjectId[];

  @Prop({ default: true })
  triggerOnLeadCreated: boolean;

  @Prop({ default: true })
  triggerOnEmailReply: boolean;

  @Prop({ default: true })
  triggerOnNeverContacted: boolean;

  @Prop({ default: true })
  triggerOnReplyAwaiting: boolean;

  @Prop({ default: true })
  triggerOnWebsiteInbound: boolean;

  @Prop({ default: true })
  triggerOnStaleLeads: boolean;

  @Prop({ default: false })
  triggerOnChatInbound: boolean;

  @Prop({ default: 'sales', enum: ['sales', 'sdr', 'qualification', 'ae', 'renewal'] })
  defaultAgentRole: string;

  /** Resume agent loop automatically after last pending approval is resolved. */
  @Prop({ default: true })
  resumeAfterApproval: boolean;

  /** Stage names agents may move leads to without approval. */
  @Prop({ type: [String], default: [] })
  autoApproveStageNames: string[];

  /** Action keys that may auto-execute even when high-risk (empty = none). */
  @Prop({ type: [String], default: [] })
  autoApproveActions: string[];

  @Prop({ default: 20 })
  maxEmailsPerDay: number;

  @Prop({ default: 5 })
  maxEmailsPerRun: number;

  @Prop({ default: 12 })
  maxToolRounds: number;
}

export const SalesAgentSettingsSchema =
  SchemaFactory.createForClass(SalesAgentSettings);
