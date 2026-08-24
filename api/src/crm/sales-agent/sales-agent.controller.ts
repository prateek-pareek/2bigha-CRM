import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { SalesAgentService } from './sales-agent.service';
import {
  RejectSalesAgentApprovalDto,
  TriggerSalesAgentDto,
  UpdateSalesAgentSettingsDto,
} from './dto/sales-agent.dto';
import type { SalesAgentApprovalStatus } from './sales-agent.types';
import { QuerySalesCopilotDto } from './dto/query-sales-copilot.dto';

const APPROVAL_STATUSES = new Set<SalesAgentApprovalStatus>([
  'pending',
  'approved',
  'rejected',
]);

function parseApprovalStatus(status?: string): SalesAgentApprovalStatus {
  if (status && APPROVAL_STATUSES.has(status as SalesAgentApprovalStatus)) {
    return status as SalesAgentApprovalStatus;
  }
  return 'pending';
}

@Controller('crm/sales-agent')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SalesAgentController {
  constructor(private readonly salesAgent: SalesAgentService) {}

  @Get('status')
  @Permissions('dashboard:read', 'settings:read')
  getStatus() {
    return this.salesAgent.getStatus();
  }

  @Get('settings')
  @Permissions('settings:read', 'workflows:write')
  getSettings() {
    return this.salesAgent.getSettings();
  }

  @Put('settings')
  @Permissions('settings:write', 'workflows:write')
  updateSettings(@Body() dto: UpdateSalesAgentSettingsDto) {
    return this.salesAgent.updateSettings(dto);
  }

  @Get('runs')
  @Permissions('dashboard:read', 'leads:read')
  listRuns(
    @Query('status') status?: string,
    @Query('recordType') recordType?: string,
    @Query('recordId') recordId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesAgent.listRuns({
      status,
      recordType,
      recordId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('runs/:id')
  @Permissions('dashboard:read', 'leads:read')
  getRun(@Param('id') id: string) {
    return this.salesAgent.getRun(id);
  }

  @Post('runs/trigger')
  @Permissions('leads:write')
  triggerRun(@Body() dto: TriggerSalesAgentDto, @Request() req: any) {
    return this.salesAgent.triggerManual(dto, req.user, req.crmDbUser ?? req.user?.crmDbUser);
  }

  @Get('approvals/count')
  @Permissions('dashboard:read', 'inbox:read')
  getPendingCount() {
    return this.salesAgent.getPendingApprovalCount().then((count) => ({ count }));
  }

  @Get('record/:recordType/:recordId')
  @Permissions('leads:read')
  getRecordSummary(
    @Param('recordType') recordType: 'Lead' | 'Contact',
    @Param('recordId') recordId: string,
  ) {
    return this.salesAgent.getRecordSummary(recordType, recordId);
  }

  @Get('approvals')
  @Permissions('dashboard:read', 'inbox:read')
  listApprovals(@Query('status') status?: string) {
    return this.salesAgent.listApprovals(parseApprovalStatus(status));
  }

  @Post('approvals/:id/approve')
  @Permissions('inbox:send', 'leads:write')
  approve(@Param('id') id: string, @Request() req: any) {
    return this.salesAgent.approveAction(
      id,
      req.user,
      req.crmDbUser ?? req.user?.crmDbUser,
    );
  }

  @Post('approvals/:id/reject')
  @Permissions('inbox:send', 'leads:write')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectSalesAgentApprovalDto,
    @Request() req: any,
  ) {
    return this.salesAgent.rejectAction(
      id,
      dto.reviewNote,
      req.user,
      req.crmDbUser ?? req.user?.crmDbUser,
    );
  }

  @Get('metrics')
  @Permissions('dashboard:read', 'settings:read')
  getMetrics(@Query('days') days?: string) {
    const d = days ? Math.min(Math.max(Number(days) || 30, 1), 365) : 30;
    return this.salesAgent.getMetrics(d);
  }
}

@Controller('crm/sales-copilot')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SalesCopilotController {
  constructor(private readonly salesAgent: SalesAgentService) {}

  @Get('status')
  @Permissions('dashboard:read', 'leads:read')
  getStatus() {
    return this.salesAgent.getCopilotStatus();
  }

  @Post('query')
  @Permissions('dashboard:read')
  query(@Body() dto: QuerySalesCopilotDto, @Request() req: any) {
    return this.salesAgent.queryCopilot(
      dto,
      req.user,
      req.crmDbUser ?? req.user?.crmDbUser,
    );
  }

  @Post('sessions/:sessionId/resume')
  @Permissions('dashboard:read')
  resume(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.salesAgent.resumeCopilotSession(
      sessionId,
      req.user,
      req.crmDbUser ?? req.user?.crmDbUser,
    );
  }
}
