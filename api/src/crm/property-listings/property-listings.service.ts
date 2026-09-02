import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { ApprovalQueueBucket, TwoBighaPropertyService } from './twobigha-property.service';
import {
  PmAssignRole,
  TwoBighaPmAssignmentService,
  parseLivePmListingId,
} from './twobigha-pm-assignment.service';
import { TwoBighaPmCreateService } from './twobigha-pm-create.service';
import { TwoBighaPmWorkflowService } from './twobigha-pm-workflow.service';
import { TwoBighaSubscriptionsService } from '../subscriptions/twobigha-subscriptions.service';
import { PmActivityLogService } from '../subscriptions/pm-activity-log.service';
import { TwoBighaVisitsService } from '../visits/twobigha-visits.service';
import { applyManagedDetailToListing, mapLegalStatus } from './pm-listing-workflow.util';
import type {
  PmLegalActionDto,
  PmLegalChecklistDto,
  PmReviewReportDto,
  PmScheduleVisitDto,
  PmVisitStatusDto,
} from './dto/pm-workflow.dto';
import { CRMUsersService } from '../crm-users/crm-users.service';
import { Client, ClientDocument } from '../records/schemas/client.schema';
import { Contact, ContactDocument } from '../records/schemas/contact.schema';

const APPROVAL_QUEUE_BUCKETS: ApprovalQueueBucket[] = ['pending', 'approved', 'rejected'];

export interface PropertyListingListQuery {
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  status?: string;
  approvalStatus?: string;
  propertyType?: string;
  listedFor?: string;
  leadId?: string;
  listingBucket?: string;
  pmStage?: string;
}

import { StorageService } from '../../storage/storage.service';

@Injectable()
export class PropertyListingsService {
  private readonly logger = new Logger(PropertyListingsService.name);

