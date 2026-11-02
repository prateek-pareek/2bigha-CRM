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
import { AssignPmStaffDto, UnassignPmStaffDto } from './dto/assign-pm-staff.dto';
import {
  PmLegalActionDto,
  PmLegalChecklistDto,
  PmReviewReportDto,
  PmScheduleVisitDto,
  PmVisitStatusDto,
} from './dto/pm-workflow.dto';
import {
  PropertyHistoryInput,
  PropertyHistoryService,
} from './property-history.service';

const PM_ROLE_LABEL: Record<string, string> = {
  manager: 'Regional Manager',
  legal: 'Legal Manager',
  field: 'Field Agent',
};

/** PM stage from an action / live-status result (listing doc or `{ listing }`). */
function pmStageOf(result: any): string | undefined {
  const s = result?.pmStage ?? result?.listing?.pmStage;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

function propertyTitleOf(result: any): string | undefined {
  const x = result?.listing ?? result;
  const t = x?.title || x?.propertyName;
  return typeof t === 'string' && t.trim() ? t.trim() : undefined;
}

function formatWhen(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type HistoryDescription = Omit<PropertyHistoryInput, 'propertyKey' | 'fromStage'>;

@Controller('crm/property-listings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PropertyListingsController {
  constructor(
    private readonly listingsService: PropertyListingsService,
    private readonly history: PropertyHistoryService,
  ) {}

  /**
   * Run a PM action, then record it in the property's history (and the CRM audit log)
   * with the stage before -> after. Only successful actions are recorded.
   */
  private async track<T>(
    propertyKey: string,
    req: any,
    run: () => Promise<T>,
    describe: (result: T) => HistoryDescription,
  ): Promise<T> {
    const fromStage = await this.history.lastStage(propertyKey).catch(() => undefined);
    const result = await run();
    try {
      await this.history.record(
        {
          propertyKey,
          propertyTitle: propertyTitleOf(result),
          toStage: pmStageOf(result),
          ...describe(result),
          fromStage,
        },
        req?.user,
      );
    } catch {
      /* history is best-effort */
    }
    return result;
  }

  @Post('twobigha/upload-image-proxy')
  @Permissions('property-listings:write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadImageProxy(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.listingsService.uploadImageToAzure(file);
  }

  @Get()
  @Permissions('property-listings:read')
  findAll(@Query() query: Record<string, string>, @Request() req?: any) {
    return this.listingsService.findAll({ ...query, user: req?.user });
  }

  @Get('pm/assignment-staff')
  @Permissions('property-listings:read', 'leads:read')
  listPmAssignmentStaff(@Query('search') search?: string) {
    return this.listingsService.listPmAssignmentStaff(search);
  }

  @Get('pm/lead-overview/:leadId')
  @Permissions('property-listings:read', 'leads:read')
  getLeadPmOverview(@Param('leadId') leadId: string) {
    return this.listingsService.getLeadPmOverview(leadId);
  }

  @Get('stats')
  @Permissions('property-listings:read')
  stats(@Query('listingBucket') listingBucket?: string) {
    return this.listingsService.stats(listingBucket);
  }

  /** Live read-through to 2bigha's getPropertyBySlug — the property-detail display screen operation per the Integration Handbook. */
  @Get('twobigha/by-slug/:slug')
  @Permissions('property-listings:read')
  getTwoBighaDetailBySlug(@Param('slug') slug: string) {
    return this.listingsService.getTwoBighaDetailBySlug(slug);
  }

  /** Live read-through to 2bigha's getFarms — farm search/listing. */
  @Get('twobigha/farms')
  @Permissions('property-listings:read')
  listTwoBighaFarms(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('approvalStatus') approvalStatus?: string,
  ) {
    return this.listingsService.listTwoBighaFarms({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      searchTerm,
      approvalStatus,
    });
  }

  /** Live read-through to 2bigha's standard properties search/listing. */
  @Get('twobigha/properties')
  @Permissions('property-listings:read')
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

  /** Live read-through to 2bigha's getAllManagedPropertiesByRole — PM pipeline list. */
  @Get('twobigha/managed-properties')
  @Permissions('property-listings:read')
  listTwoBighaManagedProperties(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('planName') planName?: string,
    @Query('pmStage') pmStage?: string,
  ) {
    return this.listingsService.listTwoBighaManagedProperties({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      searchTerm,
      planName,
      pmStage,
    });
  }

  @Get('twobigha/managed-properties/:id')
  @Permissions('property-listings:read')
  getTwoBighaManagedProperty(@Param('id') id: string) {
    return this.listingsService.getTwoBighaManagedProperty(id);
  }

  /** Live read-through to 2bigha's getFarmBySlug — the farm-detail display operation. */
  @Get('twobigha/farms/by-slug/:slug')
  @Permissions('property-listings:read')
  getTwoBighaFarmBySlug(@Param('slug') slug: string) {
    return this.listingsService.getTwoBighaFarmBySlug(slug);
  }

  /** Fetch live farm listing images by its slug dynamically. */
  @Get('twobigha/farms/media/:slug')
  @Permissions('property-listings:read')
  async getTwoBighaFarmMedia(@Param('slug') slug: string) {
    const images = await this.listingsService.getTwoBighaFarmMedia(slug);
    return { images };
  }

  /** Get pre-signed Azure Blob upload URLs for property image uploads. */
  @Get('twobigha/image-upload-urls')
  @Permissions('property-listings:write')
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
  @Permissions('approval-queue:read')
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
  @Permissions('property-listings:read')
  countsByLead(@Body() body: { ids?: string[] }) {
    return this.listingsService.countsByLeadIds(body?.ids || []);
  }

  /** Agent Performance leaderboard — properties/farms listed per agent, merged client-side. */
  @Get('counts-by-agent')
  @Permissions('property-listings:read')
  countsByAgent(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.listingsService.countsByCreatedBy({ dateFrom, dateTo });
  }

  /**
   * Transfer Lead — full ownership transfer to another agent, blocked once
   * the lead already has ≥1 property/farm listed (per the FRD's restriction).
   */
  @Post('transfer-lead/:leadId')
  @Permissions('leads:assign')
  transferLead(
    @Param('leadId') leadId: string,
    @Body() body: { ownerName?: string },
    @Request() req: any,
  ) {
    return this.listingsService.transferLead(leadId, body?.ownerName || '', req.user);
  }

  @Get(':id')
  @Permissions('property-listings:read')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Post()
  @Permissions('property-listings:write')
  create(@Request() req: any, @Body() dto: CreatePropertyListingDto) {
    return this.listingsService.create(dto, req.user?.userId);
  }

  @Put(':id')
  @Permissions('property-listings:write')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyListingDto) {
    return this.listingsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('property-listings:delete')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.listingsService.remove(id, req.user?.userId);
  }

  @Post('approval-decision')
  @Permissions('property-listings:write')
  decideApproval(
    @Request() req: any,
    @Body() body: { id: string; status: 'Approved' | 'Rejected'; message?: string },
  ) {
    return this.track(
      String(body?.id || ''),
      req,
      () => this.listingsService.decideApproval(body.id, body.status, body.message, req.user?.userId),
      () => ({
        action: 'approval_decision',
        label: `Listing ${String(body.status || '').toLowerCase() || 'reviewed'}`,
        detail: body.message || undefined,
        auditAction: body.status === 'Rejected' ? 'reject' : 'approve',
        meta: { approvalStatus: body.status },
      }),
    );
  }

  /** Manual retry for a listing whose last sync to 2bigha failed (or is still mock-only). */
  @Post(':id/sync-2bigha')
  @Permissions('property-listings:write')
  retrySync(@Param('id') id: string) {
    return this.listingsService.retrySync(id);
  }

  /** Update sold status and sync directly to 2bigha updatePropertySoldStatus mutation. */
  @Patch(':id/sold-status')
  @Permissions('property-listings:write')
  updateSoldStatus(
    @Param('id') id: string,
    @Body() body: { isSold: boolean },
    @Request() req: any,
  ) {
    const isSold = Boolean(body?.isSold);
    return this.track(
      id,
      req,
      () => this.listingsService.updateSoldStatus(id, isSold),
      () => ({
        action: 'sold_status',
        label: isSold ? 'Marked as Sold' : 'Marked as Available',
        auditAction: 'status',
        meta: { status: isSold ? 'Sold' : 'Available' },
      }),
    );
  }

  /** Live PM aggregated status read-through for Stages 3-6. */
  @Get(':id/pm/live-status')
  @Permissions('property-listings:read')
  async getLivePmStatus(@Param('id') id: string) {
    const result = await this.listingsService.getLivePmStatus(id);
    // Catch stage changes made directly in 2bigha since the last recorded event.
    await this.history.syncStage(id, pmStageOf(result), propertyTitleOf(result));
    return result;
  }

  /** Status & history timeline for one property (works for 2bigha-only ids too). */
  @Get(':id/history')
  @Permissions('property-listings:read')
  getHistory(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.history.list(id, limit ? Number(limit) : undefined);
  }

  @Post(':id/history/note')
  @Permissions('property-listings:write')
  addHistoryNote(
    @Param('id') id: string,
    @Body() body: { text?: string; propertyTitle?: string },
    @Request() req: any,
  ) {
    return this.history.addNote(id, String(body?.text || ''), req.user, body?.propertyTitle);
  }

  /** Drill into full visit report details by reportId. */
  @Get('pm/reports/:reportId')
  @Permissions('property-listings:read')
  getVisitReportDetail(@Param('reportId') reportId: string) {
    return this.listingsService.getVisitReportDetail(Number(reportId));
  }

  @Post(':id/pm/assign')
  @Permissions('property-listings:write', 'leads:write')
  assignPmStaff(@Param('id') id: string, @Body() body: AssignPmStaffDto, @Request() req: any) {
    return this.track(
      id,
      req,
      () =>
        this.listingsService.assignPmStaff(id, {
          role: body.role,
          source: body.source,
          id: body.id,
          name: body.name,
        }),
      (result: any) => ({
        action: 'pm_staff_assigned',
        label: `${PM_ROLE_LABEL[body.role] || 'Staff'} assigned: ${body.name || body.id}`,
        detail: result?.skippedReason || undefined,
        auditAction: 'assign',
        meta: { role: body.role, assignee: body.name || body.id },
      }),
    );
  }

  @Post(':id/pm/unassign')
  @Permissions('property-listings:write', 'leads:write')
  unassignPmStaff(@Param('id') id: string, @Body() body: UnassignPmStaffDto, @Request() req: any) {
    return this.track(
      id,
      req,
      () => this.listingsService.unassignPmStaff(id, body.role),
      () => ({
        action: 'pm_staff_unassigned',
        label: `${PM_ROLE_LABEL[body.role] || 'Staff'} removed`,
        auditAction: 'unassign',
        meta: { role: body.role },
      }),
    );
  }

  @Post(':id/pm/legal/start')
  @Permissions('property-listings:write', 'leads:write')
  startPmLegal(@Param('id') id: string, @Body() body: PmLegalActionDto, @Request() req: any) {
    return this.track(
      id,
      req,
      () => this.listingsService.startPmLegalVerification(id, body),
      () => ({
        action: 'pm_legal_started',
        label: 'Legal verification started',
        detail: body?.summary || undefined,
        auditAction: 'start',
      }),
    );
  }

  @Put(':id/pm/legal/checklist')
  @Permissions('property-listings:write', 'leads:write')
  updatePmLegalChecklist(@Param('id') id: string, @Body() body: PmLegalChecklistDto, @Request() req: any) {
    const items = Array.isArray(body?.checklist) ? body.checklist : [];
    const done = items.filter((i) => i?.checked).length;
    return this.track(
      id,
      req,
      () => this.listingsService.updatePmLegalChecklist(id, body),
      () => ({
        action: 'pm_legal_checklist',
        label: 'Legal checklist updated',
        detail: `${done} of ${items.length} item${items.length === 1 ? '' : 's'} checked`,
        auditAction: 'update',
        meta: { checked: done, total: items.length },
      }),
    );
  }

  @Post(':id/pm/legal/complete')
  @Permissions('property-listings:write', 'leads:write')
  completePmLegal(@Param('id') id: string, @Body() body: PmLegalActionDto, @Request() req: any) {
    return this.track(
      id,
      req,
      () => this.listingsService.completePmLegalVerification(id, body),
      () => ({
        action: 'pm_legal_completed',
        label: 'Legal verification completed',
        detail: body?.summary || undefined,
        auditAction: 'complete',
      }),
    );
  }

  @Post(':id/pm/visit/schedule')
  @Permissions('property-listings:write', 'leads:write')
  schedulePmVisit(@Param('id') id: string, @Body() body: PmScheduleVisitDto, @Request() req: any) {
    const when = formatWhen(body?.scheduledAt);
    return this.track(
      id,
      req,
      () => this.listingsService.schedulePmFieldVisit(id, body),
      () => ({
        action: 'pm_visit_scheduled',
        label: 'Field visit scheduled',
        detail:
          [when ? `For ${when}` : '', body?.notes || body?.description || '']
            .filter(Boolean)
            .join(' — ') || undefined,
        auditAction: 'schedule',
        meta: { scheduledAt: body?.scheduledAt, visitCategory: body?.visitCategory },
      }),
    );
  }

  @Post(':id/pm/visit/status')
  @Permissions('property-listings:write', 'leads:write')
  setPmVisitStatus(@Param('id') id: string, @Body() body: PmVisitStatusDto, @Request() req: any) {
    const statusLabel =
      body?.status === 'Complete'
        ? 'completed'
        : body?.status === 'Cancel'
          ? 'cancelled'
          : 'set to pending';
    return this.track(
      id,
      req,
      () => this.listingsService.setPmFieldVisitStatus(id, body),
      () => ({
        action: 'pm_visit_status',
        label: `Field visit ${statusLabel}`,
        detail: body?.notes || undefined,
        auditAction: 'status',
        meta: { visitStatus: body?.status },
      }),
    );
  }

  @Post(':id/pm/visit/report/submit')
  @Permissions('property-listings:write', 'leads:write')
  submitPmVisitReport(@Param('id') id: string, @Request() req: any) {
    return this.track(
      id,
      req,
      () => this.listingsService.submitPmVisitReport(id),
      () => ({
        action: 'pm_visit_report_submitted',
        label: 'Visit report submitted',
        auditAction: 'submit',
      }),
    );
  }

  @Post(':id/pm/visit/report/review')
  @Permissions('property-listings:write', 'leads:write')
  reviewPmVisitReport(@Param('id') id: string, @Body() body: PmReviewReportDto, @Request() req: any) {
    const decision = String(body?.decision || 'Reviewed');
    const when = body?.reschedule ? formatWhen(body?.scheduledAt) : undefined;
    return this.track(
      id,
      req,
      () => this.listingsService.reviewPmVisitReport(id, body),
      () => ({
        action: 'pm_visit_report_reviewed',
        label: `Visit report ${decision.toLowerCase()}`,
        detail:
          [body?.rejectionReason, body?.reschedule ? `Visit rescheduled${when ? ` for ${when}` : ''}` : '']
            .filter(Boolean)
            .join(' — ') || undefined,
        auditAction: 'review',
        meta: { decision, reschedule: Boolean(body?.reschedule) },
      }),
    );
  }

  /** Read-only hand-off: PM property views associated legal cases (legal status snapshot only). */
  @Get(':id/associated-legal-status')
  @Permissions('property-listings:read')
  getPropertyAssociatedLegalStatus(@Param('id') id: string) {
    return this.listingsService.getPropertyAssociatedLegalStatus(id);
  }
}
