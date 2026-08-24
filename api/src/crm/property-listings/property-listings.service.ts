import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PropertyListing,
  PropertyListingDocument,
} from './schemas/property-listing.schema';
import { CreatePropertyListingDto } from './dto/create-property-listing.dto';
import { UpdatePropertyListingDto } from './dto/update-property-listing.dto';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { TwoBighaPropertyService } from './twobigha-property.service';

export interface PropertyListingListQuery {
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  status?: string;
  approvalStatus?: string;
  propertyType?: string;
  listedFor?: string;
  leadId?: string;
}

@Injectable()
export class PropertyListingsService {
  constructor(
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly listingModel: Model<PropertyListingDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    private readonly twoBighaService: TwoBighaPropertyService,
  ) {}

  async create(
    dto: CreatePropertyListingDto,
    userId?: string,
  ): Promise<PropertyListingDocument> {
    const created = await this.listingModel.create({
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
    await this.syncToTwoBigha(created);
    return created;
  }

  /**
   * Push this listing to 2bigha — createProperty/updateProperty for every
   * propertyType except 'Farm', which routes to 2bigha's separate Farm API
   * (createFarmByAdmin) instead — and persist the outcome. Never throws — a
   * 2bigha outage or missing/mock credentials must not block adding/editing
   * a property on a Lead locally; the sync status is stored instead so it
   * can be retried (see `retrySync`) once the underlying issue is resolved.
   */
  private async syncToTwoBigha(listing: PropertyListingDocument): Promise<void> {
    const input = {
      _id: String(listing._id),
      title: listing.title,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zipCode: listing.zipCode,
      country: listing.country,
      price: listing.price,
      propertyType: listing.propertyType,
      areaSqft: listing.areaSqft,
      description: listing.description,
      status: listing.status,
      contactName: listing.contactName,
      contactPhone: listing.contactPhone,
      images: listing.images,
      twobighaPropertyId: listing.twobighaPropertyId,
    };
    const isFarm = listing.propertyType === 'Farm';
    const result = isFarm
      ? listing.twobighaPropertyId
        ? await this.twoBighaService.syncFarmUpdate(input)
        : await this.twoBighaService.syncFarmCreate(input)
      : listing.twobighaPropertyId
        ? await this.twoBighaService.syncPropertyUpdate(input)
        : await this.twoBighaService.syncPropertyCreate(input);

    listing.twobighaPropertyId = result.twobighaPropertyId ?? listing.twobighaPropertyId;
    listing.twobighaSyncStatus = result.status;
    listing.twobighaSyncError =
      result.status === 'failed' || result.status === 'unsupported' ? result.error : undefined;
    listing.twobighaSyncedAt = result.syncedAt;
    if (result.detail) listing.twobighaDetail = result.detail;
    await listing.save();
  }

  /** Manual retry for a listing whose last 2bigha sync failed (or is still mock-only). */
  async retrySync(id: string): Promise<PropertyListingDocument> {
    const listing = await this.findOne(id);
    await this.syncToTwoBigha(listing);
    return listing;
  }

  /**
   * Live read-through to 2bigha's `getPropertyBySlug` — "the operation to
   * use for a property-detail display screen" per the handbook. For a
   * property/farm this CRM created, prefer the `twobighaDetail` snapshot
   * already stored on the listing (from the last create/update sync); this
   * is for the case where the CRM has a 2bigha slug from elsewhere.
   */
  async getTwoBighaDetailBySlug(slug: string): Promise<Record<string, unknown> | null> {
    return this.twoBighaService.getPropertyDetailBySlug(slug);
  }

  /** Live read-through to 2bigha's `getFarmBySlug` — the farm-detail display operation. */
  async getTwoBighaFarmBySlug(slug: string): Promise<Record<string, unknown> | null> {
    return this.twoBighaService.getFarmDetailBySlug(slug);
  }

  /** Live read-through to 2bigha's `getFarms` — farm search/listing, for pulling 2bigha-native farm data into the CRM. */
  async listTwoBighaFarms(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
  }): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    return this.twoBighaService.listFarms(params);
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
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
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
    /** Property/Farm dashboard split — 'farm' = propertyType 'Farm', 'property' = everything else. */
    byType: { property: number; farm: number };
    totalValue: number;
    availableValue: number;
  }> {
    // `applyCrmSoftDeletePlugin` only hooks find/findOne/countDocuments —
    // aggregate() bypasses it, so exclude soft-deleted docs explicitly here.
    const notDeleted = { $match: { isDeleted: { $ne: true } } };

    const [byStatusRows, byTypeRows, totals] = await Promise.all([
      this.listingModel.aggregate([
        notDeleted,
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.listingModel.aggregate([
        notDeleted,
        {
          $group: {
            _id: { $cond: [{ $eq: ['$propertyType', 'Farm'] }, 'farm', 'property'] },
            count: { $sum: 1 },
          },
        },
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
    const byType = { property: 0, farm: 0 };
    for (const row of byTypeRows) {
      if (row._id === 'farm') byType.farm = row.count;
      else byType.property = row.count;
    }
    const t = totals[0] || { total: 0, totalValue: 0, availableValue: 0 };

    return {
      total: t.total || 0,
      byStatus,
      byType,
      totalValue: t.totalValue || 0,
      availableValue: t.availableValue || 0,
    };
  }

  /**
   * Batch property/farm counts for a set of leads — powers the leads-table
   * row counts + "Add Property"/"Add Farm" quick actions without N+1 calls.
   */
  async countsByLeadIds(
    leadIds: string[],
  ): Promise<Record<string, { propertyCount: number; farmCount: number }>> {
    const oids = leadIds
      .map((id) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null))
      .filter((o): o is Types.ObjectId => !!o);
    if (!oids.length) return {};

    const rows = await this.listingModel.aggregate([
      { $match: { leadId: { $in: oids }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { lead: '$leadId', isFarm: { $eq: ['$propertyType', 'Farm'] } },
          count: { $sum: 1 },
        },
      },
    ]);

    const result: Record<string, { propertyCount: number; farmCount: number }> = {};
    for (const row of rows) {
      const leadId = String(row._id.lead);
      if (!result[leadId]) result[leadId] = { propertyCount: 0, farmCount: 0 };
      if (row._id.isFarm) result[leadId].farmCount += row.count;
      else result[leadId].propertyCount += row.count;
    }
    return result;
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
    await this.syncToTwoBigha(listing);
    return listing;
  }

  /**
   * Properties + farms listed per agent within a date range — merged
   * client-side into the Agent Performance leaderboard (ReportingService
   * lives in a different module and can't inject PropertyListing directly).
   */
  async countsByCreatedBy(options?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Record<string, { propertyCount: number; farmCount: number }>> {
    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      createdBy: { $exists: true, $ne: null },
    };
    if (options?.dateFrom || options?.dateTo) {
      const range: Record<string, Date> = {};
      if (options.dateFrom) range.$gte = new Date(options.dateFrom);
      if (options.dateTo) range.$lte = new Date(options.dateTo);
      match.createdAt = range;
    }
    const rows = await this.listingModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { agent: '$createdBy', isFarm: { $eq: ['$propertyType', 'Farm'] } },
          count: { $sum: 1 },
        },
      },
    ]);
    const result: Record<string, { propertyCount: number; farmCount: number }> = {};
    for (const row of rows) {
      const agentId = String(row._id.agent);
      if (!result[agentId]) result[agentId] = { propertyCount: 0, farmCount: 0 };
      if (row._id.isFarm) result[agentId].farmCount += row.count;
      else result[agentId].propertyCount += row.count;
    }
    return result;
  }

  /**
   * Transfer Lead — full ownership transfer to another agent, distinct from
   * bulk Reassign (`CRMService.bulkAssignLeads`). Restricted once the lead
   * already has ≥1 property/farm listed, per the FRD.
   */
  async transferLead(leadId: string, ownerName: string) {
    const trimmedOwner = ownerName.trim();
    if (!trimmedOwner) throw new BadRequestException('Owner is required');
    if (!Types.ObjectId.isValid(leadId)) {
      throw new BadRequestException('Invalid lead id');
    }
    const propertyCount = await this.listingModel.countDocuments({
      leadId: new Types.ObjectId(leadId),
      isDeleted: { $ne: true },
    });
    if (propertyCount > 0) {
      throw new ForbiddenException(
        'Cannot transfer a lead with properties/farms already listed — remove or reassign the listings first.',
      );
    }
    const updated = await this.leadModel
      .findByIdAndUpdate(leadId, { $set: { leadOwner: trimmedOwner } }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Lead not found');
    // `_id` here (not just `leadId`) so the global AuditLogInterceptor attributes this
    // action to the lead's entityId — surfaces in the lead's own Update History tab.
    return { _id: leadId, leadId, ownerName: trimmedOwner };
  }

  async remove(id: string, deletedBy?: string): Promise<{ success: boolean }> {
    await this.findOne(id);
    await this.listingModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy))
      .exec();
    return { success: true };
  }
}
