import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Delete,
  Request,
  BadRequestException,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolveListPagination, CRM_MAX_BOARD_PAGE_SIZE, CRM_MAX_PAGE_SIZE } from '../../common/lib/pagination/list-pagination';
import { parseCrmFiltersQuery } from '../shared/crm-list-filters';
import { parseCrmEmailEngagementQuery } from '../email/crm-email-engagement-filter.service';
import { CRMService } from './crm.service';
import { CrmEmailEngagementBatchService } from '../email/crm-email-engagement-batch.service';
import { CrmCalendarSyncService } from '../calendar/crm-calendar-sync.service';
import { InboxOAuthService } from '../inbox/inbox-oauth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { canViewCrmRevenue, redactCrmRevenueForUser } from '../shared/crm-admin-access.util';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CRMController {
  constructor(
    private readonly crmService: CRMService,
    private readonly crmCalendarSyncService: CrmCalendarSyncService,
    private readonly inboxOAuthService: InboxOAuthService,
    private readonly crmEmailEngagementBatchService: CrmEmailEngagementBatchService,
  ) {}

  @Get('distinct-values')
  @Permissions('leads:read', 'contacts:read', 'organizations:read', 'clients:read')
  async getDistinctValues(
    @Query('module') module: string,
    @Query('field') field: string,
    @Query('pipeline') pipeline?: string,
  ) {
    if (!module || !field) {
      throw new BadRequestException('module and field are required');
    }
    return this.crmService.getDistinctValues(module, field, pipeline);
  }

  /** Duplicate check for email / phone / LinkedIn (leads + contacts). */
  @Get('person-identifiers/check')
  @Permissions('leads:read', 'contacts:read')
  checkPersonIdentifiers(
    @Query('email') email?: string,
    @Query('mobileNo') mobileNo?: string,
    @Query('phone') phone?: string,
    @Query('linkedinUrl') linkedinUrl?: string,
    @Query('entityType') entityType: 'lead' | 'contact' = 'lead',
    @Query('excludeLeadId') excludeLeadId?: string,
    @Query('excludeContactId') excludeContactId?: string,
  ) {
    return this.crmService.checkPersonIdentifiers({
      email,
      mobileNo,
      phone,
      linkedinUrl,
      entityType: entityType === 'contact' ? 'contact' : 'lead',
      excludeLeadId,
      excludeContactId,
    });
  }

  // Leads
  @Post('leads')
  @Permissions('leads:write')
  async createLead(@Body() dto: any, @Request() req: any) {
    return this.crmService.createLead(dto, req.user);
  }

  @Get('leads')
  @Permissions('leads:read')
  findAllLeads(
    @Request() req: any,
    @Query('pipeline') pipeline?: string,
    @Query('mine') mine?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('leadType') leadType?: string,
    @Query('leadVertical') leadVertical?: string,
    @Query('filters') filters?: string,
    @Query('lastActivity') lastActivity?: string,
    @Query('emailOpenMode') emailOpenMode?: string,
    @Query('emailOpenDays') emailOpenDays?: string,
    @Query('emailReply') emailReply?: string,
    @Query('emailSent') emailSent?: string,
    @Query('includeConverted') includeConverted?: string,
  ) {
    const parsed = resolveListPagination(
      { page, pageSize, search },
      { maxPageSize: CRM_MAX_BOARD_PAGE_SIZE },
    );
    const parsedFilters = parseCrmFiltersQuery(filters);
    const emailEngagement = parseCrmEmailEngagementQuery({
      lastActivity,
      emailOpenMode,
      emailOpenDays,
      emailReply,
      emailSent,
    });
    const lt: 'standard' | 'platform' | undefined =
      leadType === 'platform' || leadType === 'standard' ? leadType : undefined;
    const lv: 'property_listing' | 'property_management' | undefined =
      leadVertical === 'property_listing' || leadVertical === 'property_management'
        ? leadVertical
        : undefined;
    return this.crmService.findAllLeads(req.user, pipeline, {
      page: parsed.page,
      pageSize: parsed.pageSize,
      search: parsed.search,
      mine: mine === '1' || mine === 'true',
      leadType: lt,
      leadVertical: lv,
      filters: parsedFilters,
      emailEngagement,
      includeConverted:
        includeConverted === '1' || includeConverted === 'true',
    });
  }

  /** Batched email open / reply signals for leads board & list (replaces N×3 per-lead HTTP calls). */
  @Post('leads/email-engagement-batch')
  @Permissions('leads:read')
  batchLeadEmailEngagement(@Body() body: { ids?: unknown }) {
    return this.crmEmailEngagementBatchService.getBatchForModule(body?.ids, 'leads');
  }

  @Get('leads/:id')
  @Permissions('leads:read')
  findOneLead(@Param('id') id: string, @Request() req: any) {
    return this.crmService.findOneLead(id, req.user);
  }

  @Put('leads/:id')
  @Permissions('leads:write', 'leads:move_pipeline')
  async updateLead(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.crmService.updateLead(id, dto, req.user);
  }

  @Patch('leads/:id')
  @Permissions('leads:write', 'leads:move_pipeline')
  async patchLead(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.crmService.updateLead(id, dto, req.user);
  }

  // Organizations
  @Get('organizations')
  @Permissions('organizations:read')
  async findAllOrganizations(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('filters') filters?: string,
    @Query('lastActivity') lastActivity?: string,
    @Query('emailOpenMode') emailOpenMode?: string,
    @Query('emailOpenDays') emailOpenDays?: string,
    @Query('emailReply') emailReply?: string,
  ) {
    const parsed = resolveListPagination(
      { page, pageSize, search },
      { maxPageSize: CRM_MAX_PAGE_SIZE },
    );
    const parsedFilters = parseCrmFiltersQuery(filters);
    const emailEngagement = parseCrmEmailEngagementQuery({
      lastActivity,
      emailOpenMode,
      emailOpenDays,
      emailReply,
    });
    const data = await this.crmService.findAllOrganizations({
      ...parsed,
      filters: parsedFilters,
      emailEngagement,
    });
    return redactCrmRevenueForUser(req.user, data);
  }

  @Get('organizations/list')
  @Permissions('organizations:read')
  findAllOrganizationsList() {
    return this.crmService.findAllOrganizationsList();
  }

  @Get('organizations/:id')
  @Permissions('organizations:read')
  async findOneOrganization(@Param('id') id: string, @Request() req: any) {
    const data = await this.crmService.findOneOrganization(id);
    return redactCrmRevenueForUser(req.user, data);
  }

  @Post('organizations')
  @Permissions('organizations:write')
  async createOrganization(@Body() dto: any, @Request() req: any) {
    return this.crmService.createOrganization(dto, req.user);
  }

  @Put('organizations/:id')
  @Permissions('organizations:write')
  async updateOrganization(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.crmService.updateOrganization(id, dto, req.user);
  }

  @Patch('organizations/:id')
  @Permissions('organizations:write')
  async patchOrganization(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.crmService.updateOrganization(id, dto, req.user);
  }

  // Contacts
  @Get('contacts')
  @Permissions('contacts:read')
  findAllContacts(
    @Request() req: any,
    @Query('mine') mine?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('filters') filters?: string,
    @Query('lastActivity') lastActivity?: string,
    @Query('emailOpenMode') emailOpenMode?: string,
    @Query('emailOpenDays') emailOpenDays?: string,
    @Query('emailReply') emailReply?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const parsed = resolveListPagination(
      { page, pageSize, search },
      { maxPageSize: CRM_MAX_BOARD_PAGE_SIZE },
    );
    const parsedFilters = parseCrmFiltersQuery(filters);
    const emailEngagement = parseCrmEmailEngagementQuery({
      lastActivity,
      emailOpenMode,
      emailOpenDays,
      emailReply,
    });
    const normalizedSortOrder =
      String(sortOrder || '')
        .trim()
        .toLowerCase() === 'asc'
        ? ('asc' as const)
        : ('desc' as const);
    return this.crmService.findAllContacts(req.user, {
      page: parsed.page,
      pageSize: parsed.pageSize,
      search: parsed.search,
      mine: mine === '1' || mine === 'true',
      filters: parsedFilters,
      emailEngagement,
      sortBy: sortBy?.trim() || undefined,
      sortOrder: normalizedSortOrder,
    });
  }

  @Get('contacts/list')
  @Permissions('contacts:read')
  findAllContactsList(@Request() req: any) {
    return this.crmService.findAllContactsList(req.user);
  }

  /** Batched email open / reply signals for contacts list. */
  @Post('contacts/email-engagement-batch')
  @Permissions('contacts:read')
  batchContactEmailEngagement(@Body() body: { ids?: unknown }) {
    return this.crmEmailEngagementBatchService.getBatchForModule(
      body?.ids,
      'contacts',
    );
  }

  @Get('contacts/:id')
  @Permissions('contacts:read')
  findOneContact(@Param('id') id: string, @Request() req: any) {
    return this.crmService.findOneContact(id, req.user);
  }

  @Post('contacts')
  @Permissions('contacts:write')
  async createContact(@Body() dto: any, @Request() req: any) {
    return this.crmService.createContact(dto, req.user);
  }

  @Put('contacts/:id')
  @Permissions('contacts:write')
  async updateContact(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.crmService.updateContact(id, dto, req.user);
  }

  @Patch('contacts/:id')
  @Permissions('contacts:write')
  async patchContact(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.crmService.updateContact(id, dto, req.user);
  }

  // Activities
  @Get('activities')
  @Permissions('activities:read')
  findActivities(
    @Query('relatedTo') relatedTo?: string,
    @Query('type') type?: string,
    @Query('pipelineId') pipelineId?: string,
    @Query('relatedType') relatedType?: string,
  ) {
    return this.crmService.findActivities(
      relatedTo,
      type,
      pipelineId,
      relatedType,
    );
  }

  @Post('activities')
  @Permissions('activities:write')
  createActivity(@Body() dto: any, @Request() req: any) {
    return this.crmService.createActivity(dto, req.user);
  }

  @Patch('activities/:id')
  @Permissions('activities:write')
  patchActivity(@Param('id') id: string, @Body() dto: any) {
    return this.crmService.updateActivity(id, dto);
  }

  @Delete('activities/:id')
  @Permissions('admin:manage')
  removeActivity(@Param('id') id: string, @Request() req: any) {
    return this.crmService.removeActivity(id, req.user?.userId);
  }

  // Calendar — external sync (Google / Outlook via connected mailbox OAuth)
  @Get('calendar/connections')
  @Permissions('dashboard:read')
  getCalendarConnections(@Request() req: any) {
    return this.crmCalendarSyncService.getConnectionStatus(
      req.user.userId,
      req.user.email,
    );
  }

  @Get('calendar/sync')
  @Permissions('dashboard:read')
  syncCalendarEvents(
    @Request() req: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.crmCalendarSyncService.syncExternalEvents(
      req.user.userId,
      req.user.email,
      start,
      end,
    );
  }

  @Get('calendar/oauth/google/authorize')
  @Permissions('dashboard:read')
  getCalendarGoogleOAuth(@Request() req: any) {
    const state = this.inboxOAuthService.signOAuthState(
      req.user.userId,
      'gmail',
      { returnTo: 'calendar' },
    );
    return { url: this.inboxOAuthService.buildGoogleAuthorizeUrl(state) };
  }

  @Get('calendar/oauth/microsoft/authorize')
  @Permissions('dashboard:read')
  getCalendarMicrosoftOAuth(@Request() req: any) {
    const state = this.inboxOAuthService.signOAuthState(
      req.user.userId,
      'outlook',
      { returnTo: 'calendar' },
    );
    return { url: this.inboxOAuthService.buildMicrosoftAuthorizeUrl(state) };
  }

  @Get('calendar-events')
  @Permissions('dashboard:read', 'activities:read')
  getCalendarEvents(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('owner') owner?: string,
  ) {
    return this.crmService.getCalendarEvents(start, end, owner);
  }

  @Post('calendar-events')
  @Permissions('activities:write')
  createCalendarEvent(@Body() dto: any, @Request() req: any) {
    return this.crmService.createCalendarEvent(dto, req.user);
  }

  // Dashboard
  @Get('dashboard')
  @Permissions('dashboard:read')
  getDashboard(
    @Request() req: any,
    @Query('days') days?: string,
    @Query('owner') owner?: string,
    @Query('filters') filters?: string,
    @Query('compare') compare?: string,
  ) {
    return this.crmService.getDashboardStats(
      days || '30',
      owner,
      filters,
      req.user,
      compare,
    );
  }

  /** Leads pipeline + email tracking analytics (board / reports UI). */
  @Get('reports/board')
  @Permissions('dashboard:read', 'leads:read')
  getBoardReports(
    @Query('days') days?: string,
    @Query('owner') owner?: string,
  ) {
    return this.crmService.getBoardReports(days || '30', owner);
  }

  /** Leads Dashboard KPIs + dimensional analytics (live CRM lead aggregates). */
  @Get('reports/leads-dashboard')
  @Permissions('dashboard:read', 'leads:read')
  getLeadsDashboardAnalytics(
    @Query('days') days?: string,
    @Query('owner') owner?: string,
    @Query('compare') compare?: string,
  ) {
    return this.crmService.getLeadsDashboardAnalytics(
      days || '30',
      owner,
      compare,
    );
  }

  /** Team Members → Performance tab: one agent's today/week/month work snapshot. */
  @Get('reports/agent-performance/:agentId')
  @Permissions('settings:admin', 'dashboard:read')
  async getAgentPerformanceSummary(@Param('agentId') agentId: string) {
    return this.crmService.getAgentPerformanceSummary(agentId);
  }

  /** Agent Performance baseline report — calls/activities/leads per human agent, target-vs-actual. */
  @Get('reports/agents')
  @Permissions('dashboard:read', 'leads:read')
  async getAgentPerformanceLeaderboard(@Query('window') window?: string) {
    return this.crmService.getAgentPerformanceLeaderboard(window || 'this_month');
  }

  @Get('agent-targets')
  @Permissions('settings:admin')
  async getAgentTargets() {
    return this.crmService.getAgentTargets();
  }

  @Put('agent-targets/:agentId')
  @Permissions('settings:admin')
  async upsertAgentTarget(
    @Param('agentId') agentId: string,
    @Body() body: { leadsTarget?: number; callsTarget?: number; propertiesTarget?: number },
  ) {
    return this.crmService.upsertAgentTarget(agentId, body || {});
  }

  /** Team & Organizations Reports - Team-level metrics aggregation. */
  @Get('reports/teams')
  @Permissions('dashboard:read', 'leads:read')
  async getTeamPerformanceMetrics(@Query('window') window?: string) {
    return this.crmService.getTeamPerformanceMetrics(window || 'this_month');
  }

  /** Lead source conversion tracking by channel. */
  @Get('reports/lead-sources')
  @Permissions('dashboard:read', 'leads:read')
  async getLeadSourceConversion(@Query('window') window?: string) {
    return this.crmService.getLeadSourceConversion(window || 'this_month');
  }

  /** Lead intent conversion analytics. */
  @Get('reports/lead-intents')
  @Permissions('dashboard:read', 'leads:read')
  async getLeadIntentConversion(@Query('window') window?: string) {
    return this.crmService.getLeadIntentConversion(window || 'this_month');
  }

  /** WhatsApp engagement metrics by team. */
  @Get('reports/whatsapp-engagement')
  @Permissions('dashboard:read', 'leads:read')
  async getWhatsAppEngagement(@Query('window') window?: string) {
    return this.crmService.getWhatsAppEngagement(window || 'this_month');
  }

  /** IVR call analytics metrics by team. */
  @Get('reports/ivr-analytics')
  @Permissions('dashboard:read', 'leads:read')
  async getIVRAnalytics(@Query('window') window?: string) {
    return this.crmService.getIVRAnalytics(window || 'this_month');
  }

  /** Sales department health: work done, activity trends, rep leaderboard, pipeline snapshot. */
  @Get('reports/sales-health')
  @Permissions('dashboard:read', 'leads:read')
  async getSalesDepartmentHealth(
    @Request() req: any,
    @Query('window') window?: string,
    @Query('owner') owner?: string,
  ) {
    const data = await this.crmService.getSalesDepartmentHealth(
      window || 'this_week',
      owner,
    );
    return redactCrmRevenueForUser(req.user, data);
  }

  /** Summary charts: email opens/replies over time, leads by pipeline & service. */
  @Get('reports/summary-charts')
  @Permissions('dashboard:read', 'leads:read')
  getReportSummaryCharts(
    @Query('window') window?: string,
    @Query('owner') owner?: string,
  ) {
    return this.crmService.getReportSummaryCharts(window || 'today', owner);
  }

  /** Action queue: leads needing outreach, stale follow-up, unopened tracked emails. */
  @Get('reports/attention')
  @Permissions('dashboard:read', 'leads:read')
  getSalesAttention(@Query('owner') owner?: string) {
    return this.crmService.getSalesAttention(owner);
  }

  /** Rep workspace: attention, tasks, pipeline snapshot, activity feed. */
  @Get('workspace')
  @Permissions('dashboard:read')
  getSalesWorkspace(
    @Request() req: any,
    @Query('owner') owner?: string,
    @Query('window') window?: string,
    @Query('sections') sections?: string,
  ) {
    return this.crmService.getSalesWorkspace(
      owner,
      req?.user,
      window,
      sections,
    );
  }

  // Export/Import
  @Get('export/:type')
  @Permissions('admin:manage')
  async exportData(
    @Param('type') type: string,
    @Query('ids') ids?: string,
    @Query('pipelineId') pipelineId?: string,
    @Request() req?: any,
  ) {
    const parsedIds = String(ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.crmService.exportToCsv(
      type,
      {
        ids: parsedIds,
        pipelineId,
      },
      req?.user,
    );
  }

  @Post('import/preview')
  @Permissions('admin:manage', 'leads:import')
  @UseInterceptors(FileInterceptor('file'))
  async getImportPreview(@UploadedFile() file: any) {
    return { headers: this.crmService.getFileHeaders(file.buffer) };
  }

  @Post('import/:type')
  @Permissions('admin:manage', 'leads:import')
  @UseInterceptors(FileInterceptor('file'))
  async importData(
    @Param('type') type: string,
    @UploadedFile() file: any,
    @Body('mapping') mappingJson?: string,
    @Body('duplicateStrategy') duplicateStrategy?: string,
    @Request() req?: any,
  ) {
    const mapping = mappingJson ? JSON.parse(mappingJson) : undefined;
    return this.crmService.startImportFromExcel(
      type,
      file.buffer,
      mapping,
      req?.user,
      duplicateStrategy,
    );
  }

  @Get('import/jobs/:jobId')
  @Permissions('admin:manage', 'leads:import')
  getImportJob(@Param('jobId') jobId: string) {
    return this.crmService.getImportJobStatus(jobId);
  }

  // --- Deletion ---
  @Delete('leads/:id')
  @Permissions('leads:delete')
  removeLead(@Param('id') id: string, @Request() req: any) {
    return this.crmService.removeLead(id, req.user?.userId);
  }

  @Post('leads/bulk-delete')
  @Permissions('leads:delete')
  bulkRemoveLeads(@Body('ids') ids: string[], @Request() req: any) {
    return this.crmService.bulkRemoveLeads(ids, req.user?.userId);
  }

  @Post('leads/bulk-assign')
  @Permissions('leads:write')
  bulkAssignLeads(
    @Body()
    body: {
      ownerName?: string;
      ids?: string[];
    },
    @Request() req: any,
  ) {
    return this.crmService.bulkAssignLeads(
      {
        ownerName: body?.ownerName,
        ids: body?.ids,
      },
      req.user,
    );
  }

  @Post('leads/:id/convert')
  @Permissions('leads:write')
  convertLead(
    @Param('id') id: string,
    @Body()
    dto: {
      type: 'contact' | 'organization' | 'client';
      pipelineId?: string;
      stage?: string;
    },
    @Request() req: any,
  ) {
    return this.crmService.convertLead(id, dto, req.user);
  }

  @Delete('organizations/:id')
  @Permissions('organizations:delete')
  removeOrganization(@Param('id') id: string, @Request() req: any) {
    return this.crmService.removeOrganization(id, req.user?.userId);
  }

  @Delete('contacts/:id')
  @Permissions('contacts:delete')
  removeContact(@Param('id') id: string, @Request() req: any) {
    return this.crmService.removeContact(id, req.user?.userId);
  }

  @Post('contacts/bulk-delete')
  @Permissions('admin:manage')
  bulkRemoveContacts(@Body('ids') ids: string[], @Request() req: any) {
    return this.crmService.bulkRemoveContacts(ids, req.user?.userId);
  }

  @Post('fetch-link-metadata')
  @Permissions('leads:read', 'contacts:read')
  fetchLinkMetadata(@Body('url') url: string) {
    return this.crmService.fetchLinkMetadata(url);
  }

  @Get('proxy-image')
  @Permissions('leads:read', 'contacts:read')
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    return this.crmService.proxyImage(url, res);
  }

  @Get('settings/currency')
  @Permissions('settings:write', 'admin:manage')
  getCurrencySettings(@Request() req: any) {
    if (!canViewCrmRevenue(req.user)) {
      throw new ForbiddenException(
        'Currency settings are restricted to the platform super administrator.',
      );
    }
    return this.crmService.getGlobalSettings();
  }

  @Put('settings/currency')
  @Permissions('settings:write', 'admin:manage')
  updateCurrencyRate(@Body('usdToInr') usdToInr: number, @Request() req: any) {
    if (!canViewCrmRevenue(req.user)) {
      throw new ForbiddenException(
        'Currency settings are restricted to the platform super administrator.',
      );
    }
    return this.crmService.updateCurrencyRate(Number(usdToInr));
  }

  @Post('settings/currency/rates')
  @Permissions('settings:write', 'admin:manage')
  upsertCurrencyRate(
    @Body('code') code: string,
    @Body('symbol') symbol: string,
    @Body('rateToInr') rateToInr: number,
    @Request() req: any,
  ) {
    if (!canViewCrmRevenue(req.user)) {
      throw new ForbiddenException(
        'Currency settings are restricted to the platform super administrator.',
      );
    }
    return this.crmService.upsertCurrencyRate(code, symbol, Number(rateToInr));
  }

  @Delete('settings/currency/rates/:code')
  @Permissions('settings:write', 'admin:manage')
  deleteCurrencyRate(@Param('code') code: string, @Request() req: any) {
    if (!canViewCrmRevenue(req.user)) {
      throw new ForbiddenException(
        'Currency settings are restricted to the platform super administrator.',
      );
    }
    return this.crmService.deleteCurrencyRate(code);
  }

  @Get('settings/workflow-scheduler')
  @Permissions('settings:write', 'admin:manage')
  getWorkflowSchedulerSettings() {
    return this.crmService.getWorkflowSchedulerSettings();
  }

  @Put('settings/workflow-scheduler')
  @Permissions('settings:write', 'admin:manage')
  updateWorkflowSchedulerSettings(
    @Body() body: { workflowSchedulerEnabled?: boolean },
  ) {
    if (typeof body?.workflowSchedulerEnabled !== 'boolean') {
      throw new BadRequestException(
        'workflowSchedulerEnabled (boolean) is required',
      );
    }
    return this.crmService.updateWorkflowSchedulerSettings({
      workflowSchedulerEnabled: body.workflowSchedulerEnabled,
    });
  }

  @Get('settings/opportunity-platforms')
  @Permissions(
    'leads:read',
    'settings:read',
    'settings:write',
  )
  getOpportunitySourcePlatforms() {
    return this.crmService.getOpportunitySourcePlatforms();
  }

  @Put('settings/opportunity-platforms')
  @Permissions('settings:write', 'admin:manage')
  updateOpportunitySourcePlatforms(
    @Body('customPlatforms') customPlatforms: unknown,
  ) {
    return this.crmService.updateOpportunitySourcePlatforms(customPlatforms);
  }

  /** CRM-wide wiki attachments (same PM wiki module as project boards). */
  @Get('settings/wiki-links')
  @Permissions('settings:write')
  getCrmWikiLinks() {
    return this.crmService.getCrmWikiLinks();
  }

  @Put('settings/wiki-links')
  @Permissions('settings:write')
  updateCrmWikiLinks(@Body('wikiLinks') wikiLinks: unknown) {
    return this.crmService.updateCrmWikiLinks(wikiLinks);
  }
}
