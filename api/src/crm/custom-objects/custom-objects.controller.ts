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
import { CustomObjectsService } from './custom-objects.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/object-types')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CustomObjectTypesController {
  constructor(private readonly customObjectsService: CustomObjectsService) {}

  @Get()
  @Permissions(
    'settings:read',
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
  )
  list(@Query('includeInactive') includeInactive?: string) {
    return this.customObjectsService.listObjectTypes({
      includeInactive: includeInactive === '1' || includeInactive === 'true',
    });
  }

  @Get(':key')
  @Permissions(
    'settings:read',
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
  )
  get(@Param('key') key: string) {
    return this.customObjectsService.getObjectTypeByKey(key);
  }

  @Post()
  @Permissions('settings:write')
  create(@Request() req: any, @Body() body: any) {
    return this.customObjectsService.createObjectType({
      ...body,
      createdBy: req.user?.userId || req.user?.id || req.user?._id,
    });
  }

  @Put(':key')
  @Permissions('settings:write')
  update(@Param('key') key: string, @Body() body: any) {
    return this.customObjectsService.updateObjectType(key, body);
  }

  @Delete(':key')
  @Permissions('settings:write')
  remove(@Request() req: any, @Param('key') key: string) {
    return this.customObjectsService.deleteObjectType(
      key,
      req.user?.userId || req.user?.id || req.user?._id,
    );
  }
}

@Controller('crm/objects')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CustomObjectRecordsController {
  constructor(private readonly customObjectsService: CustomObjectsService) {}

  @Get(':objectTypeKey/records')
  @Permissions(
    'settings:read',
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
  )
  list(
    @Param('objectTypeKey') objectTypeKey: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('afterId') afterId?: string,
  ) {
    return this.customObjectsService.listRecords(objectTypeKey, {
      page,
      pageSize,
      search,
      afterId,
    });
  }

  @Get(':objectTypeKey/records/:id')
  @Permissions(
    'settings:read',
    'leads:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
  )
  get(
    @Param('objectTypeKey') objectTypeKey: string,
    @Param('id') id: string,
  ) {
    return this.customObjectsService.getRecord(objectTypeKey, id);
  }

  @Post(':objectTypeKey/records')
  @Permissions('settings:write', 'leads:write', 'contacts:write')
  create(
    @Request() req: any,
    @Param('objectTypeKey') objectTypeKey: string,
    @Body() body: any,
  ) {
    return this.customObjectsService.createRecord(objectTypeKey, {
      ...body,
      createdBy: req.user?.userId || req.user?.id || req.user?._id,
    });
  }

  @Put(':objectTypeKey/records/:id')
  @Permissions('settings:write', 'leads:write', 'contacts:write')
  update(
    @Param('objectTypeKey') objectTypeKey: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.customObjectsService.updateRecord(objectTypeKey, id, body);
  }

  @Delete(':objectTypeKey/records/:id')
  @Permissions('settings:write', 'leads:write', 'contacts:write')
  remove(
    @Request() req: any,
    @Param('objectTypeKey') objectTypeKey: string,
    @Param('id') id: string,
  ) {
    return this.customObjectsService.deleteRecord(
      objectTypeKey,
      id,
      req.user?.userId || req.user?.id || req.user?._id,
    );
  }
}
