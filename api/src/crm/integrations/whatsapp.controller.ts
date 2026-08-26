import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';

@Controller('crm/whatsapp')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('conversations')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getConversations(
    @Request() req: any,
    @Query('waId') waId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.whatsappService.getConversations({
      waId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, req.user);
  }

  /** Every image/document/video/audio ever exchanged with this contact — powers the "Shared Media" panel. */
  @Get('conversations/:waId/media')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getSharedMedia(@Param('waId') waId: string) {
    return this.whatsappService.getSharedMedia(waId);
  }

  @Get('contacts')
  @Permissions('inbox:read', 'leads:read', 'contacts:read', 'activities:read')
  getContacts(@Request() req: any) {
    return this.whatsappService.getUniqueContacts(req.user);
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
      mediaUrl?: string;
      mediaFilename?: string;
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
      mediaUrl: body.mediaUrl,
      mediaFilename: body.mediaFilename,
    });
  }

  @Post('grant-temporary-access')
  @Permissions('leads:write', 'contacts:write')
  async grantTemporaryAccess(
    @Request() req: any,
    @Body()
    body: {
      waId: string;
      targetUserId: string;
      accessType: 'read' | 'read_write';
      durationMinutes: number;
    },
  ) {
    const actor = req.user;
    if (!hasCrmFullDataAccess(actor)) {
      throw new ForbiddenException('Only administrators can grant temporary access');
    }
    return this.whatsappService.grantTemporaryAccess(
      body.waId,
      body.targetUserId,
      body.accessType,
      body.durationMinutes,
      actor?.userId,
    );
  }
}
