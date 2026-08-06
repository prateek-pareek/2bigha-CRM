import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { ServiceOfferingsService } from './service-offerings.service';

@Controller('crm/service-offerings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ServiceOfferingsController {
  constructor(private readonly service: ServiceOfferingsService) {}

  @Get()
  @Permissions(
    'services:read',
    'services:write',
    'leads:read',
    'deals:read',
    'proposals:read',
  )
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Get(':id')
  @Permissions(
    'services:read',
    'services:write',
    'leads:read',
    'deals:read',
    'proposals:read',
  )
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions('services:write')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body as any);
  }

  @Put(':id')
  @Permissions('services:write')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body as any);
  }

  @Delete(':id')
  @Permissions('services:write')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
