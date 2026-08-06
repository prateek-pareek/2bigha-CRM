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
import { EmailCampaignsService } from './email-campaigns.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/email-campaigns')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmailCampaignsController {
  constructor(private readonly campaignsService: EmailCampaignsService) {}

  @Get()
  @Permissions('outreach:read', 'leads:read', 'inbox:read')
  findAll(
    @Request() req: { user: { userId: string } },
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.campaignsService.findAll(req.user.userId, { status, search });
  }

  @Get('templates/:templateId/preview')
  @Permissions('outreach:read', 'leads:read')
  previewTemplate(@Param('templateId') templateId: string) {
    return this.campaignsService.loadTemplate(templateId);
  }

  @Get(':id')
  @Permissions('outreach:read', 'leads:read', 'inbox:read')
  findOne(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.findOne(req.user.userId, id);
  }

  @Post()
  @Permissions('outreach:read', 'leads:write', 'inbox:read')
  create(
    @Request() req: { user: { userId: string; email?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.campaignsService.create(
      req.user.userId,
      body as Parameters<EmailCampaignsService['create']>[1],
      req.user,
      req.user.email,
    );
  }

  @Patch(':id')
  @Permissions('outreach:read', 'leads:write', 'inbox:read')
  update(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.campaignsService.update(
      req.user.userId,
      id,
      body as Parameters<EmailCampaignsService['update']>[2],
      req.user,
    );
  }

  @Delete(':id')
  @Permissions('outreach:read', 'leads:write')
  remove(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.remove(req.user.userId, id);
  }

  @Post(':id/send')
  @Permissions('outreach:read', 'leads:write', 'inbox:read')
  sendNow(
    @Request() req: { user: { userId: string; email?: string } },
    @Param('id') id: string,
  ) {
    return this.campaignsService.sendNow(req.user.userId, id, req.user.email);
  }

  @Post(':id/cancel')
  @Permissions('outreach:read', 'leads:write')
  cancel(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.cancel(req.user.userId, id);
  }

  @Post(':id/duplicate')
  @Permissions('outreach:read', 'leads:write')
  duplicate(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.campaignsService.duplicate(req.user.userId, id);
  }
}
