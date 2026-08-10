import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @Permissions('settings:write')
  create(@Body() createDto: any) {
    return this.customFieldsService.create(createDto);
  }

  @Get()
  @Permissions(
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'leads:write',
    'deals:write',
    'contacts:write',
    'organizations:write',
    'clients:write',
  )
  findAll(@Query('module') module: string) {
    return this.customFieldsService.findAll(module);
  }

  @Patch('reorder')
  @Permissions('settings:write')
  reorder(@Body() body: { ids: string[] }) {
    return this.customFieldsService.reorder(body.ids);
  }

  @Get(':id')
  @Permissions(
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'leads:write',
    'deals:write',
    'contacts:write',
    'organizations:write',
    'clients:write',
  )
  findOne(@Param('id') id: string) {
    return this.customFieldsService.findOne(id);
  }

  @Put(':id')
  @Permissions('settings:write')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.customFieldsService.update(id, updateDto);
  }

  @Delete(':id')
  @Permissions('settings:write')
  remove(@Param('id') id: string, @Body() body?: { mergeInto?: string }) {
    return this.customFieldsService.remove(id, body?.mergeInto);
  }
}
