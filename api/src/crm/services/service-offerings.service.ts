import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ServiceOffering,
  ServiceOfferingDocument,
} from '../schemas/service-offering.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

@Injectable()
export class ServiceOfferingsService {
  constructor(
    @InjectModel(ServiceOffering.name, 'crmConnection')
    private model: Model<ServiceOfferingDocument>,
  ) {}

  async create(data: Partial<ServiceOffering>): Promise<ServiceOffering> {
    const doc = new this.model({
      name: data.name?.trim(),
      summary: (data.summary ?? '').trim(),
      description: (data.description ?? '').trim(),
      keywords: normalizeKeywords(data.keywords),
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive !== false,
    });
    return doc.save();
  }

  async findAll(includeInactive = false): Promise<ServiceOffering[]> {
    const q = includeInactive ? {} : { isActive: true };
    return this.model.find(q).sort({ sortOrder: 1, name: 1 }).lean().exec();
  }

  async findOne(id: string): Promise<ServiceOffering> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Service not found');
    return doc as ServiceOffering;
  }

  async update(
    id: string,
    data: Partial<ServiceOffering>,
  ): Promise<ServiceOffering> {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.summary !== undefined) patch.summary = String(data.summary).trim();
    if (data.description !== undefined)
      patch.description = String(data.description).trim();
    if (data.keywords !== undefined) patch.keywords = normalizeKeywords(data.keywords);
    if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder);
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Service not found');
    return doc as ServiceOffering;
  }

  async remove(id: string): Promise<void> {
    const res = await this.model.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
    if (!res) throw new NotFoundException('Service not found');
  }
}

function normalizeKeywords(raw: unknown): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[,;\n]/);
  return Array.from(
    new Set(
      arr
        .map((s) => String(s).trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 120)),
    ),
  );
}
