import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgentTargetDocument = AgentTarget & Document;

/**
 * Super-Admin-editable per-agent targets for the Agent Performance baseline
 * report's target-vs-actual column. One active row per agent (upserted on
 * save, not a history log — see `crm_agent_targets`).
 */
@Schema({ timestamps: true, collection: 'crm_agent_targets' })
export class AgentTarget {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ enum: ['monthly', 'weekly'], default: 'monthly' })
  window: 'monthly' | 'weekly';

  @Prop({ default: 0 })
  leadsTarget?: number;

  @Prop({ default: 0 })
  callsTarget?: number;

  @Prop({ default: 0 })
  propertiesTarget?: number;
}

export const AgentTargetSchema = SchemaFactory.createForClass(AgentTarget);
