import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CrmGlobalSettingsDocument = CrmGlobalSettings & Document;

export interface CurrencyRate {
  code: string;    // e.g. "USD", "EUR"
  symbol: string;  // e.g. "$", "€"
  rateToInr: number;
}

@Schema({ collection: 'crm_global_settings', timestamps: true })
export class CrmGlobalSettings {
  @Prop({ default: 'default', index: true, unique: true })
  key: string;

  /** USD → INR rate — kept for backward-compat with existing deal logic. */
  @Prop({ type: Number, default: 83 })
  usdToInr: number;

  /** All configured currency → INR rates (includes USD). */
  @Prop({
    type: [{ code: String, symbol: String, rateToInr: Number }],
    default: [{ code: 'USD', symbol: '$', rateToInr: 83 }],
  })
  currencyRates: CurrencyRate[];

  @Prop({
    type: {
      enforceSendLimits: { type: Boolean, default: false },
      maxEmailsPerHourPerAccount: { type: Number, default: 40 },
      maxEmailsPerDayPerAccount: { type: Number, default: 200 },
      enableWarmupRamp: { type: Boolean, default: true },
      commercialMailingAddress: { type: String, default: '' },
      requireCommercialFooter: { type: Boolean, default: true },
      blockHighRiskComposerSends: { type: Boolean, default: false },
      emailTrackingEnabled: { type: Boolean, default: true },
      optOutFooterStyle: { type: String, enum: ['natural', 'formal'], default: 'natural' },
      enforceHumanOutreachChecks: { type: Boolean, default: true },
      minOutreachBodyWords: { type: Number, default: 50 },
      maxOutreachBodyWords: { type: Number, default: 90 },
      maxOutreachParagraphs: { type: Number, default: 3 },
      blockNonHumanOutreachSends: { type: Boolean, default: false },
    },
    default: {
      enforceSendLimits: false,
      maxEmailsPerHourPerAccount: 40,
      maxEmailsPerDayPerAccount: 200,
      enableWarmupRamp: true,
      commercialMailingAddress: '',
      requireCommercialFooter: true,
      blockHighRiskComposerSends: false,
      emailTrackingEnabled: true,
      optOutFooterStyle: 'natural',
      enforceHumanOutreachChecks: true,
      minOutreachBodyWords: 50,
      maxOutreachBodyWords: 90,
      maxOutreachParagraphs: 3,
      blockNonHumanOutreachSends: false,
    },
  })
  emailDeliverability?: {
    enforceSendLimits: boolean;
    maxEmailsPerHourPerAccount: number;
    maxEmailsPerDayPerAccount: number;
    enableWarmupRamp?: boolean;
    commercialMailingAddress?: string;
    requireCommercialFooter?: boolean;
    blockHighRiskComposerSends?: boolean;
    emailTrackingEnabled?: boolean;
    optOutFooterStyle?: 'natural' | 'formal';
    enforceHumanOutreachChecks?: boolean;
    minOutreachBodyWords?: number;
    maxOutreachBodyWords?: number;
    maxOutreachParagraphs?: number;
    blockNonHumanOutreachSends?: boolean;
  };

  /**
   * Same shape as PM `Project.wikiLinks` — links to wiki spaces/pages (shared PM wiki module).
   */
  @Prop({
    type: [
      {
        type: { type: String, enum: ['space', 'page'], required: true },
        spaceId: { type: String, required: true },
        pageId: { type: String, required: false },
        title: { type: String, required: true },
        urlPath: { type: String, required: true },
      },
    ],
    default: [],
  })
  wikiLinks?: {
    type: 'space' | 'page';
    spaceId: string;
    pageId?: string;
    title: string;
    urlPath: string;
  }[];

  /**
   * When false, the API skips running delayed workflow jobs (delays, wait-for-open, jitter).
   * Managed from CRM Settings → Workflows UI. Default: enabled (undefined/false treated as on in app logic for legacy docs).
   */
  @Prop({ type: Boolean })
  workflowSchedulerEnabled?: boolean;

  /** Team-defined marketplace names for Platform opportunities and platform leads. */
  @Prop({ type: [String], default: [] })
  customOpportunitySourcePlatforms?: string[];

}

export const CrmGlobalSettingsSchema = SchemaFactory.createForClass(CrmGlobalSettings);
