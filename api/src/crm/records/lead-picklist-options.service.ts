import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LeadPicklistOption,
  LeadPicklistOptionDocument,
} from './schemas/lead-picklist-option.schema';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export type LeadPicklistKey =
  | 'leadCategory'
  | 'group'
  | 'checklistItem'
  | 'leadIntent';

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
  // Mirrors the FRD's Add Lead "Lead Intent" chip set — admin-editable like the others.
  leadIntent: [
    'Buyer',
    'Seller',
    'Subscription',
    'Farm',
    'Property Management',
    'Investor',
  ],
};

@Injectable()
export class LeadPicklistOptionsService implements OnModuleInit {
  private readonly logger = new Logger(LeadPicklistOptionsService.name);

  constructor(
    @InjectModel(LeadPicklistOption.name, 'crmConnection')
    private model: Model<LeadPicklistOptionDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
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

  async create(
    data: Partial<LeadPicklistOption>,
    creator?: { id?: string; name?: string },
  ): Promise<LeadPicklistOption> {
    const doc = new this.model({
      listKey: String(data.listKey ?? '').trim(),
      label: String(data.label ?? '').trim(),
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive !== false,
      createdBy: creator?.id ?? undefined,
      createdByName: creator?.name ?? undefined,
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

  /**
   * Groups page: every 'group' option plus its live lead count and creator,
   * optionally filtered by name — backs the top-level Groups section (create,
   * search, lead count, creator, click-through to filtered leads).
   */
  async findAllWithLeadCounts(
    listKey: 'group',
    search?: string,
  ): Promise<Array<LeadPicklistOption & { _id: unknown; leadCount: number }>> {
    const query: Record<string, unknown> = { listKey, isActive: true };
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      query.label = { $regex: trimmedSearch, $options: 'i' };
    }
    const options = await this.model
      .find(query)
      .sort({ sortOrder: 1, label: 1 })
      .lean()
      .exec();
    if (!options.length) return [];

    const labels = options.map((o) => o.label);
    const counts = await this.leadModel.aggregate([
      { $match: { group: { $in: labels }, isDeleted: { $ne: true } } },
      { $group: { _id: '$group', count: { $sum: 1 } } },
    ]);
    const countByLabel = new Map<string, number>(
      counts.map((c) => [c._id, c.count]),
    );

    return options.map((option) => ({
      ...option,
      leadCount: countByLabel.get(option.label) ?? 0,
    })) as Array<LeadPicklistOption & { _id: unknown; leadCount: number }>;
  }

  async remove(id: string): Promise<void> {
    const res = await this.model
      .findByIdAndUpdate(id, softDeleteUpdate(), { new: true })
      .exec();
    if (!res) throw new NotFoundException('Option not found');
  }
}
