import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EmailTemplate,
  EmailTemplateDocument,
} from '../schemas/email-template.schema';
import { fillEmailTemplateVariables } from '../shared/email-template-fill.util';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectModel(EmailTemplate.name, 'crmConnection')
    private templateModel: Model<EmailTemplateDocument>,
  ) {}

  async create(data: any): Promise<EmailTemplate> {
    return new this.templateModel(data).save();
  }

  async findAll(query: any = {}): Promise<EmailTemplate[]> {
    return this.templateModel
      .find(query)
      .populate('serviceOfferingIds', 'name summary')
      .exec();
  }

  async findOne(id: string): Promise<EmailTemplate | null> {
    return this.templateModel
      .findById(id)
      .populate('serviceOfferingIds', 'name summary')
      .exec();
  }

  async update(id: string, data: any): Promise<EmailTemplate | null> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return null;

    console.log(
      `[EmailTemplatesService] Updating template ${id}. Steps check:`,
      {
        hasSteps: !!data.steps,
        stepsCount: data.steps?.length || 0,
      },
    );

    // Using findByIdAndUpdate is more robust for top-level object replacements including Mixed types
    const updated = await this.templateModel
      .findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
      .exec();

    if (updated) {
      console.log(
        `[EmailTemplatesService] Template ${id} updated. Final steps:`,
        updated.steps?.length || 0,
      );
    } else {
      console.warn(
        `[EmailTemplatesService] Template ${id} not found for update.`,
      );
    }

    return updated;
  }

  async delete(id: string): Promise<any> {
    return this.templateModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
  }

  fillVariables(template: string, data: Record<string, any>): string {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) flat[k] = s;
    }
    return fillEmailTemplateVariables(template, flat);
  }
}
