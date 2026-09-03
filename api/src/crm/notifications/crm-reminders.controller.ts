import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmRemindersService } from './crm-reminders.service';

@Controller('crm/reminders')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmRemindersController {
  constructor(private readonly service: CrmRemindersService) {}

  @Post()
  @Permissions('leads:write', 'tasks:write')
  create(
    @Body()
    body: {
      title?: string;
      description?: string;
      relatedType?: string;
      relatedTo?: string;
      scheduledAt?: string;
      recurrence?: string;
      assigneeUserId?: string;
    },
    @Request() req: any,
  ) {
    return this.service.create(body || {}, req.user);
  }

  @Get()
  @Permissions('leads:read', 'tasks:read')
  list(
    @Query('status') status?: string,
    @Query('relatedType') relatedType?: string,
    @Query('relatedTo') relatedTo?: string,
    @Query('team') team?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    return this.service.listMine(
      {
        status,
        relatedType,
        relatedTo,
        team,
        limit: limit ? Number(limit) : undefined,
      },
      req.user,
    );
  }

  @Patch(':id/done')
  @Permissions('leads:write', 'tasks:write')
  markDone(@Param('id') id: string, @Request() req: any) {
    return this.service.markDone(id, req.user);
  }

  @Patch(':id/reschedule')
  @Permissions('leads:write', 'tasks:write')
  reschedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt?: string; recurrence?: string },
    @Request() req: any,
  ) {
    return this.service.reschedule(id, body || {}, req.user);
  }
}
