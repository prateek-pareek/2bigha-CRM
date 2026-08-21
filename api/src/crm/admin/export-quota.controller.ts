import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { ExportQuotaService } from './export-quota.service';

/** Super Admin daily export quota config + Export History — spans the Lead Manager and IVR export flows. */
@Controller('crm/export-quota')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ExportQuotaController {
  constructor(private readonly service: ExportQuotaService) {}

  @Get('config')
  @Permissions('admin:manage')
  getConfig() {
    return this.service.getConfig();
  }

  @Put('config')
  @Permissions('admin:manage')
  updateConfig(
    @Body() body: { dailyLimitDefault?: number; perUserOverrides?: Record<string, number> },
  ) {
    return this.service.updateConfig(body || {});
  }

  @Get('history')
  @Permissions('admin:manage')
  history(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.listHistory({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
