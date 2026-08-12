import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PropertyListing,
  PropertyListingDocument,
} from './schemas/property-listing.schema';
import { CreatePropertyListingDto } from './dto/create-property-listing.dto';
import { UpdatePropertyListingDto } from './dto/update-property-listing.dto';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export interface PropertyListingListQuery {
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  status?: string;
  propertyType?: string;
  listedFor?: string;
  leadId?: string;
}

@Injectable()
export class PropertyListingsService {
  constructor(
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly listingModel: Model<PropertyListingDocument>,
  ) {}

  async create(
    dto: CreatePropertyListingDto,
    userId?: string,
  ): Promise<PropertyListingDocument> {
    return this.listingModel.create({
      ...dto,
      listedDate: dto.listedDate ? new Date(dto.listedDate) : new Date(),
      leadId:
        dto.leadId && Types.ObjectId.isValid(dto.leadId)
          ? new Types.ObjectId(dto.leadId)
          : undefined,
      createdBy:
        userId && Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : undefined,
    });
  }

  async findAll(query: PropertyListingListQuery = {}): Promise<{
    data: PropertyListingDocument[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
    const pageSize = Math.min(
      Math.max(1, parseInt(String(query.pageSize ?? 25), 10) || 25),
      200,
    );
    const skip = (page - 1) * pageSize;

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.propertyType) filter.propertyType = query.propertyType;
    if (query.listedFor) filter.listedFor = query.listedFor;
    if (query.leadId && Types.ObjectId.isValid(query.leadId)) {
      filter.leadId = new Types.ObjectId(query.leadId);
    }

    const search = String(query.search || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      Object.assign(filter, {
        $or: [{ title: re }, { address: re }, { city: re }, { description: re }],
      });
    }

    const [data, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .exec(),
      this.listingModel.countDocuments(filter),
    ]);

    return { data, total, page, pageSize };
  }

  /** Snapshot counts + portfolio value powering the list page KPI row. */
  async stats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalValue: number;
    availableValue: number;
  }> {
    // `applyCrmSoftDeletePlugin` only hooks find/findOne/countDocuments —
    // aggregate() bypasses it, so exclude soft-deleted docs explicitly here.
    const notDeleted = { $match: { isDeleted: { $ne: true } } };

    const [byStatusRows, totals] = await Promise.all([
      this.listingModel.aggregate([
        notDeleted,
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.listingModel.aggregate([
        notDeleted,
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalValue: { $sum: '$price' },
            availableValue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Available'] }, '$price', 0],
              },
            },
          },
        },
      ]),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) {
      byStatus[String(row._id || 'Unknown')] = row.count;
    }
    const t = totals[0] || { total: 0, totalValue: 0, availableValue: 0 };

    return {
      total: t.total || 0,
      byStatus,
      totalValue: t.totalValue || 0,
      availableValue: t.availableValue || 0,
    };
  }

  async findOne(id: string): Promise<PropertyListingDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Property listing not found');
    }
    const listing = await this.listingModel.findById(id).exec();
    if (!listing) throw new NotFoundException('Property listing not found');
    return listing;
  }

  async update(
    id: string,
    dto: UpdatePropertyListingDto,
  ): Promise<PropertyListingDocument> {
    const listing = await this.findOne(id);
    Object.assign(listing, dto, {
      listedDate: dto.listedDate ? new Date(dto.listedDate) : listing.listedDate,
    });
    await listing.save();
    return listing;
  }

  async remove(id: string, deletedBy?: string): Promise<{ success: boolean }> {
    await this.findOne(id);
    await this.listingModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy))
      .exec();
    return { success: true };
  }
}
