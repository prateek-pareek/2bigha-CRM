import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';
import {
  CRM_WORKSPACE_MODULES,
  CrmWorkspaceModule,
  DEFAULT_LEAD_WORKSPACE_MODULE,
} from '../../shared/crm-workspace-module.util';

export type FormDefinitionDocument = FormDefinition & Document;

/**
 * Question types a form field can render as. Kept deliberately close to
 * `CustomFieldType` (admin/schemas/custom-field.schema.ts) so the same
 * mental model applies, plus a few input-specific variants (email/phone/
 * textarea/radio) that make sense on a public lead-capture form but not on
 * an internal record property.
 */
export enum FormFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  EMAIL = 'email',
  PHONE = 'phone',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTI_SELECT = 'multiselect',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
}

/**
 * Known `Lead` properties a field can be wired to, so an answer lands as a
 * first-class searchable/reportable Lead field instead of a `customFields`
 * entry. Mirrors the subset `MetaLeadAdsService.KNOWN_FIELD_KEYS` maps to —
 * kept in sync manually since the two live in separate integrations.
 */
export const FORM_FIELD_LEAD_TARGETS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'organization',
  'jobTitle',
  'notes',
] as const;

export type FormFieldLeadTarget = (typeof FORM_FIELD_LEAD_TARGETS)[number];

/** One question on a form. Plain subdocument (no own `_id` needed — `key` is the stable identity). */
@Schema({ _id: false })
export class FormField {
  /** Stable slug used as the answer key (`FormSubmission.answers[key]`) and, when unmapped, the `Lead.customFields` key. */
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, enum: FormFieldType })
  type: FormFieldType;

  @Prop({ default: false })
  required: boolean;

  @Prop({ trim: true })
  placeholder?: string;

  /** Short hint shown under the question on the public form. */
  @Prop({ trim: true })
  helpText?: string;

  /** For select / multiselect / radio. */
  @Prop({ type: [String], default: [] })
  options: string[];

  /** When set, the answer is written to this known Lead field instead of `customFields`. */
  @Prop({ enum: FORM_FIELD_LEAD_TARGETS })
  mapsTo?: FormFieldLeadTarget;

  @Prop({ default: 0 })
  order: number;
}
export const FormFieldSchema = SchemaFactory.createForClass(FormField);

@Schema({ timestamps: true })
export class FormDefinition {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  /** Workspace boundary every Lead created from this form is tagged with (see crm-workspace-module.util). */
  @Prop({ enum: CRM_WORKSPACE_MODULES, default: DEFAULT_LEAD_WORKSPACE_MODULE })
  module: CrmWorkspaceModule;

  @Prop({ type: [FormFieldSchema], default: [] })
  fields: FormField[];

  /** Inactive forms 404 on the public submit/definition endpoints (but stay editable). */
  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ trim: true, default: 'Submit' })
  submitButtonLabel: string;

  @Prop({ trim: true, default: "Thanks — we'll be in touch shortly." })
  successMessage: string;

  /** Optional: send the visitor here instead of showing `successMessage`. */
  @Prop({ trim: true })
  redirectUrl?: string;

  @Prop({ trim: true })
  accentColor?: string;

  /** Defaults applied to every Lead created from this form (pipeline/category/etc.), on top of mapped field answers. */
  @Prop({ type: Object, default: {} })
  leadDefaults?: {
    pipeline?: Types.ObjectId;
    leadCategory?: string;
    group?: string;
  };

  /** Denormalized counter — avoids a `FormSubmission.countDocuments` on every list-forms render. */
  @Prop({ default: 0 })
  submissionCount: number;

  @Prop()
  lastSubmissionAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const FormDefinitionSchema = SchemaFactory.createForClass(FormDefinition);
applyCrmSoftDeletePlugin(FormDefinitionSchema);
FormDefinitionSchema.index({ isDeleted: 1, deletedAt: -1 });
FormDefinitionSchema.index({ module: 1, createdAt: -1 });
