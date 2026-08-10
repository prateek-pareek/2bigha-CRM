import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmTrashService } from './crm-trash.service';

@Controller('crm/trash')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmTrashController {
  constructor(private readonly trashService: CrmTrashService) {}

  @Get()
  @Permissions('admin:manage')
  list(
    @Query('entityType') entityType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trashService.list({
      entityType,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('entity-types')
  @Permissions('admin:manage')
  entityTypes() {
    return { entityTypes: this.trashService.entityTypes() };
  }

  @Post(':entityType/:id/restore')
  @Permissions('admin:manage')
  restore(
    @Param('entityType') entityType: string,
    @Param('id') id: string,
  ) {
    return this.trashService.restore(entityType, id);
  }

  @Delete(':entityType/:id')
  @Permissions('admin:manage')
  purge(
    @Param('entityType') entityType: string,
    @Param('id') id: string,
  ) {
    return this.trashService.purge(entityType, id);
  }

  @Delete()
  @Permissions('admin:manage')
  empty(@Query('entityType') entityType?: string) {
    return this.trashService.empty(entityType);
  }
}
