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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { WebsiteInboundService } from './website-inbound.service';

@Controller('crm/website-leads')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WebsiteLeadsController {
  constructor(private readonly service: WebsiteInboundService) {}

  @Get()
  @Permissions('leads:read')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('audience') audience?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listWebsiteLeads({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
      audience,
      search,
    });
  }

  @Get(':id')
  @Permissions('leads:read')
  one(@Param('id') id: string) {
    return this.service.getWebsiteLead(id);
  }

  @Patch(':id')
  @Permissions('leads:write')
  patch(
    @Param('id') id: string,
    @Body() body: { status?: string; notes?: string },
  ) {
    return this.service.patchWebsiteLead(id, body);
  }

  @Post(':id/convert-to-lead')
  @Permissions('leads:write')
  convert(@Param('id') id: string, @Request() req: { user: any }) {
    return this.service.convertWebsiteLeadToCrmLead(id, req.user);
  }

  @Delete(':id')
  @Permissions('leads:write')
  remove(@Param('id') id: string) {
    return this.service.deleteWebsiteLead(id);
  }
}

@Controller('crm/website-chats')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WebsiteChatsController {
  constructor(private readonly service: WebsiteInboundService) {}

  @Get()
  @Permissions('leads:read')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('audience') audience?: string,
    @Query('search') search?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.listChatSessions({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
      audience,
      search,
      unreadOnly: unreadOnly === '1' || unreadOnly === 'true',
    });
  }

  @Get(':id')
  @Permissions('leads:read')
  one(@Param('id') id: string) {
    return this.service.getChatSession(id);
  }

  @Patch(':id')
  @Permissions('leads:write')
  patch(
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      staffNotes?: string;
      unreadByStaff?: boolean;
    },
  ) {
    return this.service.patchChatSession(id, body);
  }

  @Post(':id/reply')
  @Permissions('leads:write')
  reply(
    @Param('id') id: string,
    @Body() body: { message: string; staffName?: string },
    @Request() req: { user: any },
  ) {
    return this.service.staffReplyToChat(id, body, req.user);
  }
}
