import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PlaybookDocument = Playbook & Document;

/** Legacy embedded shape — only read for migrating old documents to `content`. */
@Schema({ _id: false })
export class PlaybookLegacyStep {
  @Prop({ required: true })
  order: number;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  body: string;

  @Prop({ type: String, default: 'Note' })
  suggestedType: string;
}

const PlaybookLegacyStepSchema =
  SchemaFactory.createForClass(PlaybookLegacyStep);

const SECTION_TYPES = ['script', 'checklist', 'qa', 'notes'] as const;
const RUNNER_ANSWER_TYPES = ['text', 'dropdown', 'checkbox'] as const;

@Schema({ _id: false })
export class PlaybookSection {
  /** Stable id for client references */
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: SECTION_TYPES })
  type: string;

  @Prop({ required: true, default: 0 })
  order: number;

  @Prop({ default: '' })
  title: string;

  /** TipTap / rich HTML */
  @Prop({ default: '' })
  html: string;
}

const PlaybookSectionSchema = SchemaFactory.createForClass(PlaybookSection);

@Schema({ _id: false })
export class PlaybookRunnerQuestion {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, default: 0 })
  order: number;

  @Prop({ required: true, default: '' })
  prompt: string;

  @Prop({ required: true, enum: RUNNER_ANSWER_TYPES, default: 'text' })
  answerType: string;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({
    required: true,
    enum: ['Deal', 'Contact', 'Lead'],
    default: 'Deal',
  })
  crmTarget: string;

  /**
   * Dot path for $set, e.g. `stage`, `nextStep`, `customFields.budget`
   */
  @Prop({ default: '' })
  crmFieldPath: string;
}

const PlaybookRunnerQuestionSchema =
  SchemaFactory.createForClass(PlaybookRunnerQuestion);

@Schema({ _id: false })
export class PlaybookRecommendationTrigger {
  @Prop({ required: true, enum: ['Deal', 'Contact', 'Lead'] })
  recordType: string;

  /**
   * `field` = compare CRM field (below).
   * `email_engagement` = use tracked email stats for this record (see emailEngagement).
   */
  @Prop({ type: String, enum: ['field', 'email_engagement'], default: 'field' })
  triggerKind: string;

  /**
   * When triggerKind is email_engagement: which signal must hold for the banner.
   * Ignored for field triggers.
   */
  @Prop({ type: String })
  emailEngagement?: string;

  /** Field on the record, e.g. `stage` (or placeholder for email triggers) */
  @Prop({ required: true, default: 'stage' })
  fieldPath: string;

  @Prop({ required: true, enum: ['eq', 'in'], default: 'eq' })
  operator: string;

  /** Single value (eq) or list (in) */
  @Prop({ type: [String], default: [] })
  values: string[];
}

const PlaybookRecommendationTriggerSchema = SchemaFactory.createForClass(
  PlaybookRecommendationTrigger,
);

@Schema({ timestamps: true })
export class Playbook {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  /** Plain-text fallback / legacy / search blob */
  @Prop({ trim: true, default: '' })
  content: string;

  @Prop({
    required: true,
    enum: ['Lead', 'Deal', 'Contact', 'Organization', 'Client', 'Any'],
    default: 'Any',
  })
  appliesTo: string;

  @Prop({
    required: true,
    enum: ['draft', 'published'],
    default: 'published',
  })
  status: string;

  @Prop({ default: false })
  isTemplate: boolean;

  @Prop({ trim: true, default: '' })
  category: string;

  @Prop({ trim: true, default: '' })
  team: string;

  /** Stages this playbook is tagged with (library filter + recommender hints) */
  @Prop({ type: [String], default: [] })
  salesStages: string[];

  @Prop({ default: false })
  archived: boolean;

  @Prop({ type: [PlaybookSectionSchema], default: [] })
  sections: PlaybookSection[];

  @Prop({ type: [PlaybookRunnerQuestionSchema], default: [] })
  runnerQuestions: PlaybookRunnerQuestion[];

  @Prop({ type: PlaybookRecommendationTriggerSchema, required: false })
  recommendationTrigger?: PlaybookRecommendationTrigger;

  /** @deprecated Pre–content model; hydrated into `content` when empty. */
  @Prop({ type: [PlaybookLegacyStepSchema], default: [] })
  steps?: PlaybookLegacyStep[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const PlaybookSchema = SchemaFactory.createForClass(Playbook);
applyCrmSoftDeletePlugin(PlaybookSchema);
PlaybookSchema.index({ isDeleted: 1, deletedAt: -1 });
