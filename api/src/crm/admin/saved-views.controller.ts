import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SavedViewsService } from './saved-views.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/saved-views')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SavedViewsController {
  constructor(private readonly savedViewsService: SavedViewsService) {}

  @Get(':module')
  @Permissions('dashboard:read')
  findAll(@Request() req: any, @Param('module') module: string) {
    return this.savedViewsService.findAll(req.user.userId, module);
  }

  @Post()
  @Permissions('dashboard:read')
  create(
    @Request() req: any,
    @Body()
    body: {
      module: string;
      name: string;
      filters?: { property: string; operator: string; value: string }[];
      columns?: { key: string; label: string; visible: boolean }[];
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      isDefault?: boolean;
    },
  ) {
    return this.savedViewsService.create(req.user.userId, body);
  }

  @Put(':id')
  @Permissions('dashboard:read')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.savedViewsService.update(req.user.userId, id, body);
  }

  @Delete(':id')
  @Permissions('dashboard:read')
  async delete(@Request() req: any, @Param('id') id: string) {
    await this.savedViewsService.delete(req.user.userId, id);
    return { success: true };
  }
}
