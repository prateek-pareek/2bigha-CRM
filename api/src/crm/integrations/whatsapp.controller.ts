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
}
