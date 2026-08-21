import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { isCrmTopAdmin } from '../shared/crm-admin-access.util';
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

  /** Call Activity Form ("Set Activity") — logs a disposition without placing a live call. */
  @Post('call-activity')
  @Permissions('leads:write')
  logCallActivity(
    @Body() dto: { leadId: string; status: string; notes?: string; followUpAt?: string; intents?: string[] },
    @Request() req: any,
  ) {
    return this.ivrService.logCallActivity(dto, req.user);
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

  /** Super Admin export of call logs (mirrors the Lead Manager export flow). */
  @Get('export')
  @Permissions('admin:manage')
  async exportCallLogs(
    @Request() req: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (!isCrmTopAdmin(req.user, req.crmDbUser ?? req.user?.crmDbUser)) {
      throw new ForbiddenException('Call log export is restricted to Super Admins.');
    }
    return this.ivrService.exportCallLogsToCsv({ dateFrom, dateTo }, req.user);
  }

  @Post('import/preview')
  @Permissions('admin:manage')
  @UseInterceptors(FileInterceptor('file'))
  async importPreview(@UploadedFile() file: any, @Request() req: any) {
    if (!isCrmTopAdmin(req.user, req.crmDbUser ?? req.user?.crmDbUser)) {
      throw new ForbiddenException('Call log import is restricted to Super Admins.');
    }
    return { headers: this.ivrService.getCallLogFileHeaders(file.buffer) };
  }

  @Post('import')
  @Permissions('admin:manage')
  @UseInterceptors(FileInterceptor('file'))
  async importCallLogs(
    @UploadedFile() file: any,
    @Body('mapping') mappingJson?: string,
    @Request() req?: any,
  ) {
    if (!isCrmTopAdmin(req?.user, req?.crmDbUser ?? req?.user?.crmDbUser)) {
      throw new ForbiddenException('Call log import is restricted to Super Admins.');
    }
    const mapping = mappingJson ? JSON.parse(mappingJson) : undefined;
    return this.ivrService.importCallLogsFromCsv(file.buffer, mapping, req?.user);
  }
}
