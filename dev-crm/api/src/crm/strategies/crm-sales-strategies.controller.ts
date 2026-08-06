import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
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
import { CrmSalesStrategiesService } from './crm-sales-strategies.service';

@Controller('crm/sales-strategies')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmSalesStrategiesController {
  constructor(private readonly service: CrmSalesStrategiesService) {}

  @Get()
  @Permissions('strategies:read')
  list(@Request() req: any, @Query('status') status?: string) {
    return this.service.list(req.user, status);
  }

  @Get(':id')
  @Permissions('strategies:read')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const doc = await this.service.findOne(id, req.user);
    if (!doc) throw new NotFoundException('Sales strategy not found');
    return doc;
  }

  @Post()
  @Permissions('strategies:write', 'strategies:create')
  async create(
    @Request() req: any,
    @Body()
    body: {
      title: string;
      summary?: string;
      objective?: string;
      status?: string;
      segments?: string[];
      motionTypes?: string[];
      icpNotes?: string[];
      channels?: string[];
      playbookSteps?: string[];
      keyMessages?: string[];
      goals?: Array<{ title?: string; metric?: string; target?: string }>;
      startDate?: string | null;
      endDate?: string | null;
      quotaTarget?: string;
      tags?: string[];
      ownerId?: string | null;
      authorizedUserIds?: string[];
    },
  ) {
    try {
      return await this.service.create(body, req.user);
    } catch (e: any) {
      if (e instanceof ForbiddenException) throw e;
      throw new BadRequestException(e?.message || 'Invalid request');
    }
  }

  @Patch(':id')
  @Permissions('strategies:write', 'strategies:update')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return await this.service.update(id, body as any, req.user);
    } catch (e: any) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException) {
        throw e;
      }
      throw new BadRequestException(e?.message || 'Invalid request');
    }
  }

  @Delete(':id')
  @Permissions('strategies:write', 'strategies:delete')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.service.remove(id, req.user);
    return { ok: true };
  }
}
