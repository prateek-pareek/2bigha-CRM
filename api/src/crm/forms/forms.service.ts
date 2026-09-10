import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FormDefinition, FormDefinitionDocument } from './schemas/form-definition.schema';
import { FormSubmission, FormSubmissionDocument } from './schemas/form-submission.schema';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { DEFAULT_LEAD_WORKSPACE_MODULE } from '../shared/crm-workspace-module.util';

const SUBMISSION_STATUSES = ['created_lead', 'merged_into_existing', 'failed'] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDayBound(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  else d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type ListSubmissionsOpts = {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  utmSource?: string;
};

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

  private sanitizeLeadDefaults(dto: CreateFormDto | UpdateFormDto): void {
    if (!dto.leadDefaults) return;
    const pipeline = String(dto.leadDefaults.pipeline || '').trim();
    dto.leadDefaults = {
      pipeline: pipeline || undefined,
      leadCategory: String(dto.leadDefaults.leadCategory || '').trim() || undefined,
      group: String(dto.leadDefaults.group || '').trim() || undefined,
    } as any;
  }

  async create(dto: CreateFormDto, user?: any): Promise<FormDefinition> {
    this.assertUniqueFieldKeys(dto.fields);
    this.sanitizeLeadDefaults(dto);
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
    this.sanitizeLeadDefaults(dto);
    const form = await this.findOne(id);
    if (dto.fields) {
      dto.fields = dto.fields.map((f, i) => ({ ...f, order: f.order ?? i })) as any;
    }
    const { leadDefaults, ...rest } = dto;
    Object.assign(form, rest);
    if (leadDefaults !== undefined) {
      (form as any).leadDefaults = {
        pipeline: leadDefaults.pipeline || undefined,
        leadCategory: leadDefaults.leadCategory || undefined,
        group: leadDefaults.group || undefined,
      };
      form.markModified('leadDefaults');
    }
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
    opts: ListSubmissionsOpts = {},
  ): Promise<{ items: FormSubmission[]; total: number; page: number; limit: number }> {
    await this.findOne(formId); // 404s if the form doesn't exist
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 25));

    const and: Record<string, unknown>[] = [{ formId: new Types.ObjectId(formId) }];

    if (opts.status && (SUBMISSION_STATUSES as readonly string[]).includes(opts.status)) {
      and.push({ status: opts.status });
    }

    const createdAt: Record<string, Date> = {};
    const from = parseDayBound(opts.from, false);
    const to = parseDayBound(opts.to, true);
    if (from) createdAt.$gte = from;
    if (to) createdAt.$lte = to;
    if (Object.keys(createdAt).length) and.push({ createdAt });

    if (opts.utmSource?.trim()) {
      and.push({ 'utm.source': new RegExp(escapeRegExp(opts.utmSource.trim()), 'i') });
    }

    const q = opts.q?.trim();
    if (q) {
      const rx = new RegExp(escapeRegExp(q), 'i');
      and.push({
        $or: [
          { error: rx },
          { referrer: rx },
          { 'utm.source': rx },
          { 'utm.medium': rx },
          { 'utm.campaign': rx },
          {
            $expr: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $objectToArray: { $ifNull: ['$answers', {}] } },
                      as: 'pair',
                      cond: {
                        $regexMatch: {
                          input: {
                            $cond: {
                              if: { $isArray: '$$pair.v' },
                              then: {
                                $reduce: {
                                  input: '$$pair.v',
                                  initialValue: '',
                                  in: {
                                    $concat: [
                                      '$$value',
                                      ' ',
                                      {
                                        $convert: {
                                          input: '$$this',
                                          to: 'string',
                                          onError: '',
                                          onNull: '',
                                        },
                                      },
                                    ],
                                  },
                                },
                              },
                              else: {
                                $convert: {
                                  input: '$$pair.v',
                                  to: 'string',
                                  onError: '',
                                  onNull: '',
                                },
                              },
                            },
                          },
                          regex: escapeRegExp(q),
                          options: 'i',
                        },
                      },
                    },
                  },
                },
                0,
              ],
            },
          },
        ],
      });
    }

    const filter = and.length === 1 ? and[0] : { $and: and };
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
    return { items, total, page, limit };
  }
}
