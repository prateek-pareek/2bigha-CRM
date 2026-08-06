import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Document } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type LeadEngagementAutomationTemplateDocument =
  LeadEngagementAutomationTemplate & Document;

/** Where to move the lead when an event fires (matched against pipeline stage names). */
export type LeadEngagementStageTarget = {
  stageName?: string;
  pipelineName?: string;
  stageNameInTargetPipeline?: string;
};

export type LeadEngagementTaskAction = {
  title: string;
  body?: string;
  dueInDays?: number;
  /** Show automatically-created tasks on the calendar (default true). */
  calendarEnabled?: boolean;
  /** Schedule an in-app/Teams reminder with the task (default true). */
  reminderEnabled?: boolean;
  /** Minutes before task due time; 0 means at the due time. */
  reminderBeforeMinutes?: number;
};

export type LeadEngagementNotifyAction = {
  message: string;
  /** Microsoft 365 email for Teams DM; if omitted, automation may skip notify. */
  email?: string;
  link?: string;
};

/** Guards and side effects shared across event rules. */
export type LeadEngagementRuleExtras = {
  /** When false, this rule is skipped (default: enabled). */
  enabled?: boolean;
  /** Run only when lead stage fuzzy-matches one of these (e.g. New). */
  onlyIfStages?: string[];
  createTask?: LeadEngagementTaskAction;
  notifyTeams?: LeadEngagementNotifyAction;
};

export type LeadEngagementAutoFollowUp = {
  enabled: boolean;
  cadenceDays?: number[];
  defaultEmailTemplateId?: string;
  templateIdByDay?: Record<string, string>;
  cancelOnReply?: boolean;
  /** `template` (default) or `ai_draft` — generate personalized email at send time. */
  sendMode?: 'template' | 'ai_draft';
  /** Extra guidance when sendMode is `ai_draft`. */
  aiInstructions?: string;
};

/** Send first outreach email automatically when a lead enters this pipeline. */
export type LeadEngagementAutoOutreach = {
  enabled: boolean;
  /** `ai_draft` (default) or `template`. */
  sendMode?: 'ai_draft' | 'template';
  templateId?: string;
  aiInstructions?: string;
  inboxAccountId?: string;
  /** Minutes to wait after lead creation before sending (0 = immediate). */
  delayMinutes?: number;
  /** Override pipeline required fields; falls back to pipeline.outreachAiContext. */
  requiredContextFields?: string[];
  missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
  missingContextTaskTitle?: string;
};

export type LeadStageConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'in_list';

/** Move lead when a property matches (evaluated on lead create/update). */
export type LeadStageConditionRule = {
  id: string;
  enabled?: boolean;
  label?: string;
  /** Only run when the lead's pipeline name fuzzy-matches one of these. */
  onlyIfPipelineNames?: string[];
  /** Only run when the lead's current stage fuzzy-matches one of these. */
  onlyIfStages?: string[];
  field: string;
  operator: LeadStageConditionOperator;
  value?: string;
  target: LeadEngagementStageTarget;
  createTask?: LeadEngagementTaskAction;
  notifyTeams?: LeadEngagementNotifyAction;
};

export type LeadEngagementAutomationRules = {
  onEmailOpened?: LeadEngagementStageTarget &
    LeadEngagementRuleExtras & { syncContact?: boolean };
  onReply?: LeadEngagementStageTarget & LeadEngagementRuleExtras;
  onFollowUpSent?: { stageNamePattern: string } & LeadEngagementRuleExtras;
  onFollowUpSequenceComplete?: LeadEngagementStageTarget &
    LeadEngagementRuleExtras;
  /** Property-based rules — first matching rule wins on each lead update. */
  stageRules?: LeadStageConditionRule[];
};

@Schema({ timestamps: true })
export class LeadEngagementAutomationTemplate {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop()
  presetKey?: string;

  @Prop({ type: Object, required: true })
  rules: LeadEngagementAutomationRules;

  @Prop({ type: Object })
  autoFollowUp?: LeadEngagementAutoFollowUp;

  @Prop({ type: Object })
  autoOutreach?: LeadEngagementAutoOutreach;

  @Prop({ type: [String], default: [] })
  suggestedPipelineNames?: string[];

  @Prop({ default: false })
  isSystem: boolean;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const LeadEngagementAutomationTemplateSchema =
  SchemaFactory.createForClass(LeadEngagementAutomationTemplate);
applyCrmSoftDeletePlugin(LeadEngagementAutomationTemplateSchema);
LeadEngagementAutomationTemplateSchema.index({ isDeleted: 1, deletedAt: -1 });

LeadEngagementAutomationTemplateSchema.index({ name: 1 });
LeadEngagementAutomationTemplateSchema.index({ presetKey: 1 });
