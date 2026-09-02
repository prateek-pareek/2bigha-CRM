import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { WhatsAppLinksService } from './whatsapp-links.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/whatsapp-links')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WhatsAppLinksController {
  constructor(private readonly linksService: WhatsAppLinksService) {}

  @Get()
  @Permissions('inbox:read', 'leads:read')
  listAll() {
    return this.linksService.listAll();
  }

  @Get('by-wa/:waId')
  @Permissions('inbox:read', 'leads:read')
  findByWaId(@Param('waId') waId: string) {
    return this.linksService.findByWaId(waId);
  }

  @Get('by-lead/:leadId')
  @Permissions('leads:read')
  findByLeadId(@Param('leadId') leadId: string) {
    return this.linksService.findByLeadId(leadId);
  }

  @Get('by-assignee/:assigneeId')
  @Permissions('inbox:read')
  findByAssignee(@Param('assigneeId') assigneeId: string) {
    return this.linksService.findByAssignee(assigneeId);
  }

  @Post()
  @Permissions('leads:write', 'inbox:write')
  link(@Request() req: any, @Body() body: { waId: string; leadId: string }) {
    return this.linksService.link(body.waId, body.leadId, req.user?.userId);
  }

  @Delete(':waId')
  @Permissions('leads:write', 'inbox:write')
  unlink(@Param('waId') waId: string) {
    return this.linksService.unlink(waId);
  }

  @Post(':waId/assign')
  @Permissions('inbox:write', 'leads:write')
  assign(
    @Request() req: any,
    @Param('waId') waId: string,
    @Body() body: { assigneeId: string; accessType?: 'read' | 'read_write' },
  ) {
    return this.linksService.assign(
      waId,
      body.assigneeId,
      req.user?.userId,
      body.accessType,
    );
  }

  @Delete(':waId/assign')
  @Permissions('inbox:write', 'leads:write')
  unassign(@Param('waId') waId: string) {
    return this.linksService.unassign(waId);
  }
}
