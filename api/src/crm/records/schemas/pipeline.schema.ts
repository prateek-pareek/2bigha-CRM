import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PipelineDocument = Pipeline & Document;

@Schema({ timestamps: true })
export class Pipeline {
  @Prop({ required: true })
  name: string; // e.g., 'Standard Sales', 'Implementation', 'Partnership'

  @Prop({ default: 'deals', index: true })
  type:
    | 'deals'
    | 'leads'
    | 'proposals'
    | 'quotations'
    | 'contracts'
    | 'legal';

  @Prop({
    default: 'it_consulting',
    enum: ['it_consulting', 'freelancer', 'healthcare', 'generic'],
    index: true,
  })
  categoryType: 'it_consulting' | 'freelancer' | 'healthcare' | 'generic';

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        probability: { type: Number, default: 0 },
        order: { type: Number, required: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
  })
  stages: {
    name: string;
    probability: number;
    order: number;
    isDefault: boolean;
  }[];

  @Prop({ default: false })
  isDefault: boolean;

  /**
   * Optional lead email automation template (assign from CRM → Workflows settings).
   * Only applies to leads in this pipeline.
   */
  @Prop({ type: Types.ObjectId, ref: 'LeadEngagementAutomationTemplate' })
  leadEngagementAutomationTemplateId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'DealEngagementAutomationTemplate' })
  dealEngagementAutomationTemplateId?: Types.ObjectId;

  /**
   * Pipeline-specific AI outreach context (agency vs freelancer positioning, tone, required fields).
   * Merged over global CRM → AI outreach settings when drafting emails for leads in this pipeline.
   */
  @Prop({ type: Object })
  outreachAiContext?: {
    useGlobalSettings?: boolean;
    businessName?: string;
    businessSummary?: string;
    servicesOffered?: string;
    idealClientProfile?: string;
    tonePreset?: 'consultative' | 'direct' | 'warm' | 'formal';
    signatureOrClosing?: string;
    mustMention?: string;
    avoidSaying?: string;
    additionalContext?: string;
    aiInstructions?: string;
    requiredContextFields?: string[];
    missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
    missingContextTaskTitle?: string;
  };
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const PipelineSchema = SchemaFactory.createForClass(Pipeline);
applyCrmSoftDeletePlugin(PipelineSchema);
PipelineSchema.index({ isDeleted: 1, deletedAt: -1 });
