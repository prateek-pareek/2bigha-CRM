import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { IvrService } from './ivr.service';

@Controller('crm/ivr')
@UseGuards(JwtAuthGuard, RbacGuard)
export class IvrController {
  constructor(private readonly ivrService: IvrService) {}

  @Post('calls')
  @Permissions('leads:write')
  initiateCall(@Body() dto: any, @Request() req: any) {
    return this.ivrService.initiateOutboundCall(dto, req.user);
  }

  @Get('call-logs')
  @Permissions('leads:read')
  listAll(@Query() query: Record<string, string>) {
    return this.ivrService.listCallLogs(query);
  }

  @Get('call-logs/mine')
  @Permissions('leads:read')
  listMine(@Query() query: Record<string, string>, @Request() req: any) {
    return this.ivrService.listCallLogs(query, req.user?.userId);
  }

  @Get('stats')
  @Permissions('leads:read')
  stats() {
    return this.ivrService.getStats();
  }

  @Patch('call-logs/:id')
  @Permissions('leads:write')
  updateFollowUp(
    @Param('id') id: string,
    @Body() body: { followUpAt?: string | null; callbackScheduledAt?: string | null },
  ) {
    return this.ivrService.updateFollowUp(id, body);
  }
}
