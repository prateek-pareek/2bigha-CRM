import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmOutreachAiSettingsDocument = CrmOutreachAiSettings & Document;

/** Singleton-style doc (`key: default`) — business context for AI-generated outreach emails. */
@Schema({ timestamps: true })
export class CrmOutreachAiSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ trim: true, default: '' })
  businessName: string;

  /** How you position the firm (IT consulting, services, outcomes). */
  @Prop({ trim: true, default: '' })
  businessSummary: string;

  /** Offerings: cloud, security, managed services, product engineering, etc. */
  @Prop({ trim: true, default: '' })
  servicesOffered: string;

  /** Who you serve best — industries, company size, buyer personas. */
  @Prop({ trim: true, default: '' })
  idealClientProfile: string;

  @Prop({
    type: String,
    enum: ['consultative', 'direct', 'warm', 'formal'],
    default: 'consultative',
  })
  tonePreset: string;

  /** Optional closing line, Calendly link hint, or sign-off style. */
  @Prop({ trim: true, default: '' })
  signatureOrClosing: string;

  /** Points the model should try to reflect (one per line). */
  @Prop({ trim: true, default: '' })
  mustMention: string;

  /** Phrases or claims to avoid. */
  @Prop({ trim: true, default: '' })
  avoidSaying: string;

  /** Extra instructions appended to every AI draft request. */
  @Prop({ trim: true, default: '' })
  additionalSystemContext: string;

  /** Overrides server env model when non-empty (any LLM provider). */
  @Prop({ trim: true, default: '' })
  anthropicModel: string;

  /** Preferred LLM provider: auto picks first configured key. */
  @Prop({
    type: String,
    enum: ['auto', 'anthropic', 'openai', 'google'],
    default: 'auto',
  })
  llmProvider: string;

  /** Alias for anthropicModel — preferred field name for multi-provider setups. */
  @Prop({ trim: true, default: '' })
  llmModel: string;
}

export const CrmOutreachAiSettingsSchema = SchemaFactory.createForClass(
  CrmOutreachAiSettings,
);
