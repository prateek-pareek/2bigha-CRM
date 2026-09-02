import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PropertyListingsService } from './property-listings.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CreatePropertyListingDto } from './dto/create-property-listing.dto';
import { UpdatePropertyListingDto } from './dto/update-property-listing.dto';

@Controller('crm/property-listings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PropertyListingsController {
  constructor(private readonly listingsService: PropertyListingsService) {}

  @Post('twobigha/upload-image-proxy')
  @Permissions('property_listings:write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadImageProxy(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.listingsService.uploadImageToAzure(file);
  }

  @Get()
  @Permissions('property_listings:read')
  findAll(@Query() query: Record<string, string>) {
    return this.listingsService.findAll(query);
  }

  @Get('stats')
  @Permissions('property_listings:read')
  stats() {
    return this.listingsService.stats();
  }

  /** Live read-through to 2bigha's getPropertyBySlug — the property-detail display screen operation per the Integration Handbook. */
  @Get('twobigha/by-slug/:slug')
  @Permissions('property_listings:read')
  getTwoBighaDetailBySlug(@Param('slug') slug: string) {
    return this.listingsService.getTwoBighaDetailBySlug(slug);
  }

  /** Live read-through to 2bigha's getFarms — farm search/listing. */
  @Get('twobigha/farms')
  @Permissions('property_listings:read')
  listTwoBighaFarms(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
  ) {
    return this.listingsService.listTwoBighaFarms({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      searchTerm,
    });
  }

  /** Live read-through to 2bigha's standard properties search/listing. */
  @Get('twobigha/properties')
  @Permissions('property_listings:read')
  listTwoBighaProperties(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('status') status?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('priceOrder') priceOrder?: string,
    @Query('newlyCreated') newlyCreated?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const sort: Record<string, unknown> = {};
    if (priceOrder) sort.priceOrder = priceOrder;
    if (newlyCreated === 'true' || newlyCreated === '1') sort.newlyCreated = true;
    if (lat && lng) sort.nearMe = { lat: Number(lat), lng: Number(lng) };

    return this.listingsService.listTwoBighaProperties({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      searchTerm,
      status,
      approvalStatus,
      sort: Object.keys(sort).length ? (sort as any) : undefined,
    });
  }

  /** Live read-through to 2bigha's getFarmBySlug — the farm-detail display operation. */
  @Get('twobigha/farms/by-slug/:slug')
  @Permissions('property_listings:read')
  getTwoBighaFarmBySlug(@Param('slug') slug: string) {
    return this.listingsService.getTwoBighaFarmBySlug(slug);
  }

  /** Fetch live farm listing images by its slug dynamically. */
  @Get('twobigha/farms/media/:slug')
  @Permissions('property_listings:read')
  async getTwoBighaFarmMedia(@Param('slug') slug: string) {
    const images = await this.listingsService.getTwoBighaFarmMedia(slug);
    return { images };
  }

  /** Get pre-signed Azure Blob upload URLs for property image uploads. */
  @Get('twobigha/image-upload-urls')
  @Permissions('property_listings:write')
  getImageUploadUrls(@Query('count') count?: string) {
    const num = count ? Number(count) : 1;
    return this.listingsService.getImageUploadUrls(num);
  }

  /**
   * Live read-through to 2bigha's Property Approval Queue — `:bucket` is
   * one of pending|approved|rejected, mapping to getPendingApprovalProperties/
   * getApprovedProperties/getRejectedProperties. Read-only review screen: no
   * confirmed approve/reject mutation exists in the documented API yet.
   */
  @Get('twobigha/approval-queue/:bucket')
  @Permissions('property_listings:read')
  listTwoBighaApprovalQueue(
    @Param('bucket') bucket: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
  ) {
    return this.listingsService.listTwoBighaApprovalQueue(bucket, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      searchTerm,
    });
  }

  /** Leads-table batch counts (property + farm) — avoids N+1 calls per row. */
  @Post('counts-by-lead')
  @Permissions('property_listings:read')
  countsByLead(@Body() body: { ids?: string[] }) {
    return this.listingsService.countsByLeadIds(body?.ids || []);
  }

  /** Agent Performance leaderboard — properties/farms listed per agent, merged client-side. */
  @Get('counts-by-agent')
  @Permissions('property_listings:read')
  countsByAgent(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.listingsService.countsByCreatedBy({ dateFrom, dateTo });
  }

  /**
   * Transfer Lead — full ownership transfer to another agent, blocked once
   * the lead already has ≥1 property/farm listed (per the FRD's restriction).
   */
  @Post('transfer-lead/:leadId')
  @Permissions('leads:write')
  transferLead(
    @Param('leadId') leadId: string,
    @Body() body: { ownerName?: string },
  ) {
    return this.listingsService.transferLead(leadId, body?.ownerName || '');
  }

  @Get(':id')
  @Permissions('property_listings:read')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Post()
  @Permissions('property_listings:write')
  create(@Request() req: any, @Body() dto: CreatePropertyListingDto) {
    return this.listingsService.create(dto, req.user?.userId);
  }

  @Put(':id')
  @Permissions('property_listings:write')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyListingDto) {
    return this.listingsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('property_listings:delete')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.listingsService.remove(id, req.user?.userId);
  }

  @Post('approval-decision')
  @Permissions('property_listings:write')
  decideApproval(
    @Body() body: { id: string; status: 'Approved' | 'Rejected'; message?: string },
  ) {
    return this.listingsService.decideApproval(body.id, body.status, body.message);
  }

  /** Manual retry for a listing whose last sync to 2bigha failed (or is still mock-only). */
  @Post(':id/sync-2bigha')
  @Permissions('property_listings:write')
  retrySync(@Param('id') id: string) {
    return this.listingsService.retrySync(id);
  }

  /** Update sold status and sync directly to 2bigha updatePropertySoldStatus mutation. */
  @Patch(':id/sold-status')
  @Permissions('property_listings:write')
  updateSoldStatus(
    @Param('id') id: string,
    @Body() body: { isSold: boolean },
  ) {
    return this.listingsService.updateSoldStatus(id, Boolean(body.isSold));
  }
}
