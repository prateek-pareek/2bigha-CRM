import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmSnippet, CrmSnippetDocument } from '../schemas/crm-snippet.schema';

function normalizeCategoryAudience(v: unknown): 'all' | 'agency' | 'freelancer' {
  const s = String(v ?? 'all').toLowerCase();
  return s === 'agency' || s === 'freelancer' ? s : 'all';
}

function normalizeCategoryMaterial(
  v: unknown,
): 'all' | 'cv' | 'portfolio' | 'case_study' {
  const s = String(v ?? 'all').toLowerCase().replace(/-/g, '_');
  if (s === 'cv' || s === 'portfolio' || s === 'case_study') return s;
  return 'all';
}

@Injectable()
export class CrmSnippetsService {
  constructor(
    @InjectModel(CrmSnippet.name, 'crmConnection')
    private snippetModel: Model<CrmSnippetDocument>,
  ) {}

  async create(data: {
    name: string;
    shortcut?: string;
    body: string;
    createdBy: string;
    isActive?: boolean;
    serviceOfferingIds?: string[];
    categoryAudience?: unknown;
    categoryMaterial?: unknown;
  }): Promise<CrmSnippet> {
    const serviceOfferingIds = Array.isArray(data.serviceOfferingIds)
      ? data.serviceOfferingIds
          .filter(Boolean)
          .map((id) => new Types.ObjectId(String(id)))
      : [];
    return new this.snippetModel({
      name: data.name.trim(),
      shortcut: data.shortcut?.trim() || undefined,
      body: data.body,
      createdBy: new Types.ObjectId(data.createdBy),
      isActive: data.isActive !== false,
      serviceOfferingIds,
      categoryAudience: normalizeCategoryAudience(data.categoryAudience),
      categoryMaterial: normalizeCategoryMaterial(data.categoryMaterial),
    }).save();
  }

  async findAll(query: { activeOnly?: boolean } = {}): Promise<CrmSnippet[]> {
    const filter =
      query.activeOnly === false ? {} : { isActive: { $ne: false } };
    return this.snippetModel
      .find(filter)
      .sort({ updatedAt: -1, name: 1 })
      .populate('serviceOfferingIds', 'name summary')
      .lean()
      .exec() as Promise<CrmSnippet[]>;
  }

  async findOne(id: string): Promise<CrmSnippet | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.snippetModel
      .findById(id)
      .populate('serviceOfferingIds', 'name summary')
      .lean()
      .exec() as Promise<CrmSnippet | null>;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      shortcut: string;
      body: string;
      isActive: boolean;
      serviceOfferingIds: string[];
      categoryAudience: unknown;
      categoryMaterial: unknown;
    }>,
    userId: string,
    canManageAll: boolean,
  ): Promise<CrmSnippet | null> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.snippetModel.findById(id).exec();
    if (!doc) throw new NotFoundException();
    if (!canManageAll && String(doc.createdBy) !== String(userId)) {
      throw new ForbiddenException('You can only edit your own snippets');
    }
    if (data.name != null) doc.name = String(data.name).trim();
    if (data.shortcut !== undefined)
      doc.shortcut = data.shortcut?.trim() || undefined;
    if (data.body != null) doc.body = data.body;
    if (data.isActive !== undefined) doc.isActive = data.isActive;
    if (data.serviceOfferingIds !== undefined) {
      (doc as { serviceOfferingIds: Types.ObjectId[] }).serviceOfferingIds =
        data.serviceOfferingIds
          .filter(Boolean)
          .map((x) => new Types.ObjectId(String(x)));
    }
    if (data.categoryAudience !== undefined) {
      (doc as { categoryAudience: string }).categoryAudience =
        normalizeCategoryAudience(data.categoryAudience);
    }
    if (data.categoryMaterial !== undefined) {
      (doc as { categoryMaterial: string }).categoryMaterial =
        normalizeCategoryMaterial(data.categoryMaterial);
    }
    await doc.save();
    const refreshed = await this.snippetModel
      .findById(doc._id)
      .populate('serviceOfferingIds', 'name summary')
      .lean()
      .exec();
    return refreshed as CrmSnippet | null;
  }

  async delete(
    id: string,
    userId: string,
    canManageAll: boolean,
  ): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.snippetModel.findById(id).exec();
    if (!doc) throw new NotFoundException();
    if (!canManageAll && String(doc.createdBy) !== String(userId)) {
      throw new ForbiddenException('You can only delete your own snippets');
    }
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    if (Types.ObjectId.isValid(String(userId))) {
      doc.deletedBy = new Types.ObjectId(String(userId));
    }
    await doc.save();
    return { deleted: true };
  }
}
