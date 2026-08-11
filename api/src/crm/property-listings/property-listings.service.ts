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
