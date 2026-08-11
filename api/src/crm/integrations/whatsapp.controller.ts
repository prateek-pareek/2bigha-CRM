import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/whatsapp')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('conversations')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getConversations(
    @Query('waId') waId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.whatsappService.getConversations({
      waId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('contacts')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getContacts() {
    return this.whatsappService.getUniqueContacts();
  }

  @Get('templates')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getTemplates(@Query('refresh') refresh?: string) {
    const shouldRefresh =
      refresh === '1' || refresh === 'true' || refresh === 'yes';
    return this.whatsappService.listTemplates({ refresh: shouldRefresh });
  }

  @Post('templates/sync')
  @Permissions('inbox:write', 'leads:write', 'contacts:write')
  syncTemplates() {
    return this.whatsappService.syncTemplates();
  }

  @Post('send')
  @Permissions('leads:write', 'contacts:write', 'inbox:write')
  sendMessage(
    @Request() req: any,
    @Body()
    body: { to: string; body: string; module?: string; entityId?: string },
  ) {
    return this.whatsappService.sendMessage(
      body.to,
      body.body,
      req.user?.userId,
      body.module,
      body.entityId,
    );
  }

  @Post('send-template')
  @Permissions('leads:write', 'contacts:write', 'inbox:write')
  sendTemplate(
    @Request() req: any,
    @Body()
    body: {
      to: string;
      name: string;
      language: string;
      components?: Array<{
        type: string;
        sub_type?: string;
        index?: string | number;
        parameters?: Array<{ type: string; text?: string; [key: string]: any }>;
      }>;
      bodyPreview?: string;
      module?: string;
      entityId?: string;
    },
  ) {
    return this.whatsappService.sendTemplateMessage({
      to: body.to,
      name: body.name,
      language: body.language,
      components: body.components,
      bodyPreview: body.bodyPreview,
      userId: req.user?.userId,
      module: body.module,
      entityId: body.entityId,
    });
  }
}
