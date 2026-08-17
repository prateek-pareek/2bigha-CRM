import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/whatsapp-campaigns')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WhatsAppCampaignsController {
  constructor(private readonly campaignsService: WhatsAppCampaignsService) {}

  @Get()
  @Permissions('outreach:read', 'inbox:read')
  findAll(
    @Request() req: { user: { userId: string } },
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.campaignsService.findAll(req.user.userId, { status, search });
  }

  @Get(':id')
  @Permissions('outreach:read', 'inbox:read')
  findOne(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.findOne(req.user.userId, id);
  }

  @Post()
  @Permissions('outreach:read', 'inbox:write')
  create(
    @Request() req: { user: { userId: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.campaignsService.create(
      req.user.userId,
      body as Parameters<WhatsAppCampaignsService['create']>[1],
    );
  }

  @Patch(':id')
  @Permissions('outreach:read', 'inbox:write')
  update(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.campaignsService.update(
      req.user.userId,
      id,
      body as Parameters<WhatsAppCampaignsService['update']>[2],
    );
  }

  @Delete(':id')
  @Permissions('outreach:read', 'inbox:write')
  remove(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.remove(req.user.userId, id);
  }

  @Post(':id/launch')
  @Permissions('outreach:read', 'inbox:write')
  launch(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.launch(req.user.userId, id);
  }

  @Post(':id/pause')
  @Permissions('outreach:read', 'inbox:write')
  pause(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.pause(req.user.userId, id);
  }

  @Post(':id/resume')
  @Permissions('outreach:read', 'inbox:write')
  resume(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.resume(req.user.userId, id);
  }

  @Post(':id/cancel')
  @Permissions('outreach:read', 'inbox:write')
  cancel(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.cancel(req.user.userId, id);
  }
}
