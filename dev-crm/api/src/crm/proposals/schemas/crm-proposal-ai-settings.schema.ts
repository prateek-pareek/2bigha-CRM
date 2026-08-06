import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmProposalAiSettingsDocument = CrmProposalAiSettings & Document;

/** Singleton (`key: default`) — business context & formatting for AI proposal drafts. */
@Schema({ timestamps: true, collection: 'crm_proposal_ai_settings' })
export class CrmProposalAiSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({
    type: String,
    enum: ['agency', 'freelancer'],
    default: 'agency',
  })
  defaultIssuerProfile: string;

  /** When true, merge business name / services from outreach AI settings. */
  @Prop({ default: true })
  useSharedOutreachContext: boolean;

  @Prop({ trim: true, default: '' })
  agencyName: string;

  @Prop({ trim: true, default: '' })
  agencyIntro: string;

  @Prop({ trim: true, default: '' })
  agencyServices: string;

  @Prop({ trim: true, default: '' })
  agencyDifferentiators: string;

  @Prop({ trim: true, default: '' })
  agencyPaymentTerms: string;

  @Prop({ trim: true, default: '' })
  agencyTechStack: string;

  @Prop({ trim: true, default: '' })
  agencyPortfolio: string;

  @Prop({ trim: true, default: '' })
  freelancerName: string;

  @Prop({ trim: true, default: '' })
  freelancerIntro: string;

  @Prop({ trim: true, default: '' })
  freelancerServices: string;

  @Prop({ trim: true, default: '' })
  freelancerDifferentiators: string;

  @Prop({ trim: true, default: '' })
  freelancerPaymentTerms: string;

  @Prop({ trim: true, default: '' })
  freelancerTechStack: string;

  @Prop({ trim: true, default: '' })
  freelancerPortfolio: string;

  @Prop({
    type: String,
    enum: ['consultative', 'direct', 'warm', 'formal'],
    default: 'consultative',
  })
  tonePreset: string;

  /** One section title per line — guides document structure. */
  @Prop({ trim: true, default: '' })
  sectionOutline: string;

  @Prop({ trim: true, default: '' })
  mustInclude: string;

  @Prop({ trim: true, default: '' })
  mustAvoid: string;

  @Prop({ trim: true, default: '' })
  additionalContext: string;
}

export const CrmProposalAiSettingsSchema = SchemaFactory.createForClass(
  CrmProposalAiSettings,
);
