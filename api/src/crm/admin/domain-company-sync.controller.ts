import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { DomainCompanySyncService } from './domain-company-sync.service';

@Controller('crm/admin/domain-companies')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DomainCompanySyncController {
  constructor(private readonly syncService: DomainCompanySyncService) {}

  @Get('preview')
  @Permissions('admin:manage', 'organizations:write', 'contacts:write')
  preview(@Query('limitDomains') limitDomains?: string) {
    const n =
      limitDomains !== undefined && limitDomains !== ''
        ? parseInt(limitDomains, 10)
        : undefined;
    return this.syncService.syncAllContacts({
      dryRun: true,
      limitDomains: Number.isFinite(n) ? n : undefined,
    });
  }

  /**
   * Backfill: create companies from corporate email domains and associate
   * all contacts sharing that domain.
   */
  @Post('sync')
  @Permissions('admin:manage', 'organizations:write', 'contacts:write')
  sync(
    @Body()
    body?: {
      dryRun?: boolean;
      limitDomains?: number;
    },
  ) {
    return this.syncService.syncAllContacts({
      dryRun: !!body?.dryRun,
      limitDomains: body?.limitDomains,
    });
  }
}
