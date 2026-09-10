import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FormDefinition, FormDefinitionDocument } from './schemas/form-definition.schema';
import { FormSubmission, FormSubmissionDocument } from './schemas/form-submission.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { CRMService } from '../core/crm.service';
import { normalizeEmail, normalizePhoneDigits } from '../shared/crm-person-identifiers.util';
import { SubmitFormDto } from './dto/submit-form.dto';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type PublicFormView = {
  _id: string;
  name: string;
  description?: string;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    helpText?: string;
    options: string[];
  }>;
  submitButtonLabel: string;
  accentColor?: string;
};

export type SubmitFormResult = {
  success: true;
  successMessage: string;
  redirectUrl?: string;
};

/**
 * Public lead-intake side of the Form Builder module — the counterpart to
 * FormsService's authenticated CRUD. Follows the same "converge on
 * CRMService.createLead" pattern every other lead source uses (see
 * MetaLeadAdsService.createLeadFromDetail), plus a lightweight dedupe pass
 * so a repeat fill of the same form updates the existing Lead instead of
 * spawning a duplicate.
 */
@Injectable()
export class FormSubmissionsService {
  private readonly logger = new Logger(FormSubmissionsService.name);

  constructor(
    @InjectModel(FormDefinition.name, 'crmConnection')
    private readonly formModel: Model<FormDefinitionDocument>,
    @InjectModel(FormSubmission.name, 'crmConnection')
    private readonly submissionModel: Model<FormSubmissionDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
  ) {}

