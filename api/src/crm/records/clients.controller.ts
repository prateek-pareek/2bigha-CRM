import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ConflictException,
  Request,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CRMService } from '../core/crm.service';
import { GlobalSearchService } from '../core/global-search.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { redactCrmRevenueForUser } from '../shared/crm-admin-access.util';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly crmService: CRMService,
    private readonly searchService: GlobalSearchService,
  ) {}

  @Get('search')
  async globalSearch(
    @Query('q') q: string,
    @Query('full') full?: string,
    @Request() req?: any,
  ) {
    const fullResults =
      full === '1' || full === 'true' || full === 'yes';
    const data = await this.searchService.search(q, { full: fullResults });
    return redactCrmRevenueForUser(req?.user, data);
  }

  @Get('clients')
  @Permissions('clients:read')
  findAll(@Query() query: any, @Request() req: any) {
    return this.clientsService.findAll(query, req.user);
  }

  @Post('clients')
  @Permissions('clients:write')
  async create(@Body() data: any, @Request() req: any) {
    try {
      return await this.clientsService.create(data, req.user);
    } catch (error: any) {
      console.error('Client creation error:', error);
      if (error.code === 11000) {
        throw new ConflictException('A client with this email already exists');
      }
      throw error;
    }
  }

  @Get('clients/:id/portal-deals')
  @Permissions('clients:read')
  findClientPortalDeals(@Param('id') id: string, @Request() req: any) {
    return this.crmService.findPortalDealsForClient(id, req.user);
  }

  @Get('client-portals')
  @Permissions('clients:read')
  findAllClientPortals(@Request() req: any) {
    return this.crmService.findAllClientPortals(req.user);
  }

  @Get('client-portals/:dealId/access')
  @Permissions('clients:read')
  async listClientPortalAccess(
    @Param('dealId') dealId: string,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'viewer');
    return this.crmService.getClientPortalAccessAssignments(dealId);
  }

  @Post('client-portals/:dealId/access')
  @Permissions('clients:write')
  async assignClientPortalAccess(
    @Param('dealId') dealId: string,
    @Body() body: { employeeId: string; role?: 'viewer' | 'manager' | 'portal_admin' },
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'portal_admin');
    return this.crmService.assignClientPortalEmployee(
      dealId,
      String(body?.employeeId || ''),
      (body?.role || 'manager') as 'viewer' | 'manager' | 'portal_admin',
      req.user,
    );
  }

  @Delete('client-portals/:dealId/access/:employeeId')
  @Permissions('clients:write')
  async revokeClientPortalAccess(
    @Param('dealId') dealId: string,
    @Param('employeeId') employeeId: string,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'portal_admin');
    return this.crmService.revokeClientPortalEmployee(dealId, employeeId, req.user);
  }

  @Get('client-portals/:dealId/access-logs')
  @Permissions('clients:read')
  async listClientPortalAccessLogs(
    @Param('dealId') dealId: string,
    @Query('limit') limit: string | undefined,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'viewer');
    const n = Number(limit);
    return this.crmService.listClientPortalAccessLogs(
      dealId,
      Number.isFinite(n) ? n : 50,
    );
  }

  @Post('client-portals/:dealId/track-access')
  @Permissions('clients:read')
  async trackClientPortalAccess(
    @Param('dealId') dealId: string,
    @Body() body: { action?: string; metadata?: Record<string, unknown> },
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'viewer');
    return this.crmService.logClientPortalAccessEvent(
      dealId,
      req.user,
      body?.action || 'portal_opened',
      body?.metadata || {},
    );
  }

  @Get('client-portals/:dealId/updates')
  @Permissions('clients:read')
  async listClientPortalUpdates(
    @Param('dealId') dealId: string,
    @Query('limit') limit: string | undefined,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'viewer');
    const n = Number(limit);
    return this.crmService.listClientPortalUpdates(
      dealId,
      Number.isFinite(n) ? n : 30,
    );
  }

  @Post('client-portals/:dealId/updates')
  @Permissions('clients:write')
  async createClientPortalUpdate(
    @Param('dealId') dealId: string,
    @Body()
    body: {
      title?: string;
      body?: string;
      cadence?: 'daily' | 'weekly' | 'general';
    },
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'manager');
    return this.crmService.createClientPortalUpdate(dealId, body || {}, req.user);
  }

  @Get('client-portals/:dealId/updates/auto-draft')
  @Permissions('clients:read')
  async getClientPortalAutoDraft(
    @Param('dealId') dealId: string,
    @Query('lookbackHours') lookbackHours: string | undefined,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'viewer');
    const n = Number(lookbackHours);
    return this.crmService.buildClientPortalDailyUpdateDraft(
      dealId,
      req.user,
      Number.isFinite(n) && n > 0 ? n : 24,
    );
  }

  @Delete('client-portals/:dealId/updates/:updateId')
  @Permissions('clients:write')
  async deleteClientPortalUpdate(
    @Param('dealId') dealId: string,
    @Param('updateId') updateId: string,
    @Request() req: any,
  ) {
    await this.crmService.assertClientPortalAccess(req.user, dealId, 'manager');
    return this.crmService.deleteClientPortalUpdate(dealId, updateId, req.user);
  }

  @Get('clients/:id')
  @Permissions('clients:read')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.clientsService.findOne(id, req.user);
  }

  @Put('clients/:id')
  @Permissions('clients:write')
  async update(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.clientsService.update(id, data, req.user);
  }

  @Patch('clients/:id')
  @Permissions('clients:write')
  async patchClient(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.clientsService.update(id, data, req.user);
  }

  @Delete('clients/:id')
  @Permissions('clients:delete')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.clientsService.delete(id, req.user?.userId);
  }
}
