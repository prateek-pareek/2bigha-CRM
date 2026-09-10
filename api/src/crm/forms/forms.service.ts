import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FormDefinition, FormDefinitionDocument } from './schemas/form-definition.schema';
import { FormSubmission, FormSubmissionDocument } from './schemas/form-submission.schema';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { DEFAULT_LEAD_WORKSPACE_MODULE } from '../shared/crm-workspace-module.util';

/** CRUD for form definitions — the authenticated "Form Builder" side (see FormSubmissionsService for public intake). */
@Injectable()
export class FormsService {
  constructor(
    @InjectModel(FormDefinition.name, 'crmConnection')
    private readonly formModel: Model<FormDefinitionDocument>,
    @InjectModel(FormSubmission.name, 'crmConnection')
    private readonly submissionModel: Model<FormSubmissionDocument>,
  ) {}

  private assertUniqueFieldKeys(fields?: { key: string }[]): void {
    if (!fields?.length) return;
    const seen = new Set<string>();
    for (const f of fields) {
      const key = String(f.key || '').trim();
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate field key "${key}" — each field needs a unique key.`);
      }
      seen.add(key);
    }
  }

  async findAll(): Promise<FormDefinition[]> {
    return this.formModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async findOne(id: string): Promise<FormDefinitionDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Form not found');
    const form = await this.formModel.findById(id).exec();
    if (!form || (form as any).isDeleted) throw new NotFoundException('Form not found');
    return form;
  }

  async create(dto: CreateFormDto, user?: any): Promise<FormDefinition> {
    this.assertUniqueFieldKeys(dto.fields);
    const fields = (dto.fields || []).map((f, i) => ({ ...f, order: f.order ?? i }));
    const created = await new this.formModel({
      ...dto,
      fields,
      module: dto.module || DEFAULT_LEAD_WORKSPACE_MODULE,
      createdBy: user?.userId || user?._id || undefined,
    }).save();
    return created.toObject();
  }

  async update(id: string, dto: UpdateFormDto): Promise<FormDefinition> {
    this.assertUniqueFieldKeys(dto.fields);
    const form = await this.findOne(id);
    if (dto.fields) {
      dto.fields = dto.fields.map((f, i) => ({ ...f, order: f.order ?? i })) as any;
    }
    Object.assign(form, dto);
    await form.save();
    return form.toObject();
  }

  async remove(id: string, user?: any): Promise<{ success: boolean }> {
    const form = await this.findOne(id);
    (form as any).isDeleted = true;
    (form as any).deletedAt = new Date();
    if (user?.userId || user?._id) {
      (form as any).deletedBy = new Types.ObjectId(String(user.userId || user._id));
    }
    await form.save();
    return { success: true };
  }

  async listSubmissions(
    formId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ items: FormSubmission[]; total: number }> {
    await this.findOne(formId); // 404s if the form doesn't exist
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 25));
    const filter = { formId: new Types.ObjectId(formId) };
    const [items, total] = await Promise.all([
      this.submissionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.submissionModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
}
