import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { LeadPicklistOptionsService } from './lead-picklist-options.service';

/**
 * Admin-configurable "Lead Type" (leadCategory) and "Group" option lists backing
 * the Add Lead form, the lead-type tab bar, and the Group filter.
 */
@Controller('crm/lead-picklist-options')
@UseGuards(JwtAuthGuard, RbacGuard)
export class LeadPicklistOptionsController {
  constructor(private readonly service: LeadPicklistOptionsService) {}

  @Get()
  @Permissions('leads:read', 'leads:write')
  findAll(
    @Query('listKey') listKey?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(
      listKey,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  /** Groups list with per-group lead count + creator, for the top-level Groups page. */
  @Get('groups-with-counts')
  @Permissions('leads:read')
  groupsWithCounts(@Query('search') search?: string) {
    return this.service.findAllWithLeadCounts('group', search);
  }

  @Get(':id')
  @Permissions('leads:read', 'leads:write')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('settings:write')
  create(@Body() body: Record<string, unknown>, @Request() req: any) {
    const user = req.user;
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined;
    return this.service.create(body as any, {
      id: user?.userId || user?._id,
      name: name || user?.email,
    });
  }

  @Put(':id')
  @Permissions('settings:write')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body as any);
  }

  @Delete(':id')
  @Permissions('settings:write')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
