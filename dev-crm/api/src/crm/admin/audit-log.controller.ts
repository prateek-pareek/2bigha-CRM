import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Delete,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions('admin:read')
  findAll(@Query() query: any) {
    return this.auditLogService.findAll(query);
  }

  @Get('entity/:id')
  @Permissions('leads:read', 'deals:read', 'contacts:read')
  findByEntity(@Param('id') id: string) {
    return this.auditLogService.findByEntity(id);
  }

  @Delete(':id')
  @Permissions('admin:delete')
  async remove(@Param('id') id: string) {
    const deleted = await this.auditLogService.deleteLog(id);
    return { success: deleted };
  }

  @Delete()
  @Permissions('admin:delete')
  async removeAll() {
    await this.auditLogService.deleteAllLogs();
    return { success: true };
  }
}
