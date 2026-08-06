import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  private roleKey(roleRaw: unknown): string {
    const value =
      roleRaw && typeof roleRaw === 'object'
        ? (roleRaw as { name?: string }).name
        : roleRaw;
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private isStrictAdminRole(roleRaw: unknown): boolean {
    const role = this.roleKey(roleRaw);
    return ['ADMIN', 'ADMINISTRATOR', 'SUPERADMIN', 'SUPER_ADMIN', 'OWNER'].includes(role);
  }

  @Get('logs')
  @Roles('Admin', 'Administrator', 'HR', 'HR Manager', 'CEO', 'Manager')
  listLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('excludeDocumentType') excludeDocumentType?: string,
  ) {
    return this.auditService.listLogs({
      page: Number(page || 1),
      limit: Number(limit || 25),
      search,
      excludeDocumentType,
    });
  }

  @Delete('logs/:id')
  @Roles('Admin', 'Administrator', 'CEO')
  async deleteLog(@Param('id') id: string, @Request() req: any) {
    if (!this.isStrictAdminRole(req?.user?.role)) {
      throw new ForbiddenException('Only strict admin roles can delete audit logs.');
    }
    return this.auditService.deleteLog(id);
  }

  @Delete('logs')
  @Roles('Admin', 'Administrator', 'CEO')
  async purgeLogs(
    @Body()
    body: {
      olderThanDays?: number;
      documentType?: string;
    },
    @Request() req: any,
  ) {
    if (!this.isStrictAdminRole(req?.user?.role)) {
      throw new ForbiddenException('Only strict admin roles can purge audit logs.');
    }
    return this.auditService.purgeLogs({
      olderThanDays: Number(body?.olderThanDays || 0),
      documentType: body?.documentType,
    });
  }
}