  /** Definition shape safe to hand to an anonymous visitor — no `leadDefaults`/internal bookkeeping. */
  async getPublicForm(id: string): Promise<PublicFormView> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Form not found');
    const form = await this.formModel.findById(id).lean().exec();
    if (!form || (form as any).isDeleted || !form.isActive) {
      throw new NotFoundException('Form not found');
    }
    return {
      _id: String(form._id),
      name: form.name,
      description: form.description,
      fields: [...form.fields]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: !!f.required,
          placeholder: f.placeholder,
          helpText: f.helpText,
          options: f.options || [],
        })),
      submitButtonLabel: form.submitButtonLabel || 'Submit',
      accentColor: form.accentColor,
    };
  }

  /** Digit-suffix match — tolerant of +country codes/spacing/dashes differing between two entries of "the same" number. */
  private async findExistingLead(email?: string, phone?: string): Promise<LeadDocument | null> {
    const normEmail = normalizeEmail(email);
    const digits = normalizePhoneDigits(phone);
    const last10 = digits.slice(-10);
    const or: Record<string, unknown>[] = [];
    if (normEmail) {
      or.push({ email: new RegExp(`^${escapeRegExp(normEmail)}$`, 'i') });
    }
    if (last10.length >= 7) {
      const re = new RegExp(`${escapeRegExp(last10)}$`);
      or.push({ mobileNo: re }, { phone: re });
    }
    if (!or.length) return null;
    return this.leadModel
      .findOne({ isDeleted: { $ne: true }, $or: or })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Splits a fullName answer into first/last the same way MetaLeadAdsService does for its `full_name` field. */
  private splitFullName(fullName: string): { firstName?: string; lastName?: string } {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    const firstName = parts.shift();
    return { firstName, lastName: parts.join(' ') || undefined };
  }

  /** Maps raw answers into known Lead fields (per `field.mapsTo`) vs. a `customFields` catch-all. */
  private mapAnswers(
    form: FormDefinitionDocument,
    answers: Record<string, unknown>,
  ): { known: Record<string, string>; customFields: Record<string, unknown>; missingRequired: string[] } {
    const known: Record<string, string> = {};
    const customFields: Record<string, unknown> = {};
    const missingRequired: string[] = [];

    for (const field of form.fields) {
      const raw = answers[field.key];
      const isMulti = Array.isArray(raw);
      const value = isMulti ? (raw as unknown[]).map((v) => String(v).trim()).filter(Boolean) : String(raw ?? '').trim();
      const isEmpty = isMulti ? (value as unknown[]).length === 0 : !value;

      if (field.required && isEmpty) {
        missingRequired.push(field.label || field.key);
        continue;
      }
      if (isEmpty) continue;

      if (field.mapsTo && !isMulti) {
        if (field.mapsTo === 'fullName') {
          const { firstName, lastName } = this.splitFullName(value as string);
          if (firstName) known.firstName = firstName;
          if (lastName) known.lastName = lastName;
        } else {
          known[field.mapsTo] = value as string;
        }
      } else {
        customFields[field.key] = value;
      }
    }
    return { known, customFields, missingRequired };
  }

  async submit(formId: string, dto: SubmitFormDto, req: { ip?: string; userAgent?: string; referrer?: string }): Promise<SubmitFormResult> {
    if (!Types.ObjectId.isValid(formId)) throw new NotFoundException('Form not found');
    const form = await this.formModel.findById(formId).exec();
    if (!form || (form as any).isDeleted || !form.isActive) {
      throw new NotFoundException('Form not found');
    }

    // Honeypot tripped — pretend success (don't tip off the bot) without creating anything.
    if (dto._hp && String(dto._hp).trim()) {
      this.logger.warn(`Form ${formId} honeypot triggered — submission discarded silently`);
      return {
        success: true,
        successMessage: form.successMessage,
        redirectUrl: form.redirectUrl,
      };
    }

    const answers = dto.answers && typeof dto.answers === 'object' ? dto.answers : {};
    const { known, customFields, missingRequired } = this.mapAnswers(form, answers);
    if (missingRequired.length) {
      throw new BadRequestException(`Please fill in: ${missingRequired.join(', ')}`);
    }

    const submission = await new this.submissionModel({
      formId: form._id,
      formName: form.name,
      answers,
      ip: req.ip,
      userAgent: req.userAgent,
      referrer: req.referrer,
      utm: dto.utm,
    }).save();

    const leadDto: Record<string, any> = {
      firstName: known.firstName || 'Form Lead',
      lastName: known.lastName,
      email: known.email,
      phone: known.phone,
      mobileNo: known.phone,
      organization: known.organization,
      jobTitle: known.jobTitle,
      notes: known.notes,
      module: form.module,
      status: 'New',
      stage: 'New',
      pipeline: form.leadDefaults?.pipeline,
      leadCategory: form.leadDefaults?.leadCategory,
      group: form.leadDefaults?.group,
      source: `Form — ${form.name}`,
      customFields: {
        ...customFields,
        leadSource: 'form',
        formId: String(form._id),
        formName: form.name,
        formSubmissionId: String(submission._id),
      },
    };

    try {
      const existing = await this.findExistingLead(known.email, known.phone);
      if (existing) {
        await this.mergeIntoExistingLead(existing, leadDto, submission);
      } else {
        await this.createNewLead(leadDto, submission);
      }
    } catch (e: any) {
      // A race with another concurrent submission for the same person is the one case
      // createLead itself can still reject (duplicate email/phone) — retry as a merge once.
      if (e instanceof BadRequestException) {
        const retryExisting = await this.findExistingLead(known.email, known.phone);
        if (retryExisting) {
          await this.mergeIntoExistingLead(retryExisting, leadDto, submission);
        } else {
          submission.status = 'failed';
          submission.error = e.message;
          await submission.save();
          throw e;
        }
      } else {
        this.logger.error(`Form submission ${submission._id} failed to create a lead: ${e?.message}`);
        submission.status = 'failed';
        submission.error = e?.message || 'Unknown error';
        await submission.save();
        throw e;
      }
    }

    await this.formModel
      .updateOne({ _id: form._id }, { $inc: { submissionCount: 1 }, $set: { lastSubmissionAt: new Date() } })
      .exec();

    return {
      success: true,
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl,
    };
  }

  private async createNewLead(leadDto: Record<string, any>, submission: FormSubmissionDocument): Promise<void> {
    const lead = await this.crmService.createLead(leadDto);
    submission.leadId = (lead as any)._id;
    submission.status = 'created_lead';
    await submission.save();
  }

  private async mergeIntoExistingLead(
    existing: LeadDocument,
    leadDto: Record<string, any>,
    submission: FormSubmissionDocument,
  ): Promise<void> {
    await this.leadModel
      .updateOne(
        { _id: existing._id },
        {
          $set: Object.fromEntries(
            Object.entries(leadDto.customFields || {}).map(([k, v]) => [`customFields.${k}`, v]),
          ),
        },
      )
      .exec();
    submission.leadId = existing._id as any;
    submission.status = 'merged_into_existing';
    await submission.save();
  }
}