  constructor(
    @InjectModel(PropertyListing.name, 'crmConnection')
    private readonly listingModel: Model<PropertyListingDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    private readonly twoBighaService: TwoBighaPropertyService,
    private readonly pmAssignment: TwoBighaPmAssignmentService,
    private readonly pmCreate: TwoBighaPmCreateService,
    private readonly pmWorkflow: TwoBighaPmWorkflowService,
    private readonly subscriptions: TwoBighaSubscriptionsService,
    private readonly pmActivityLog: PmActivityLogService,
    private readonly visits: TwoBighaVisitsService,
    private readonly crmUsers: CRMUsersService,
    private readonly storageService: StorageService,
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
      listingBucket: dto.listingBucket || (dto.propertyType === 'Farm' ? 'farm' : 'properties'),
      pmStage: dto.listingBucket === 'pm' ? dto.pmStage || 'Property Submitted' : dto.pmStage,
    });
    if (created.listingBucket === 'pm') {
      await this.syncPmToTwoBigha(created);
      void this.pmActivityLog.log({
        leadId: dto.leadId,
        propertyListingId: String(created._id),
        authorId: userId,
        eventType: 'pm_property_created',
        title: 'PM property created',
        content: `PM listing "${created.title || 'Untitled'}" was created on this lead.`,
        metadata: {
          listingBucket: 'pm',
          pmStage: created.pmStage,
          twobighaSyncStatus: created.twobighaSyncStatus,
        },
      });
    } else {
      await this.syncToTwoBigha(created);
    }
    return created;
  }

  /**
   * PM cases belong on the lead’s platform user as a managed property.
   * Never call marketplace createProperty here — that id is not a
   * userPropertyId and later PM assignment/visit APIs will reject it.
   */
  private async syncPmToTwoBigha(listing: PropertyListingDocument): Promise<void> {
    const userId = await this.resolvePmOwnerUserId(listing);
    if (!userId) {
      listing.twobighaSyncStatus = 'failed';
      listing.twobighaSyncError =
        'Link a lead whose client is synced to 2bigha (twobighaUserId) before creating a PM property. Marketplace createProperty is not used for PM.';
      listing.twobighaSyncedAt = new Date();
      await listing.save();
      return;
    }

    const area =
      typeof listing.areaValue === 'number' && listing.areaValue > 0
        ? listing.areaValue
        : typeof listing.areaBigha === 'number' && listing.areaBigha > 0
          ? listing.areaBigha
          : listing.areaSqft;

    const result = await this.pmCreate.createOrBind({
      listingId: String(listing._id),
      userId,
      title: listing.title,
      description: listing.description,
      propertyType: listing.propertyType,
      state: listing.state,
      district: listing.district,
      city: listing.city,
      village: listing.village,
      tehsil: listing.tehsil,
      area,
      areaUnit: listing.areaUnit,
      zipCode: listing.zipCode,
      khasraNumber: listing.khasraNumber,
      googleMapsLink: listing.googleMapsLink,
      existingPropertyId: this.managedPropertyIdFromListing(listing),
      existingUserPropertyId: listing.userPropertyId,
    });

    listing.userPropertyId = result.userPropertyId ?? listing.userPropertyId;
    listing.twobighaPropertyId = result.twobighaPropertyId ?? listing.twobighaPropertyId;
    listing.twobighaSyncStatus = result.status;
    listing.twobighaSyncError =
      result.status === 'failed' ? result.error : undefined;
    listing.twobighaSyncedAt = result.syncedAt;
    if (result.detail) listing.twobighaDetail = result.detail;
    await listing.save();

    const leadId = listing.leadId ? String(listing.leadId) : undefined;
    void this.pmActivityLog.log({
      leadId,
      propertyListingId: String(listing._id),
      eventType: result.status === 'synced' ? 'pm_sync_success' : 'pm_sync_failed',
      title: result.status === 'synced' ? 'PM synced to 2bigha' : 'PM sync to 2bigha failed',
      content:
        result.status === 'synced'
          ? `Property bound on 2bigha${result.userPropertyId ? ` (userPropertyId: ${result.userPropertyId})` : ''}.`
          : result.error || 'Unknown sync error.',
      metadata: {
        userPropertyId: result.userPropertyId,
        twobighaPropertyId: result.twobighaPropertyId,
        status: result.status,
        error: result.error,
      },
    });
  }

  /** Platform-user id on the linked lead’s client — required by createManagedPropertyByUser. */
  private async resolvePmOwnerUserId(listing: PropertyListingDocument): Promise<string | null> {
    if (!listing.leadId) return null;
    const lead = await this.leadModel
      .findById(listing.leadId)
      .select('clientId email phone mobileNo associatedContacts')
      .lean()
      .exec();
    if (!lead) return null;

    const linked = await this.resolveTwobighaUserIdForLead(lead as Record<string, any>);
    return linked?.twobighaUserId || null;
  }

  /**
   * Resolve the 2bigha platform user for a lead. Uses lead.clientId first, then
   * matches a synced Client by associated-contact email or lead email/phone.
   * Auto-links lead.clientId when a match is found (contact linked ≠ client linked).
   */
  private async resolveTwobighaUserIdForLead(
    lead: Record<string, any>,
  ): Promise<{ clientId: Types.ObjectId; twobighaUserId: string } | null> {
    const leadId = lead._id as Types.ObjectId | undefined;

    if (lead.clientId) {
      const client = await this.clientModel
        .findById(lead.clientId)
        .select('twobighaUserId')
        .lean()
        .exec();
      const userId = (client as { twobighaUserId?: string } | null)?.twobighaUserId?.trim();
      if (userId) {
        return { clientId: lead.clientId as Types.ObjectId, twobighaUserId: userId };
      }
    }

    const client = await this.findSyncedClientForLead(lead);
    if (!client?._id || !client.twobighaUserId?.trim()) return null;

    if (leadId && !lead.clientId) {
      await this.leadModel
        .updateOne(
          { _id: leadId, $or: [{ clientId: { $exists: false } }, { clientId: null }] },
          { $set: { clientId: client._id } },
        )
        .exec();
    }

    return {
      clientId: client._id as Types.ObjectId,
      twobighaUserId: client.twobighaUserId.trim(),
    };
  }

  private async findSyncedClientForLead(
    lead: Record<string, any>,
  ): Promise<{ _id: Types.ObjectId; twobighaUserId?: string } | null> {
    const emails = new Set<string>();
    const normalizeEmail = (v?: string) => v?.trim().toLowerCase();
    const addEmail = (v?: string) => {
      const e = normalizeEmail(v);
      if (e) emails.add(e);
    };

    addEmail(lead.email);
    const contactIds = (lead.associatedContacts as Types.ObjectId[] | undefined) || [];
    if (contactIds.length) {
      const contacts = await this.contactModel
        .find({ _id: { $in: contactIds } })
        .select('email additionalEmails')
        .lean()
        .exec();
      for (const c of contacts) {
        addEmail((c as { email?: string }).email);
        for (const extra of (c as { additionalEmails?: string[] }).additionalEmails || []) {
          addEmail(extra);
        }
      }
    }

    if (emails.size) {
      const byEmail = await this.clientModel
        .findOne({
          email: { $in: [...emails] },
          twobighaUserId: { $exists: true, $nin: [null, ''] },
        })
        .select('_id twobighaUserId')
        .lean()
        .exec();
      if (byEmail?.twobighaUserId?.trim()) return byEmail as { _id: Types.ObjectId; twobighaUserId?: string };
    }

    const phones = [lead.mobileNo, lead.phone]
      .map((p) => String(p || '').replace(/\D/g, ''))
      .filter((p) => p.length >= 10);
    if (phones.length) {
      const byPhone = await this.clientModel
        .findOne({
          $or: phones.flatMap((digits) => [
            { phone: { $regex: digits.slice(-10) } },
            { mobileNo: { $regex: digits.slice(-10) } },
          ]),
          twobighaUserId: { $exists: true, $nin: [null, ''] },
        })
        .select('_id twobighaUserId')
        .lean()
        .exec();
      if (byPhone?.twobighaUserId?.trim()) return byPhone as { _id: Types.ObjectId; twobighaUserId?: string };
    }

    return null;
  }

  /**
   * Only reuse a 2bigha id that came from createManagedPropertyByUser.
   * A leftover marketplace createProperty id is not valid for tagSubscriptionToProperty.
   */
  private managedPropertyIdFromListing(listing: PropertyListingDocument): string | undefined {
    const detail = listing.twobighaDetail as { property?: { id?: string }; id?: string } | undefined;
    const fromCreate = detail?.property?.id?.trim() || detail?.id?.trim();
    if (fromCreate) return fromCreate;
    if (listing.twobighaPropertyId) return listing.twobighaPropertyId;
    if (listing.userPropertyId && listing.twobighaPropertyId) return listing.twobighaPropertyId;
    return undefined;
  }

  /**
   * Push this listing to 2bigha — createProperty/updateProperty for every
   * propertyType except 'Farm', which routes to 2bigha's separate Farm API
   * (createFarmByAdmin) instead — and persist the outcome. Never throws — a
   * 2bigha outage or missing/mock credentials must not block adding/editing
   * a property on a Lead locally; the sync status is stored instead so it
   * can be retried (see `retrySync`) once the underlying issue is resolved.
   * PM listings must not use this path.
   */
  private async syncToTwoBigha(listing: PropertyListingDocument): Promise<void> {
    const input = {
      _id: String(listing._id),
      title: listing.title,
      address: listing.address,
      city: listing.city,
      district: listing.district,
      state: listing.state,
      zipCode: listing.zipCode,
      country: listing.country,
      price: listing.price,
      propertyType: listing.propertyType,
      areaSqft: listing.areaSqft,
      areaUnit: listing.areaUnit,
      khasraNumber: listing.khasraNumber,
      murabbaNumber: listing.murabbaNumber,
      khewatNumber: listing.khewatNumber,
      pricePerUnit: listing.pricePerUnit,
      waterLevel: listing.waterLevel,
      landMark: listing.landMark,
      landMarkName: listing.landMarkName,
      category: listing.category,
      highwayConn: listing.highwayConn,
      landZoning: listing.landZoning,
      ownersCount: listing.ownersCount,
      ownershipYes: listing.ownershipYes,
      soilType: listing.soilType,
      roadAccess: listing.roadAccess,
      roadAccessDistance: listing.roadAccessDistance,
      roadAccessWidth: listing.roadAccessWidth,
      roadAccessDistanceUnit: listing.roadAccessDistanceUnit,
      description: listing.description,
      status: listing.status,
      listerType: listing.listerType,
      contactName: listing.contactName,
      contactPhone: listing.contactPhone,
      whatsappNumber: listing.whatsappNumber,
      mapBoundaries: listing.mapBoundaries,
      mapCoordinates: listing.mapCoordinates,
      mapLocation: listing.mapLocation,
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
    if (listing.listingBucket === 'pm') {
      await this.syncPmToTwoBigha(listing);
    } else {
      await this.syncToTwoBigha(listing);
    }
    return listing;
  }

  /** Upload an image file buffer to Azure Blob Storage for 2Bigha and store clean Azure URL. */
  async uploadImageToAzure(file: Express.Multer.File): Promise<{ blobPath: string; url: string }> {
    let blobPath = `properties/temp/${Date.now()}_${file.originalname}`;
    let azureUrl = '';
    try {
      const azureResult = await this.twoBighaService.uploadBufferToAzure(file.buffer, file.mimetype, file.originalname);
      blobPath = azureResult.blobPath;
      azureUrl = azureResult.url;
    } catch (e: any) {
      console.warn('Azure upload error, falling back to local storage:', e?.message);
    }

    if (azureUrl) {
      return {
        blobPath,
        url: azureUrl,
      };
    }

    // Fallback if Azure service is temporarily unavailable
    const localUpload = await this.storageService.uploadFile(file, 'properties');
    return {
      blobPath,
      url: localUpload.url,
    };
  }

  /**
   * Live read-through to 2bigha's `getPropertyBySlug` — "the operation to
   * use for a property-detail display screen" per the handbook. For a
   * property/farm this CRM created, prefer the `twobighaDetail` snapshot
   * already stored on the listing (from the last create/update sync); this
   * is for the case where the CRM has a 2bigha slug from elsewhere.
   */
  async getTwoBighaDetailBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const liveData = await this.twoBighaService.getPropertyDetailBySlug(slug);
    const propertyId = (liveData?.property as any)?.id;

    // Check if we have a locally stored/synced listing in MongoDB
    const crmListing = await this.listingModel
      .findOne({
        $or: [
          { slug },
          ...(propertyId ? [{ twobighaPropertyId: propertyId }] : []),
        ],
      })
      .exec();

    if (!liveData && !crmListing) return null;

    if (liveData && crmListing) {
      const prop = (liveData.property as Record<string, unknown>) || {};
      const crmObj = crmListing.toObject() as unknown as Record<string, unknown>;
      const mergedImages =
        crmListing.images && crmListing.images.length > 0
          ? crmListing.images
          : (prop.images as any) || (liveData.images as any) || [];

      return {
        ...liveData,
        images: mergedImages,
        property: {
          ...prop,
          title: crmListing.title || prop.title,
          price: crmListing.price ?? prop.price,
          area: crmListing.areaSqft ?? prop.area,
          images: mergedImages,
          khasraNumber: crmListing.khasraNumber || prop.khasraNumber,
          murabbaNumber: crmObj.murabbaNumber || prop.murabbaNumber,
          khewatNumber: crmObj.khewatNumber || prop.khewatNumber,
          waterLevel: crmObj.waterLevel ?? prop.waterLevel,
          landMark: crmObj.landMark || prop.landMark,
          landMarkName: crmObj.landMarkName || prop.landMarkName,
          category: crmObj.category || prop.category,
          highwayConn: crmObj.highwayConn ?? prop.highwayConn,
          landZoning: crmObj.landZoning || prop.landZoning,
          ownershipYes: crmObj.ownershipYes ?? prop.ownershipYes,
          soilType: crmObj.soilType || prop.soilType,
          roadAccess: crmObj.roadAccess ?? prop.roadAccess,
          roadAccessDistance: crmObj.roadAccessDistance ?? prop.roadAccessDistance,
          roadAccessWidth: crmObj.roadAccessWidth ?? prop.roadAccessWidth,
          roadAccessDistanceUnit: crmObj.roadAccessDistanceUnit || prop.roadAccessDistanceUnit,
          contactName: crmListing.contactName || prop.contactName,
          contactPhone: crmListing.contactPhone || prop.contactPhone,
          whatsappNumber: crmObj.whatsappNumber || prop.whatsappNumber,
          listerType: crmObj.listerType || prop.listerType,
          mapBoundaries: crmObj.mapBoundaries || prop.mapBoundaries || prop.boundary,
          mapCoordinates: crmObj.mapCoordinates || prop.mapCoordinates,
          mapLocation: crmObj.mapLocation || prop.mapLocation || prop.location,
        },
      };
    }

    if (crmListing && !liveData) {
      const crmObj = crmListing.toObject() as unknown as Record<string, unknown>;
      return {
        property: crmObj,
        seo: { slug: (crmObj.slug as string) || slug },
      };
    }

    return liveData;
  }

  /** Live read-through to 2bigha's `getFarmBySlug` — the farm-detail display operation. */
  async getTwoBighaFarmBySlug(slug: string): Promise<Record<string, unknown> | null> {
    return this.twoBighaService.getFarmDetailBySlug(slug);
  }

  /** Live read-through to get farm/property media urls by slug. */
  async getTwoBighaFarmMedia(slug: string): Promise<string[]> {
    return this.twoBighaService.getPropertyMediaBySlug(slug);
  }

  /** Live read-through to 2bigha's `getFarms` — farm search/listing, for pulling 2bigha-native farm data into the CRM. */
  async listTwoBighaFarms(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
  }): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    return this.twoBighaService.listFarms(params);
  }

  /** Live read-through to 2bigha's standard properties search/listing. */
  async listTwoBighaProperties(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    status?: string;
    availablilityStatus?: string;
    approvalStatus?: string;
    sort?: {
      priceOrder?: string;
      newlyCreated?: boolean;
      nearMe?: { lat: number; lng: number };
    };
  }): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    return this.twoBighaService.listProperties(params);
  }

  /** Live read-through to 2bigha's `getAllManagedPropertiesByRole`. */
  async listTwoBighaManagedProperties(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    planName?: string;
    pmStage?: string;
  }) {
    return this.pmAssignment.listManagedProperties(params);
  }

  async getTwoBighaManagedProperty(id: string) {
    const listing = await this.pmAssignment.getManagedPropertyListing(id);
    if (!listing) throw new NotFoundException('Managed property not found');
    return listing;
  }

  /**
   * Live read-through to 2bigha's Property Approval Queue
   * (getPendingApprovalProperties/getApprovedProperties/getRejectedProperties).
   * Read-only — the handbook documents no confirmed approve/reject mutation,
   * so this only backs a review screen, not an action.
   */
  async listTwoBighaApprovalQueue(
    bucket: string,
    params: { page?: number; limit?: number; searchTerm?: string },
  ): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    if (!APPROVAL_QUEUE_BUCKETS.includes(bucket as ApprovalQueueBucket)) {
      throw new BadRequestException(
        `Invalid approval-queue bucket "${bucket}" — expected one of ${APPROVAL_QUEUE_BUCKETS.join(', ')}`,
      );
    }
    return this.twoBighaService.listApprovalQueue(bucket as ApprovalQueueBucket, params);
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
    if (query.listingBucket && query.listingBucket !== 'all') {
      filter.listingBucket = query.listingBucket;
    }
    if (query.pmStage && query.pmStage !== 'all') {
      filter.pmStage = query.pmStage;
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
  async stats(listingBucket?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    /** Property/Farm dashboard split — 'farm' = propertyType 'Farm', 'property' = everything else. */
    byType: { property: number; farm: number };
    byPmStage?: Record<string, number>;
    totalValue: number;
    availableValue: number;
  }> {
    if (listingBucket === 'pm') {
      const live = await this.pmAssignment.pmStageStats();
      return {
        total: live.total,
        byStatus: {},
        byType: { property: 0, farm: 0 },
        byPmStage: live.byPmStage,
        totalValue: 0,
        availableValue: 0,
      };
    }

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
    let listing: PropertyListingDocument | null = null;
    if (Types.ObjectId.isValid(id)) {
      listing = await this.listingModel.findById(id).exec();
    }
    if (!listing) {
      listing = await this.listingModel
        .findOne({ $or: [{ twobighaPropertyId: id }, { slug: id }] })
        .exec();
    }
    if (listing) return listing;

    throw new NotFoundException("Property listing not found");
  }

  async update(
    id: string,
    dto: UpdatePropertyListingDto,
  ): Promise<PropertyListingDocument> {
    let listing: PropertyListingDocument | null = null;
    if (Types.ObjectId.isValid(id)) {
      listing = await this.listingModel.findById(id).exec();
    }
    if (!listing) {
      listing = await this.listingModel
        .findOne({ $or: [{ twobighaPropertyId: id }, { slug: id }] })
        .exec();
    }

    if (!listing) {
      // Upsert a local record for this 2Bigha listing to track edits locally
      const cleanSlug = (dto as any).slug || id;
      listing = new this.listingModel({
        twobighaPropertyId: id,
        slug: cleanSlug,
        title: dto.title || "Untitled Property",
        propertyType: dto.propertyType || "Residential",
        price: dto.price ?? 0,
        currency: dto.currency || "INR",
        listedFor: dto.listedFor || "Sale",
        status: dto.status || "Available",
      });
    }

    Object.assign(listing, dto, {
      twobighaPropertyId: id,
      listedDate: dto.listedDate ? new Date(dto.listedDate) : listing.listedDate,
    });
    await listing.save();
    // Push changes to 2Bigha
    if (listing.listingBucket === 'pm') {
      await this.syncPmToTwoBigha(listing);
    } else {
      try {
        await this.syncToTwoBigha(listing);
      } catch (syncErr: any) {
        this.logger.warn(`2Bigha sync warning on update: ${syncErr?.message}`);
      }
    }

    return listing;
  }

  /** Mark property sold or available and sync sold status directly to 2bigha via updatePropertySoldStatus mutation. */
  async updateSoldStatus(
    id: string,
    isSold: boolean,
  ): Promise<PropertyListingDocument> {
    const listing = await this.findOne(id);
    listing.status = isSold ? 'Sold' : 'Available';
    await listing.save();

    if (listing.twobighaPropertyId) {
      const result = await this.twoBighaService.syncPropertySoldStatus(
        listing.twobighaPropertyId,
        isSold,
      );
      if (!result.success) {
        this.logger.warn(
          `Failed to sync sold status to 2bigha for listing ${listing._id}: ${result.error}`,
        );
      }
    }
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

  async decideApproval(
    id: string,
    status: 'Approved' | 'Rejected',
    message?: string,
  ): Promise<any> {
    const isMongoId = Types.ObjectId.isValid(id);
    let listing: PropertyListingDocument | null = null;
    if (isMongoId) {
      listing = await this.listingModel.findById(id).exec();
    } else {
      listing = await this.listingModel
        .findOne({ $or: [{ twobighaPropertyId: id }, { slug: id }] })
        .exec();
    }

    if (listing) {
      listing.approvalStatus = status;
      if (message) listing.approvalMessage = message;
      await listing.save();
    }

    const twobighaId = listing?.twobighaPropertyId || (!isMongoId ? id : undefined);
    if (twobighaId) {
      await this.twoBighaService.decidePropertyApproval(twobighaId, status, message);
    }

    return { success: true, id, status, message };
  }

  async remove(id: string, deletedBy?: string): Promise<{ success: boolean }> {
    await this.findOne(id);
    await this.listingModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy))
      .exec();
    return { success: true };
  }

  /** Get pre-signed Azure Blob upload URLs for property image uploads. */
  async getImageUploadUrls(count: number) {
    return this.twoBighaService.getImageUploadUrls(count);
  }

  /**
   * Combined staff picker for PM assignment: 2bigha role rosters
   * (getAllFieldAgentManagers / getAllLegalManagers / getAllFieldAgents)
   * plus CRM team members from Settings reconcile, so both sources show
   * in the same assign dropdown.
   */
  async listPmAssignmentStaff(searchTerm?: string) {
    const [managers, legal, field, crmUsers] = await Promise.all([
      this.pmAssignment.listManagers(searchTerm),
      this.pmAssignment.listLegalManagers(searchTerm),
      this.pmAssignment.listFieldAgents(searchTerm),
      this.crmUsers.findAll(),
    ]);

    const crmPeople = crmUsers.map((u) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email;
      const roleDoc = u.roleId as { name?: string } | undefined;
      return {
        id: String(u._id),
        source: 'crm' as const,
        name,
        email: u.email,
        twobighaAdminId: u.twobighaAdminId,
        crmUserId: String(u._id),
        synced: Boolean(u.twobighaAdminId),
        syncStatus: u.twobighaSyncStatus || 'not_synced',
        roleLabel: roleDoc?.name || u.role || 'CRM',
      };
    });

    const mapTwoBigha = (items: typeof managers.items, roleLabel: string) =>
      items.map((item) => {
        const name =
          [item.firstName, item.lastName].filter(Boolean).join(' ').trim() || item.email;
        const linked = crmPeople.find(
          (c) =>
            (c.twobighaAdminId && c.twobighaAdminId === String(item.adminId)) ||
            (c.email && item.email && c.email.toLowerCase() === item.email.toLowerCase()),
        );
        return {
          id: String(item.adminId),
          source: 'twobigha' as const,
          name,
          email: item.email,
          phone: item.phone,
          department: item.department,
          employeeId: item.employeeId,
          twobighaAdminId: String(item.adminId),
          crmUserId: linked?.crmUserId,
          synced: true,
          totalProperties: item.totalProperties,
          roleLabel,
        };
      });

    const twobighaIds = (rows: { twobighaAdminId?: string }[]) =>
      new Set(rows.map((r) => r.twobighaAdminId).filter(Boolean) as string[]);

    const crmOnly = (twobigha: ReturnType<typeof mapTwoBigha>) => {
      const ids = twobighaIds(twobigha);
      const emails = new Set(twobigha.map((r) => r.email?.toLowerCase()).filter(Boolean));
      return crmPeople.filter((c) => {
        if (c.twobighaAdminId && ids.has(c.twobighaAdminId)) return false;
        if (c.email && emails.has(c.email.toLowerCase())) return false;
        return true;
      });
    };

    const managerTb = mapTwoBigha(managers.items, 'Regional Manager');
    const legalTb = mapTwoBigha(legal.items, 'Legal Manager');
    const fieldTb = mapTwoBigha(field.items, 'Field Agent');

    return {
      manager: { twobigha: managerTb, crm: crmOnly(managerTb) },
      legal: { twobigha: legalTb, crm: crmOnly(legalTb) },
      field: { twobigha: fieldTb, crm: crmOnly(fieldTb) },
      mock: managers.mock || legal.mock || field.mock,
    };
  }

  private async resolvePmAssignee(body: {
    role: PmAssignRole;
    source: 'twobigha' | 'crm';
    id: string;
    name?: string;
  }): Promise<{ adminId: string; displayName: string; skippedReason?: string }> {
    let adminId = body.id;
    let displayName = body.name?.trim();
    let skippedReason: string | undefined;

    if (body.source === 'crm') {
      const user = await this.crmUsers.findById(body.id);
      if (!user) throw new NotFoundException('CRM team member not found');
      displayName =
        displayName ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email;
      if (!user.twobighaAdminId) {
        const synced = await this.crmUsers.resyncAgentToTwoBigha(body.id);
        if (!synced?.twobighaAdminId) {
          skippedReason =
            synced?.twobighaSyncError ||
            'CRM team member is not synced to 2bigha yet — assignment saved in CRM only.';
        } else {
          adminId = synced.twobighaAdminId;
        }
      } else {
        adminId = user.twobighaAdminId;
      }
    }

    return { adminId, displayName: displayName || adminId, skippedReason };
  }

  private applyLiveAssignee(
    listing: Record<string, any>,
    role: PmAssignRole,
    adminId: string,
    displayName: string,
  ) {
    const next = { ...listing };
    if (role === 'manager') {
      next.rmAssigneeId = adminId;
      next.rmAssigneeName = displayName;
      if (!next.pmStage || next.pmStage === 'Property Submitted') next.pmStage = 'Assigned to RM';
    } else if (role === 'legal') {
      next.legalAssigneeId = adminId;
      next.legalAssigneeName = displayName;
      if (next.pmStage === 'Assigned to RM' || next.pmStage === 'Property Submitted') {
        next.pmStage = 'Assigned to Legal';
      }
    } else {
      next.fieldAssigneeId = adminId;
      next.fieldAssigneeName = displayName;
      if (
        next.pmStage === 'Assigned to Legal' ||
        next.pmStage === 'Assigned to RM' ||
        next.pmStage === 'Property Submitted'
      ) {
        next.pmStage = 'Assigned to Field Agent';
      }
    }
    return next;
  }

  private liveAssigneeFields(listing: Record<string, any>, role: PmAssignRole) {
    if (role === 'manager') {
      return {
        rmAssigneeId: listing.rmAssigneeId,
        rmAssigneeName: listing.rmAssigneeName,
        pmStage: listing.pmStage,
      };
    }
    if (role === 'legal') {
      return {
        legalAssigneeId: listing.legalAssigneeId,
        legalAssigneeName: listing.legalAssigneeName,
        pmStage: listing.pmStage,
      };
    }
    return {
      fieldAssigneeId: listing.fieldAssigneeId,
      fieldAssigneeName: listing.fieldAssigneeName,
      pmStage: listing.pmStage,
    };
  }

  private async assignPmStaffLive(
    listingId: string,
    body: {
      role: PmAssignRole;
      source: 'twobigha' | 'crm';
      id: string;
      name?: string;
    },
  ) {
    const current = await this.pmAssignment.getManagedPropertyListing(listingId);
    if (!current) throw new NotFoundException('Managed property not found');
    const parsed = parseLivePmListingId(listingId);

    const { adminId, displayName, skippedReason } = await this.resolvePmAssignee(body);
    const patched = this.applyLiveAssignee(current, body.role, adminId, displayName);

    if (skippedReason) {
      return {
        listing: {
          ...patched,
          pmAssignmentSyncStatus: 'skipped',
          pmAssignmentSyncError: skippedReason,
        },
        twobigha: { status: 'skipped' as const, message: skippedReason },
      };
    }

    const onRoster = await this.pmAssignment.isOnRoleRoster(body.role, adminId);
    if (!onRoster) {
      const roleLabel =
        body.role === 'manager' ? 'Regional Manager' : body.role === 'legal' ? 'Legal Manager' : 'Field Agent';
      const message = `2bigha rejected this person as ${roleLabel}. Pick someone from “2bigha staff (live roster)” in that dropdown — CRM team / System Admin cannot be assigned to this role on 2bigha.`;
      return {
        listing: {
          ...patched,
          pmAssignmentSyncStatus: 'skipped',
          pmAssignmentSyncError: message,
        },
        twobigha: { status: 'skipped' as const, message },
      };
    }

    const userPropertyId = await this.pmAssignment.resolveUserPropertyId({
      userPropertyId: current.userPropertyId || parsed.userPropertyId,
      propertyId: current.twobighaPropertyId || parsed.propertyId,
    });
    if (!userPropertyId) {
      const message =
        'This 2bigha property has no managed subscription yet, so RM cannot be written to 2bigha. The assignment is shown here in CRM only. Open a PM case whose id starts with pm_ (not pm_prop_) to test a live assign.';
      return {
        listing: {
          ...patched,
          pmAssignmentSyncStatus: 'skipped',
          pmAssignmentSyncError: message,
        },
        twobigha: { status: 'skipped' as const, message },
      };
    }

    const alreadyAssigned =
      body.role === 'manager'
        ? Boolean(current.rmAssigneeId)
        : body.role === 'legal'
          ? Boolean(current.legalAssigneeId)
          : Boolean(current.fieldAssigneeId);

    try {
      const result = await this.pmAssignment.assign(
        body.role,
        userPropertyId,
        adminId,
        alreadyAssigned,
      );
      const listing =
        (await this.pmAssignment.getManagedPropertyListing(`pm_${userPropertyId}`)) || patched;
      const status = result?.message?.toLowerCase().includes('mock') ? 'mock' : 'synced';
      return {
        listing: { ...listing, ...this.liveAssigneeFields(patched, body.role), pmAssignmentSyncStatus: status },
        twobigha: { status, message: result?.message },
      };
    } catch (e: any) {
      const message = e?.message || '2bigha assignment failed';
      return {
        listing: {
          ...patched,
          pmAssignmentSyncStatus: 'failed',
          pmAssignmentSyncError: message,
        },
        twobigha: { status: 'failed' as const, message },
      };
    }
  }

  async assignPmStaff(
    listingId: string,
    body: {
      role: PmAssignRole;
      source: 'twobigha' | 'crm';
      id: string;
      name?: string;
    },
  ) {
    const role = body.role;
    if (!['manager', 'legal', 'field'].includes(role)) {
      throw new BadRequestException('role must be manager, legal, or field');
    }
    if (listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)) {
      return this.assignPmStaffLive(listingId, body);
    }

    const listing = await this.findOne(listingId);
    const resolved = await this.resolvePmAssignee(body);
    const adminId = resolved.adminId;
    const displayName = resolved.displayName;
    let skippedReason = resolved.skippedReason;
    if (!skippedReason && !(await this.pmAssignment.isOnRoleRoster(role, adminId))) {
      const roleLabel =
        role === 'manager' ? 'Regional Manager' : role === 'legal' ? 'Legal Manager' : 'Field Agent';
      skippedReason = `2bigha rejected this person as ${roleLabel}. Pick someone from “2bigha staff (live roster)” in that dropdown.`;
    }

    const alreadyAssigned =
      role === 'manager'
        ? Boolean(listing.rmAssigneeId)
        : role === 'legal'
          ? Boolean(listing.legalAssigneeId)
          : Boolean(listing.fieldAssigneeId);

    if (role === 'manager') {
      listing.rmAssigneeId = adminId;
      listing.rmAssigneeName = displayName;
      if (!listing.pmStage || listing.pmStage === 'Property Submitted') {
        listing.pmStage = 'Assigned to RM';
      }
    } else if (role === 'legal') {
      listing.legalAssigneeId = adminId;
      listing.legalAssigneeName = displayName;
      if (listing.pmStage === 'Assigned to RM' || listing.pmStage === 'Property Submitted') {
        listing.pmStage = 'Assigned to Legal';
      }
    } else {
      listing.fieldAssigneeId = adminId;
      listing.fieldAssigneeName = displayName;
      if (
        listing.pmStage === 'Assigned to Legal' ||
        listing.pmStage === 'Assigned to RM' ||
        listing.pmStage === 'Property Submitted'
      ) {
        listing.pmStage = 'Assigned to Field Agent';
      }
    }

    const userPropertyId = await this.pmAssignment.resolveUserPropertyId({
      userPropertyId: listing.userPropertyId,
      propertyId: listing.twobighaPropertyId,
    });
    if (userPropertyId && listing.userPropertyId !== userPropertyId) {
      listing.userPropertyId = userPropertyId;
    }

    let twobigha: { status: 'synced' | 'skipped' | 'failed' | 'mock'; message?: string } = {
      status: 'skipped',
      message:
        skippedReason ||
        'No 2bigha managed-property id on this listing yet. Assignment is saved in CRM; bind the PM property on 2bigha to push the assignment.',
    };

    if (!skippedReason && userPropertyId) {
      try {
        const result = await this.pmAssignment.assign(
          role,
          userPropertyId,
          adminId,
          alreadyAssigned,
        );
        listing.pmAssignmentSyncStatus = result?.message?.toLowerCase().includes('mock')
          ? 'mock'
          : 'synced';
        listing.pmAssignmentSyncError = undefined;
        twobigha = {
          status: listing.pmAssignmentSyncStatus === 'mock' ? 'mock' : 'synced',
          message: result?.message,
        };
      } catch (e: any) {
        listing.pmAssignmentSyncStatus = 'failed';
        listing.pmAssignmentSyncError = e?.message || '2bigha assignment failed';
        twobigha = { status: 'failed', message: listing.pmAssignmentSyncError };
      }
    } else {
      listing.pmAssignmentSyncStatus = 'skipped';
      listing.pmAssignmentSyncError = twobigha.message;
    }

    await listing.save();
    return { listing, twobigha };
  }

  async unassignPmStaff(listingId: string, role: PmAssignRole) {
    if (!Types.ObjectId.isValid(listingId) || listingId.startsWith('pm_')) {
      const current = await this.pmAssignment.getManagedPropertyListing(listingId);
      if (!current) throw new NotFoundException('Managed property not found');
      const parsed = parseLivePmListingId(listingId);
      const userPropertyId = await this.pmAssignment.resolveUserPropertyId({
        userPropertyId: current.userPropertyId || parsed.userPropertyId,
        propertyId: current.twobighaPropertyId || parsed.propertyId,
      });
      if (!userPropertyId) {
        throw new BadRequestException('This property has no 2bigha managed-property id to unassign.');
      }
      try {
        const result = await this.pmAssignment.unassign(role, userPropertyId);
        const listing =
          (await this.pmAssignment.getManagedPropertyListing(`pm_${userPropertyId}`)) || current;
        return { listing, twobigha: { status: 'synced', message: result?.message } };
      } catch (e: any) {
        return {
          listing: current,
          twobigha: { status: 'failed', message: e?.message || '2bigha unassign failed' },
        };
      }
    }

    const listing = await this.findOne(listingId);
    if (role === 'manager') {
      listing.rmAssigneeId = undefined;
      listing.rmAssigneeName = undefined;
      if (listing.pmStage === 'Assigned to RM') listing.pmStage = 'Property Submitted';
    } else if (role === 'legal') {
      listing.legalAssigneeId = undefined;
      listing.legalAssigneeName = undefined;
      if (listing.pmStage === 'Assigned to Legal') listing.pmStage = 'Assigned to RM';
    } else {
      listing.fieldAssigneeId = undefined;
      listing.fieldAssigneeName = undefined;
      if (listing.pmStage === 'Assigned to Field Agent') listing.pmStage = 'Assigned to Legal';
    }

    const userPropertyId = await this.pmAssignment.resolveUserPropertyId({
      userPropertyId: listing.userPropertyId,
      propertyId: listing.twobighaPropertyId,
    });
    let twobigha: { status: string; message?: string } = { status: 'skipped' };
    if (userPropertyId) {
      try {
        const result = await this.pmAssignment.unassign(role, userPropertyId);
        listing.pmAssignmentSyncStatus = 'synced';
        listing.pmAssignmentSyncError = undefined;
        twobigha = { status: 'synced', message: result?.message };
      } catch (e: any) {
        listing.pmAssignmentSyncStatus = 'failed';
        listing.pmAssignmentSyncError = e?.message || '2bigha unassign failed';
        twobigha = { status: 'failed', message: listing.pmAssignmentSyncError };
      }
    }
    await listing.save();
    return { listing, twobigha };
  }

  async getLeadPmOverview(leadId: string) {
    const lead = await this.leadModel
      .findById(leadId)
      .select('clientId phone mobileNo email associatedContacts')
      .lean()
      .exec();
    if (!lead) throw new NotFoundException('Lead not found');
    const resolved = await this.resolveTwobighaUserIdForLead(lead as Record<string, any>);
    const crmProperties = await this.listingModel
      .find({ leadId, listingBucket: 'pm', isDeleted: { $ne: true } })
      .select('title userPropertyId twobighaPropertyId pmStage')
      .lean()
      .exec();
    return this.subscriptions.getLeadPmOverview({
      twobighaUserId: resolved?.twobighaUserId,
      leadPhone: (lead as any).mobileNo || (lead as any).phone,
      leadEmail: (lead as any).email,
      crmProperties: crmProperties.map((p) => ({
        _id: String(p._id),
        title: p.title,
        userPropertyId: p.userPropertyId,
        twobighaPropertyId: p.twobighaPropertyId,
        pmStage: p.pmStage,
      })),
    });
  }

  private async resolvePmUserPropertyId(
    listingId: string,
    listing?: PropertyListingDocument | Record<string, any>,
  ): Promise<string> {
    const current =
      listing ||
      (listingId.startsWith('pm_')
        ? await this.pmAssignment.getManagedPropertyListing(listingId)
        : await this.findOne(listingId));
    if (!current) throw new NotFoundException('Property listing not found');
    const parsed = parseLivePmListingId(listingId);
    const userPropertyId = await this.pmAssignment.resolveUserPropertyId({
      userPropertyId: (current as any).userPropertyId || parsed.userPropertyId,
      propertyId: (current as any).twobighaPropertyId || parsed.propertyId,
    });
    if (!userPropertyId) {
      throw new BadRequestException(
        'No 2bigha userPropertyId on this PM case. Create/bind the managed property first.',
      );
    }
    return userPropertyId;
  }

  private async refreshPmListingState(
    listingId: string,
    listing: PropertyListingDocument | Record<string, any>,
    extras?: Parameters<typeof applyManagedDetailToListing>[2],
  ) {
    const userPropertyId =
      (listing as any).userPropertyId ||
      (await this.resolvePmUserPropertyId(listingId, listing).catch(() => null));
    const detail = userPropertyId
      ? await this.subscriptions.getManagedPropertyDetail(`pm_${userPropertyId}`)
      : null;
    let reportStatus = extras?.reportStatus;
    let reportId = extras?.reportId ?? (listing as any).pmWorkflowIds?.reportId;
    if (userPropertyId && !reportId) {
      try {
        const reports = await this.visits.getVisitReports({ userPropertyId });
        const rows = (reports as any)?.data?.rows || (reports as any)?.rows || [];
        const latest = Array.isArray(rows) ? rows[0] : null;
        if (latest) {
          reportId = Number(latest.id || latest.reportId);
          reportStatus = reportStatus || latest.status;
        }
      } catch {
        /* optional */
      }
    }
    return applyManagedDetailToListing(listing as any, detail, {
      ...extras,
      reportId,
      reportStatus,
    });
  }

  private async persistPmListing(
    listingId: string,
    patch: Record<string, any>,
  ): Promise<PropertyListingDocument | Record<string, any>> {
    if (listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)) {
      return patch;
    }
    const doc = await this.findOne(listingId);
    Object.assign(doc, patch);
    await doc.save();
    return doc;
  }

  async startPmLegalVerification(listingId: string, dto: PmLegalActionDto) {
    const userPropertyId = await this.resolvePmUserPropertyId(listingId);
    const result = await this.pmWorkflow.startLegalCheck(userPropertyId, dto.summary);
    if (!result.success) throw new BadRequestException(result.message);
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      legalVerification: {
        status: 'In progress',
        startedAt: new Date().toISOString(),
        summary: dto.summary,
        checklist: (base as any).legalVerification?.checklist || [],
      },
      pmStage: 'Assigned to Legal',
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async updatePmLegalChecklist(listingId: string, dto: PmLegalChecklistDto) {
    const userPropertyId = await this.resolvePmUserPropertyId(listingId);
    for (const item of dto.checklist || []) {
      await this.pmWorkflow.saveLegalChecklistItem(
        userPropertyId,
        item.id,
        item.checked,
        item.note,
      );
    }
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      legalVerification: {
        status: mapLegalStatus((base as any).legalVerification?.status) === 'Completed'
          ? 'Completed'
          : 'In progress',
        summary: dto.summary ?? (base as any).legalVerification?.summary,
        checklist: dto.checklist,
        startedAt: (base as any).legalVerification?.startedAt,
      },
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async completePmLegalVerification(listingId: string, dto: PmLegalActionDto) {
    const userPropertyId = await this.resolvePmUserPropertyId(listingId);
    const result = await this.pmWorkflow.completeLegalCheck(userPropertyId, dto.summary);
    if (!result.success) throw new BadRequestException(result.message);
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      legalVerification: {
        ...(base as any).legalVerification,
        status: 'Completed',
        completedAt: new Date().toISOString(),
        summary: dto.summary ?? (base as any).legalVerification?.summary,
      },
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async schedulePmFieldVisit(listingId: string, dto: PmScheduleVisitDto) {
    const userPropertyId = await this.resolvePmUserPropertyId(listingId);
    const result = await this.pmWorkflow.scheduleVisitDirectly({
      userPropertyId,
      agentId: dto.agentId,
      scheduledAt: dto.scheduledAt,
      visitCategory: dto.visitCategory,
      description: dto.description || dto.notes,
    });
    if (!result.success) throw new BadRequestException(result.message);
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      pmStage: 'Assigned to Field Agent',
      fieldVisit: {
        status: 'Pending',
        scheduledAt: dto.scheduledAt,
        notes: dto.notes,
      },
      pmWorkflowIds: {
        ...(base as any).pmWorkflowIds,
        fieldVisitId: result.fieldVisitId,
        visitRequestId: result.visitRequestId,
      },
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async setPmFieldVisitStatus(listingId: string, dto: PmVisitStatusDto) {
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const fieldVisitId = dto.fieldVisitId ?? (base as any).pmWorkflowIds?.fieldVisitId;
    if (fieldVisitId) {
      const mapped = this.pmWorkflow.mapVisitStatusToTwoBigha(dto.status);
      const result = await this.pmWorkflow.updateFieldVisitStatus(fieldVisitId, mapped);
      if (!result.success) throw new BadRequestException(result.message);
    }
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      fieldVisit: {
        ...(base as any).fieldVisit,
        status: dto.status,
        notes: dto.notes ?? (base as any).fieldVisit?.notes,
        completedAt:
          dto.status === 'Complete' ? new Date().toISOString() : (base as any).fieldVisit?.completedAt,
      },
      visitStatus: dto.status === 'Complete' ? 'COMPLETED' : mappedVisitForExtras(dto.status),
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async submitPmVisitReport(listingId: string) {
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      pmStage: 'Visit Report Pending',
      fieldVisit: { ...(base as any).fieldVisit, status: 'Complete' },
      visitReport: {
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      },
      reportStatus: 'SUBMITTED',
    });
    return this.persistPmListing(listingId, refreshed);
  }

  async reviewPmVisitReport(listingId: string, dto: PmReviewReportDto) {
    const userPropertyId = await this.resolvePmUserPropertyId(listingId);
    const base =
      listingId.startsWith('pm_') || !Types.ObjectId.isValid(listingId)
        ? (await this.pmAssignment.getManagedPropertyListing(listingId)) || { _id: listingId }
        : await this.findOne(listingId);
    let reportId = dto.reportId ?? (base as any).pmWorkflowIds?.reportId;
    if (!reportId) {
      const reports = await this.visits.getVisitReports({ userPropertyId });
      const rows = (reports as any)?.data?.rows || (reports as any)?.rows || [];
      reportId = rows?.[0]?.id ? Number(rows[0].id) : undefined;
    }
    if (!reportId) throw new BadRequestException('No visit report id found on 2bigha for this property.');

    let result;
    if (dto.sections?.length) {
      result = await this.pmWorkflow.reviewReportSections(
        reportId,
        dto.sections.map((s) => ({
          sectionKey: s.id,
          status: s.checked ? 'APPROVED' : 'REJECTED',
          comment: s.note,
        })),
      );
    } else if (dto.reschedule && dto.decision === 'Rejected') {
      result = await this.pmWorkflow.rejectReportAndReschedule({
        reportId,
        reason: dto.rejectionReason || 'Rejected from CRM',
        agentId: dto.agentId,
        scheduledAt: dto.scheduledAt,
      });
    } else {
      result = await this.pmWorkflow.reviewVisitReport(
        reportId,
        dto.decision,
        dto.rejectionReason,
      );
    }
    if (!result.success) throw new BadRequestException(result.message);

    const refreshed = await this.refreshPmListingState(listingId, {
      ...base,
      pmStage:
        dto.decision === 'Approved' ? 'Visit Report Approved' : 'Visit Report Rejected',
      visitReport: {
        status: dto.decision,
        rejectionReason: dto.rejectionReason,
        reviewedAt: new Date().toISOString(),
      },
      reportId,
      reportStatus: dto.decision === 'Approved' ? 'APPROVED' : 'REJECTED',
      pmWorkflowIds: { ...(base as any).pmWorkflowIds, reportId },
    });
    return this.persistPmListing(listingId, refreshed);
  }
}

function mappedVisitForExtras(status: string): string | undefined {
  if (status === 'Complete') return 'COMPLETED';
  if (status === 'Cancel') return 'CANCELLED';
  if (status === 'Pending') return 'SCHEDULED';
  return undefined;
}
