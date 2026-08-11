import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LeadPicklistOption,
  LeadPicklistOptionDocument,
} from './schemas/lead-picklist-option.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export type LeadPicklistKey = 'leadCategory' | 'group' | 'checklistItem';

/** Seeded once on first boot so the tab bar / dropdowns / checklist aren't empty on day one. */
const DEFAULT_OPTIONS: Record<LeadPicklistKey, string[]> = {
  leadCategory: ['Reference', 'Investor', 'Lead', 'Buyer lead'],
  group: ['Seller', 'Buyer'],
  checklistItem: [
    'Initial Contact Made',
    'Documents Collected',
    'Site Visit Done',
    'KYC Verified',
    'Agreement Signed',
  ],
};

@Injectable()
export class LeadPicklistOptionsService implements OnModuleInit {
  private readonly logger = new Logger(LeadPicklistOptionsService.name);

  constructor(
    @InjectModel(LeadPicklistOption.name, 'crmConnection')
    private model: Model<LeadPicklistOptionDocument>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaults();
    } catch (err) {
      this.logger.warn(
        `Skipped default lead-picklist seed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async seedDefaults() {
    for (const listKey of Object.keys(DEFAULT_OPTIONS) as LeadPicklistKey[]) {
      const count = await this.model.countDocuments({ listKey });
      if (count > 0) continue;
      const labels = DEFAULT_OPTIONS[listKey];
      await this.model.insertMany(
        labels.map((label, i) => ({ listKey, label, sortOrder: i, isActive: true })),
      );
    }
  }

  async create(data: Partial<LeadPicklistOption>): Promise<LeadPicklistOption> {
    const doc = new this.model({
      listKey: String(data.listKey ?? '').trim(),
      label: String(data.label ?? '').trim(),
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive !== false,
    });
    return doc.save();
  }

  async findAll(
    listKey?: string,
    includeInactive = false,
  ): Promise<LeadPicklistOption[]> {
    const q: Record<string, unknown> = {};
    if (listKey) q.listKey = listKey;
    if (!includeInactive) q.isActive = true;
    return this.model.find(q).sort({ sortOrder: 1, label: 1 }).lean().exec();
  }

  async findOne(id: string): Promise<LeadPicklistOption> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Option not found');
    return doc as LeadPicklistOption;
  }

  async update(
    id: string,
    data: Partial<LeadPicklistOption>,
  ): Promise<LeadPicklistOption> {
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = String(data.label).trim();
    if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder);
    if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Option not found');
    return doc as LeadPicklistOption;
  }

  async remove(id: string): Promise<void> {
    const res = await this.model
      .findByIdAndUpdate(id, softDeleteUpdate(), { new: true })
      .exec();
    if (!res) throw new NotFoundException('Option not found');
  }
}
