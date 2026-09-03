import { Body, Controller, Get, Patch, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmNotificationPreferencesService } from './crm-notification-preferences.service';
import type { CrmNotifyPreferencesMap } from './crm-notification-events';

@Controller('crm/notification-preferences')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmNotificationPreferencesController {
  constructor(private readonly service: CrmNotificationPreferencesService) {}

  @Get('me')
  @Permissions('leads:read', 'dashboard:read')
  getMine(@Request() req: any) {
    return this.service.getMine(req.user);
  }

  @Put('me')
  @Permissions('leads:read', 'dashboard:read')
  upsertMine(
    @Body() body: { events?: CrmNotifyPreferencesMap },
    @Request() req: any,
  ) {
    return this.service.upsertMine(body || {}, req.user);
  }

  @Patch('me')
  @Permissions('leads:read', 'dashboard:read')
  patchMine(
    @Body() body: { events?: CrmNotifyPreferencesMap },
    @Request() req: any,
  ) {
    return this.service.upsertMine(body || {}, req.user);
  }
}
