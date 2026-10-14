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
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolveListPagination, CRM_MAX_BOARD_PAGE_SIZE, CRM_MAX_PAGE_SIZE } from '../../common/lib/pagination/list-pagination';
import { parseCrmFiltersQuery } from '../shared/crm-list-filters';
import { parseCrmEmailEngagementQuery } from '../email/crm-email-engagement-filter.service';
import { CRMService } from './crm.service';
import { ReportingService } from '../reporting/reporting.service';
import { RoleDashboardService } from '../reporting/role-dashboard.service';
import { PerformanceReportsService } from '../reporting/performance-reports.service';
import { CrmEmailEngagementBatchService } from '../email/crm-email-engagement-batch.service';
import { CrmCalendarSyncService } from '../calendar/crm-calendar-sync.service';
import { InboxOAuthService } from '../inbox/inbox-oauth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import {
  canViewCrmRevenue,
  redactCrmRevenueForUser,
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from '../shared/crm-admin-access.util';
import { CrmAssignmentPolicyService } from '../shared/crm-assignment-policy.service';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CRMController {
  constructor(
    private readonly crmService: CRMService,
    private readonly crmCalendarSyncService: CrmCalendarSyncService,
    private readonly inboxOAuthService: InboxOAuthService,
    private readonly crmEmailEngagementBatchService: CrmEmailEngagementBatchService,
    private readonly reportingService: ReportingService,
    private readonly roleDashboardService: RoleDashboardService,
    private readonly performanceReports: PerformanceReportsService,
    private readonly assignmentPolicy: CrmAssignmentPolicyService,
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
  @Permissions('leads:read', 'contacts:read', 'pm-leads:read')
  checkPersonIdentifiers(
    @Query('email') email?: string,
    @Query('mobileNo') mobileNo?: string,
    @Query('phone') phone?: string,
    @Query('linkedinUrl') linkedinUrl?: string,
    @Query('entityType') entityType: 'lead' | 'contact' = 'lead',
    @Query('excludeLeadId') excludeLeadId?: string,
    @Query('excludeContactId') excludeContactId?: string,
    @Query('leadVertical') leadVertical?: 'property_listing' | 'property_management',
  ) {
    return this.crmService.checkPersonIdentifiers({
      email,
      mobileNo,
      phone,
      linkedinUrl,
      entityType: entityType === 'contact' ? 'contact' : 'lead',
      excludeLeadId,
      excludeContactId,
      leadVertical,
    });
  }

  // Leads
  @Post('leads')
  @Permissions('leads:write', 'pm-leads:write')
  async createLead(@Body() dto: any, @Request() req: any) {
    return this.crmService.createLead(dto, req.user);
  }

  @Get('leads')
  @Permissions('leads:read', 'pm-leads:read')
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
    @Query('followUp') followUp?: string,
    @Query('followUpFrom') followUpFrom?: string,
    @Query('followUpTo') followUpTo?: string,
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
      followUp,
      followUpFrom,
      followUpTo,
    });
  }

  /** Batched email open / reply signals for leads board & list (replaces N×3 per-lead HTTP calls). */
  @Post('leads/email-engagement-batch')
  @Permissions('leads:read', 'pm-leads:read')
  batchLeadEmailEngagement(@Body() body: { ids?: unknown }) {
    return this.crmEmailEngagementBatchService.getBatchForModule(body?.ids, 'leads');
  }

  /** Reassign picker: only the people this user may hand leads to (Team Lead → own team), searchable + paged. */
  @Get('leads/assignable-users')
  @Permissions('leads:read', 'pm-leads:read')
  leadAssignableUsers(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assignmentPolicy.assignableUsers('leads', req.user, { search, page, limit });
  }

  @Get('leads/:id')
  @Permissions('leads:read', 'pm-leads:read')
  async findOneLead(@Param('id') id: string, @Request() req: any) {
    const lead = await this.crmService.findOneLead(id, req.user);
    // Missing / out-of-scope must not go out as an empty 200 — the portal can't parse that
    // and shows a generic "Failed to load lead." (e.g. when opened from a notification).
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  @Put('leads/:id')
  @Permissions('leads:write', 'leads:move_pipeline', 'pm-leads:write', 'pm-leads:move_pipeline')
  async updateLead(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.crmService.updateLead(id, dto, req.user);
  }

  @Patch('leads/:id')
  @Permissions('leads:write', 'leads:move_pipeline', 'pm-leads:write', 'pm-leads:move_pipeline')
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
    @Query('assignee') assignee?: string,
    @Query('teamScope') teamScope?: string,
    @Query('listingId') listingId?: string,
    @Request() req?: any,
  ) {
    return this.crmService.findActivities(
      relatedTo,
      type,
      pipelineId,
      relatedType,
      { assignee, teamScope, listingId, user: req?.user },
    );
  }

  @Post('activities')
  @Permissions('activities:write')
  createActivity(@Body() dto: any, @Request() req: any) {
    return this.crmService.createActivity(dto, req.user);
  }

  @Patch('activities/:id')
  @Permissions('activities:write')
  patchActivity(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.crmService.updateActivity(id, dto, req.user);
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

  /**
   * Reports & Analytics (FRD §14) — one live, role-scoped payload for the Agent Performance
   * and Team & Organization reports: per-agent + per-team rows, totals, previous-period
   * totals, daily trend, lead source/intent conversion, WhatsApp + IVR engagement, targets.
   * Admin → whole org, Team Lead → own team, Agent → self. `agents` / `teams` narrow it.
   */
  @Get('reports/performance')
  @Permissions('dashboard:read', 'leads:read')
  async getPerformanceReport(
    @Request() req: any,
    @Query('window') window?: string,
    @Query('agents') agents?: string,
    @Query('teams') teams?: string,
    @Query('fresh') fresh?: string,
  ) {
    const scope = this.performanceReports.resolveScope(req);
    return this.performanceReports.getPerformance(
      window || 'this_month',
      scope,
      {
        agents: this.performanceReports.parseIdList(agents),
        teams: this.performanceReports.parseIdList(teams),
      },
      fresh === '1' || fresh === 'true',
    );
  }

  /** Live 2bigha marketplace inventory (properties / farms) — org-scope callers only. */
  @Get('reports/twobigha-inventory')
  @Permissions('dashboard:read', 'leads:read')
  async getTwoBighaInventory(@Request() req: any) {
    if (this.performanceReports.resolveScope(req).tier !== 'org') {
      return { connected: false, properties: null, farms: null, restricted: true };
    }
    return this.performanceReports.getTwoBighaInventory();
  }

  /** Agent Performance report — per-agent rows (role-scoped). */
  @Get('reports/agents')
  @Permissions('dashboard:read', 'leads:read')
  async getAgentPerformanceLeaderboard(
    @Request() req: any,
    @Query('window') window?: string,
    @Query('agents') agents?: string,
  ) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
      { agents: this.performanceReports.parseIdList(agents) },
    );
    return { window: data.window, windowLabel: data.windowLabel, agents: data.agents, totals: data.totals };
  }

  @Get('reports/agents/trend')
  @Permissions('dashboard:read', 'leads:read')
  async getAgentPerformanceTrend(
    @Request() req: any,
    @Query('window') window?: string,
    @Query('agents') agents?: string,
  ) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
      { agents: this.performanceReports.parseIdList(agents) },
    );
    return data.trend;
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

  /** Team & Organizations report — team roll-ups (role-scoped). */
  @Get('reports/teams')
  @Permissions('dashboard:read', 'leads:read')
  async getTeamPerformanceMetrics(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return { window: data.window, windowLabel: data.windowLabel, teams: data.teams, totals: data.totals };
  }

  @Get('reports/teams/trend')
  @Permissions('dashboard:read', 'leads:read')
  async getTeamPerformanceTrend(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return data.teamTrend;
  }

  /** Lead source conversion (role-scoped). */
  @Get('reports/lead-sources')
  @Permissions('dashboard:read', 'leads:read')
  async getLeadSourceConversion(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return { window: data.window, windowLabel: data.windowLabel, sources: data.sources };
  }

  /** Lead intent conversion (role-scoped). */
  @Get('reports/lead-intents')
  @Permissions('dashboard:read', 'leads:read')
  async getLeadIntentConversion(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return { window: data.window, windowLabel: data.windowLabel, intents: data.intents };
  }

  /** WhatsApp engagement (role-scoped): totals + per team. */
  @Get('reports/whatsapp-engagement')
  @Permissions('dashboard:read', 'leads:read')
  async getWhatsAppEngagement(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return {
      window: data.window,
      windowLabel: data.windowLabel,
      totals: data.engagement.whatsapp,
      teams: data.teams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        messagesOutbound: t.messagesOutbound,
        messagesDelivered: t.messagesDelivered,
        messagesRead: t.messagesRead,
        messagesFailed: t.messagesFailed,
      })),
    };
  }

  /** IVR call analytics (role-scoped): totals + per team. */
  @Get('reports/ivr-analytics')
  @Permissions('dashboard:read', 'leads:read')
  async getIVRAnalytics(@Request() req: any, @Query('window') window?: string) {
    const data = await this.performanceReports.getPerformance(
      window || 'this_month',
      this.performanceReports.resolveScope(req),
    );
    return {
      window: data.window,
      windowLabel: data.windowLabel,
      totals: data.engagement.ivr,
      teams: data.teams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        incomingCalls: t.incomingCalls,
        outgoingCalls: t.outgoingCalls,
        missedCalls: t.missedCalls,
        completedCalls: t.completedCalls,
        avgCallDuration: t.avgCallDuration,
      })),
    };
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

  // --- Report Schedules ---
  @Post('reports/schedules')
  @Permissions('dashboard:read', 'leads:read')
  async createReportSchedule(@Body() dto: any, @Request() req: any) {
    if (!dto.reportType || !dto.frequency || !dto.emailRecipients) {
      throw new BadRequestException('reportType, frequency, and emailRecipients are required');
    }
    const recipients = (Array.isArray(dto.emailRecipients) ? dto.emailRecipients : String(dto.emailRecipients).split(','))
      .map((e: unknown) => String(e || '').trim())
      .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!recipients.length) throw new BadRequestException('At least one valid email recipient is required');
    // The emailed report keeps the creator's data scope (admin → org, team lead → team, agent → self).
    const scope = this.performanceReports.resolveScope(req);
    return this.crmService.createReportSchedule(req.user.userId, {
      ...dto,
      emailRecipients: recipients,
      filters: { ...(dto.filters || {}), _scopeTier: scope.tier, _scopeSelfId: scope.selfId },
    });
  }

  @Get('reports/schedules')
  @Permissions('dashboard:read', 'leads:read')
  async getReportSchedules(@Request() req: any) {
    return this.crmService.getReportSchedules(req.user.userId);
  }

  @Delete('reports/schedules/:scheduleId')
  @Permissions('dashboard:read', 'leads:read')
  async deleteReportSchedule(@Param('scheduleId') scheduleId: string, @Request() req: any) {
    return this.crmService.deleteReportSchedule(req.user.userId, scheduleId);
  }

  // Export/Import
  @Get('export/:type')
  @Permissions(
    'admin:manage',
    'leads:export',
    'contacts:export',
    'clients:export',
    'leads:read',
    'contacts:read',
    'clients:read',
    'pm-leads:export',
    'pm-leads:read',
  )
  async exportData(
    @Param('type') type: string,
    @Query('ids') ids?: string,
    @Query('pipelineId') pipelineId?: string,
    @Request() req?: any,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const parsedIds = String(ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const csv = await this.crmService.exportToCsv(
      type,
      {
        ids: parsedIds,
        pipelineId,
      },
      req?.user,
    );
    res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res?.setHeader(
      'Content-Disposition',
      `attachment; filename="${type}_export.csv"`,
    );
    return csv;
  }

  @Post('import/preview')
  @Permissions(
    'admin:manage',
    'leads:import',
    'contacts:import',
    'clients:import',
    'leads:write',
    'contacts:write',
    'clients:write',
    'pm-leads:import',
    'pm-leads:write',
  )
  @UseInterceptors(FileInterceptor('file'))
  async getImportPreview(@UploadedFile() file: any) {
    return { headers: this.crmService.getFileHeaders(file.buffer) };
  }

  @Post('import/:type')
  @Permissions(
    'admin:manage',
    'leads:import',
    'contacts:import',
    'clients:import',
    'leads:write',
    'contacts:write',
    'clients:write',
    'pm-leads:import',
    'pm-leads:write',
  )
  @UseInterceptors(FileInterceptor('file'))
  async importData(
    @Param('type') type: string,
    @UploadedFile() file: any,
    @Body('mapping') mappingJson?: string,
    @Body('duplicateStrategy') duplicateStrategy?: string,
    @Body('leadVertical') leadVertical?: string,
    @Request() req?: any,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload a CSV or Excel file to import');
    }
    let mapping: Record<string, string> | undefined;
    try {
      mapping = mappingJson ? JSON.parse(mappingJson) : undefined;
    } catch {
      throw new BadRequestException('Invalid column mapping');
    }
    // Blank "Lead Vertical" cells default to the board the import was started from.
    const defaultLeadVertical =
      leadVertical === 'property_management' || leadVertical === 'property_listing'
        ? leadVertical
        : undefined;
    return this.crmService.startImportFromExcel(
      type,
      file.buffer,
      mapping,
      req?.user,
      duplicateStrategy,
      { defaultLeadVertical },
    );
  }

  @Get('import/jobs/:jobId')
  @Permissions(
    'admin:manage',
    'leads:import',
    'contacts:import',
    'clients:import',
    'leads:write',
    'contacts:write',
    'clients:write',
    'pm-leads:import',
    'pm-leads:write',
  )
  getImportJob(@Param('jobId') jobId: string) {
    return this.crmService.getImportJobStatus(jobId);
  }

  // --- Deletion ---
  @Delete('leads/:id')
  @Permissions('leads:delete', 'pm-leads:delete')
  removeLead(@Param('id') id: string, @Request() req: any) {
    return this.crmService.removeLead(id, req.user?.userId);
  }

  @Post('leads/bulk-delete')
  @Permissions('leads:delete', 'pm-leads:delete')
  bulkRemoveLeads(@Body('ids') ids: string[], @Request() req: any) {
    return this.crmService.bulkRemoveLeads(ids, req.user?.userId);
  }

  @Post('leads/bulk-assign')
  @Permissions('leads:assign', 'pm-leads:assign')
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
  @Permissions('leads:write', 'pm-leads:write')
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

  /** Read-only hand-off: 2Bigha lead views associated legal cases (legal status snapshot only). */
  @Get('leads/:id/associated-legal-status')
  @Permissions('leads:read')
  getLeadAssociatedLegalStatus(@Param('id') id: string) {
    return this.crmService.getLeadAssociatedLegalStatus(id);
  }

  // --- ROLE-BASED DASHBOARDS (CRM Role Dashboard Wireframe) ---

  private isCallerAdmin(req: any): boolean {
    return (
      hasCrmAdminJwtBypass(req.user) || hasCrmAdminFromDbUser(req.crmDbUser)
    );
  }

  /**
   * Resolve which dashboard the caller lands on (admin / team / agent) and
   * whether they may open the others. Drives the frontend nav + redirect.
   */
  @Get('dashboard/role')
  @Permissions('dashboard:read', 'workspace-admin:read', 'workspace-team:read', 'workspace-agent:read')
  async getDashboardRole(@Request() req: any) {
    return this.roleDashboardService.resolveTier(
      req.crmDbUser,
      req.user,
      this.isCallerAdmin(req),
    );
  }

  /** Admin — org-wide. Only admins (bypass) or holders of workspace-admin:read. */
  @Get('dashboard/admin')
  @Permissions('workspace-admin:read', 'dashboard:read')
  async getAdminDashboardMetrics(
    @Query('window') window: string = 'this_month',
    @Query('team') team?: string,
  ) {
    return this.roleDashboardService.getAdminDashboard(window, team);
  }

  /** Team-lead picker for the Admin (anyone with direct reports). */
  @Get('dashboard/teams')
  @Permissions('workspace-admin:read', 'dashboard:read')
  async getDashboardTeams() {
    return this.roleDashboardService.listTeams();
  }

  /**
   * Agent picker: an admin gets every CRM user; anyone else gets their own team
   * (self + direct reports) — never another team's people.
   */
  @Get('dashboard/people')
  @Permissions('workspace-admin:read', 'workspace-team:read', 'dashboard:read')
  async getDashboardPeople(@Request() req: any, @Query('teamLead') teamLead?: string) {
    const self = String(req.user?.userId || req.user?._id || '');
    if (this.isCallerAdmin(req)) {
      return this.roleDashboardService.listPeople(teamLead || null);
    }
    return this.roleDashboardService.listPeople(self);
  }

  /**
   * Team Lead — scoped to the caller's own team (direct reports). An admin may
   * pass ?teamLead=<id> to inspect any team; a team lead is always forced to self.
   */
  @Get('dashboard/team')
  @Permissions('workspace-team:read', 'dashboard:read')
  async getTeamDashboardMetrics(
    @Request() req: any,
    @Query('window') window: string = 'this_month',
    @Query('teamLead') teamLead?: string,
  ) {
    const self = String(req.user?.userId || req.user?._id || '');
    const teamLeadId = this.isCallerAdmin(req) && teamLead ? teamLead : self;
    return this.roleDashboardService.getTeamDashboard(window, teamLeadId);
  }

  /**
   * Agent — scoped to self. Admins, or a Team Lead viewing one of their own
   * members, may pass ?agent=<id> (enforced: the target must be in the caller's team).
   */
  @Get('dashboard/agent')
  @Permissions('workspace-agent:read', 'workspace-team:read', 'dashboard:read')
  async getAgentDashboardMetrics(
    @Request() req: any,
    @Query('window') window: string = 'this_month',
    @Query('agent') agent?: string,
  ) {
    const self = String(req.user?.userId || req.user?._id || '');
    let agentId = self;
    if (agent && agent !== self) {
      if (this.isCallerAdmin(req)) {
        agentId = agent;
      } else {
        const allowed = await this.roleDashboardService.isDirectReport(self, agent);
        agentId = allowed ? agent : self;
      }
    }
    return this.roleDashboardService.getAgentDashboard(window, agentId);
  }
}
