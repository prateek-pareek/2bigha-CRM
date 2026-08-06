import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type {
  LeadEngagementAutomationRules,
  LeadEngagementAutoFollowUp,
} from './lead-engagement-automation-template.schema';

export type DealEngagementAutomationTemplateDocument =
  DealEngagementAutomationTemplate & Document;

/** Reuse lead rule shape (stage targets on deal pipeline). */
export type DealEngagementAutomationRules = {
  onEmailOpened?: LeadEngagementAutomationRules['onEmailOpened'];
  onReply?: LeadEngagementAutomationRules['onReply'];
  onFollowUpSent?: LeadEngagementAutomationRules['onFollowUpSent'];
  onFollowUpSequenceComplete?: LeadEngagementAutomationRules['onFollowUpSequenceComplete'];
  onDealStageEntered?: {
    stageName: string;
    createTask?: {
      title: string;
      body?: string;
      dueInDays?: number;
      calendarEnabled?: boolean;
      reminderEnabled?: boolean;
      reminderBeforeMinutes?: number;
    };
  };
};

@Schema({ timestamps: true })
export class DealEngagementAutomationTemplate {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ required: true })
  presetKey: string;

  @Prop({ type: Object, required: true })
  rules: DealEngagementAutomationRules;

  @Prop({ type: Object })
  autoFollowUp?: LeadEngagementAutoFollowUp;

  @Prop({ type: [String], default: [] })
  suggestedPipelineNames?: string[];

  @Prop({ default: false })
  isSystem: boolean;
}

export const DealEngagementAutomationTemplateSchema =
  SchemaFactory.createForClass(DealEngagementAutomationTemplate);

DealEngagementAutomationTemplateSchema.index({ presetKey: 1 });
