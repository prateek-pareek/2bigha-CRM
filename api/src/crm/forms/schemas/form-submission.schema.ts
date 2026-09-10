import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FormSubmissionDocument = FormSubmission & Document;

@Schema({ timestamps: true })
export class FormSubmission {
  @Prop({ type: Types.ObjectId, ref: 'FormDefinition', required: true, index: true })
  formId: Types.ObjectId;

  /** Denormalized so a submission row still reads sensibly if the form is later renamed/deleted. */
  @Prop({ trim: true })
  formName?: string;

  /** Raw answers keyed by `FormField.key`, exactly as submitted. */
  @Prop({ type: Object, default: {} })
  answers: Record<string, unknown>;

  /** The Lead this submission created or was merged into. */
  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;

  @Prop({
    enum: ['created_lead', 'merged_into_existing', 'failed'],
    default: 'created_lead',
    index: true,
  })
  status: 'created_lead' | 'merged_into_existing' | 'failed';

  @Prop()
  error?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  referrer?: string;

  @Prop({ type: Object })
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}

export const FormSubmissionSchema = SchemaFactory.createForClass(FormSubmission);
FormSubmissionSchema.index({ formId: 1, createdAt: -1 });
