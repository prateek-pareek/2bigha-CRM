import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebsitePublicApiKeyGuard } from '../shared/website-public-api-key.guard';
import { WebsiteInboundService } from './website-inbound.service';
import { SubmitWebsiteContactDto } from './dto/submit-website-contact.dto';
import { SubmitWebsiteChatDto } from './dto/submit-website-chat.dto';

/**
 * Public endpoints for mathionix.com (and freelancer site) contact + chat widgets.
 * Auth: Authorization: Bearer SITE_CMS_PUBLIC_API_KEY (same as blog CMS).
 */
@Controller('crm/public/website')
@UseGuards(WebsitePublicApiKeyGuard)
export class WebsiteInboundPublicController {
  constructor(private readonly service: WebsiteInboundService) {}

  private requestMeta(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : req.ip;
    return {
      ipAddress: ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    };
  }

  @Post('contact')
  submitContact(@Body() dto: SubmitWebsiteContactDto, @Req() req: Request) {
    return this.service.submitContact(dto, this.requestMeta(req));
  }

  @Post('chat')
  submitChat(@Body() dto: SubmitWebsiteChatDto, @Req() req: Request) {
    return this.service.submitChatMessage(dto, this.requestMeta(req));
  }
}
