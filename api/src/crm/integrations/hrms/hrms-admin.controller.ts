import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RbacGuard } from '../../crm-users/rbac.guard';
import { Permissions } from '../../crm-users/permissions.decorator';
import { HrmsIntegrationService } from './hrms-integration.service';

@Controller('integrations/hrms')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class HrmsAdminController {
  constructor(private readonly hrmsIntegration: HrmsIntegrationService) {}

  @Get('pending-users')
  @Permissions('settings:admin')
  listPending() {
    return this.hrmsIntegration.listPendingHrmsUsers();
  }

  @Get('unavailable-today')
  @Permissions('settings:admin')
  listUnavailable() {
    return this.hrmsIntegration.listUnavailableToday();
  }

  @Get('assignable-users')
  listAssignable() {
    return this.hrmsIntegration.listAssignableCrmUsers();
  }

  @Post('users/:id/grant-access')
  @Permissions('settings:admin')
  async grantAccess(
    @Param('id') id: string,
    @Body()
    body: { roleId: string; reportsToUserId?: string; activate?: boolean },
  ) {
    try {
      return await this.hrmsIntegration.grantAccess(id, body);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'Grant failed');
    }
  }

  @Post('availability/revert-stale')
  @Permissions('settings:admin')
  async revertStale() {
    const count = await this.hrmsIntegration.revertStaleAvailability();
    return { reverted: count };
  }
}
