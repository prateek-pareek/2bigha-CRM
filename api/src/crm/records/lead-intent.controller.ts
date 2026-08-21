import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { LeadIntentService } from './lead-intent.service';

/**
 * Lead Intent — captures potential future opportunities (client may later
 * become a Buyer/Seller/Investor, buy a Subscription, or list a Property/Farm)
 * with a follow-up date to reconnect. Backs the Add Lead form's intent chips,
 * the Call Activity Form, the Lead Intent List page, and the Lead Intent
 * Analytics dashboard.
 */
@Controller('crm/lead-intent')
@UseGuards(JwtAuthGuard, RbacGuard)
export class LeadIntentController {
  constructor(private readonly service: LeadIntentService) {}

  @Post('events')
  @Permissions('leads:write')
  recordIntent(
    @Body() body: { leadId: string; intents: string[]; followUpAt?: string },
    @Request() req: any,
  ) {
    return this.service.recordIntent(
      body.leadId,
      body.intents,
      body.followUpAt,
      'manual',
      req.user,
    );
  }

  @Get('list')
  @Permissions('leads:read')
  list(
    @Query('intent') intent?: string,
    @Query('owner') owner?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listByIntent({
      intent,
      owner,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('analytics')
  @Permissions('dashboard:read', 'leads:read')
  analytics(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.service.getAnalytics({ dateFrom, dateTo, agentId });
  }
}
