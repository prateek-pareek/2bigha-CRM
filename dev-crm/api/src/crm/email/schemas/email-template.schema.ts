import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type EmailTemplateDocument = EmailTemplate & Document;

@Schema({ timestamps: true })
export class EmailTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string; // HTML content with variables like {{firstName}}

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  steps: any[];

  @Prop({ type: [String], default: [] })
  variables: string[]; // List of supported variables

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({
    default: 'standard',
    enum: ['standard', 'marketing', 'transactional', 'multi_step'],
  })
  type: string;

  /** CRM service offerings this template applies to (directory under Settings → Services). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'ServiceOffering' }], default: [] })
  serviceOfferingIds: Types.ObjectId[];

  @Prop({
    enum: ['all', 'agency', 'freelancer'],
    default: 'all',
  })
  categoryAudience: string;

  @Prop({
    enum: ['all', 'cv', 'portfolio', 'case_study'],
    default: 'all',
  })
  categoryMaterial: string;

  @Prop({ default: true })
  isActive: boolean;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
applyCrmSoftDeletePlugin(EmailTemplateSchema);
EmailTemplateSchema.index({ isDeleted: 1, deletedAt: -1 });
