import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Public } from '../../auth/public.decorator';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { EmailTrackingService } from './email-tracking.service';
import { isLikelyEmailTrackingBot } from '../shared/email-tracking-bot.util';

/** 1x1 transparent GIF */
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller('crm/track')
@UseGuards(JwtAuthGuard)
export class EmailTrackingController {
  constructor(private readonly trackingService: EmailTrackingService) {}

  /** Merged open/click history for a contact (includes linked lead/deal/company/contact sends). */
  @Get('contact/:contactId')
  @UseGuards(RbacGuard)
  @Permissions(
    'leads:read',
    'contacts:read',
    'deals:read',
    'organizations:read',
  )
  getAggregatedContactTracking(@Param('contactId') contactId: string) {
    return this.trackingService.getAggregatedTrackingForContact(contactId);
  }

  @Get('entity/:entityId')
  @UseGuards(RbacGuard)
  @Permissions(
    'leads:read',
    'contacts:read',
    'deals:read',
    'clients:read',
    'organizations:read',
  )
  getTrackingByEntity(
    @Param('entityId') entityId: string,
    @Query('module') module: string,
  ) {
    return this.trackingService.getTrackingByEntity(
      entityId,
      module || 'leads',
    );
  }

  @Get('config')
  @UseGuards(RbacGuard)
  @Permissions(
    'leads:read',
    'contacts:read',
    'deals:read',
    'clients:read',
    'organizations:read',
  )
  getTrackingConfig() {
    return this.trackingService.getTrackingConfig();
  }

  @Get('open/:token')
  @Public()
  async trackOpen(
    @Param('token') token: string,
    @Res() res: Response,
    @Request() req: any,
  ) {
    const userAgent = String(req.headers['user-agent'] || '');
    // Skip scanners / empty UAs. GoogleImageProxy is allowed (real Gmail opens).
    // recordOpen also applies a post-send grace period for immediate ATP prefetches.
    if (!isLikelyEmailTrackingBot(userAgent)) {
      await this.trackingService.recordOpen(token);
    }

    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    });
    res.send(TRACKING_PIXEL);
  }

  @Get('click/:token')
  @Public()
  async trackClick(
    @Param('token') token: string,
    @Query('u') encodedUrl: string,
    @Res() res: Response,
    @Request() req: any,
  ) {
    const userAgent = String(req.headers['user-agent'] || '');
    // Always redirect so Safe Links / SEG probes succeed, but do not count bots as opened/clicked.
    const destination = encodedUrl
      ? await this.trackingService.recordClick(token, encodedUrl, {
          skipEngagement: isLikelyEmailTrackingBot(userAgent),
        })
      : null;
    if (destination) {
      return res.redirect(302, destination);
    }
    res.status(404).send('Not found');
  }
}
