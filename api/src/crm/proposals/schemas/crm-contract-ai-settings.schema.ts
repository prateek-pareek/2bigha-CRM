import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmContractAiSettingsDocument = CrmContractAiSettings & Document;

/** Singleton (`key: default`) — legal context for AI contract drafts. */
@Schema({ timestamps: true, collection: 'crm_contract_ai_settings' })
export class CrmContractAiSettings {
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

  @Prop({ default: true })
  useSharedProposalContext: boolean;

  @Prop({ trim: true, default: '' })
  agencyLegalName: string;

  @Prop({ trim: true, default: '' })
  agencyRegisteredAddress: string;

  @Prop({ trim: true, default: '' })
  agencySignatoryName: string;

  @Prop({ trim: true, default: '' })
  agencySignatoryTitle: string;

  @Prop({ trim: true, default: '' })
  agencyGstOrReg: string;

  @Prop({ trim: true, default: '' })
  agencyStandardClauses: string;

  @Prop({ trim: true, default: '' })
  freelancerLegalName: string;

  @Prop({ trim: true, default: '' })
  freelancerAddress: string;

  @Prop({ trim: true, default: '' })
  freelancerIdDocument: string;

  @Prop({ trim: true, default: '' })
  freelancerStandardClauses: string;

  @Prop({ trim: true, default: '' })
  governingLaw: string;

  @Prop({ trim: true, default: '' })
  contractSectionOutline: string;

  @Prop({
    type: String,
    enum: ['consultative', 'direct', 'warm', 'formal'],
    default: 'formal',
  })
  tonePreset: string;

  @Prop({ trim: true, default: '' })
  mustInclude: string;

  @Prop({ trim: true, default: '' })
  mustAvoid: string;

  @Prop({ trim: true, default: '' })
  additionalContext: string;
}

export const CrmContractAiSettingsSchema = SchemaFactory.createForClass(
  CrmContractAiSettings,
);
