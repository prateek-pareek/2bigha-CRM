import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { PlatformOpportunitiesService } from './platform-opportunities.service';
import {
  resolveListPagination,
  CRM_MAX_BOARD_PAGE_SIZE,
} from '../../common/lib/pagination/list-pagination';

@Controller('crm/platform-opportunities')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PlatformOpportunitiesController {
  constructor(private readonly service: PlatformOpportunitiesService) {}

  @Get()
  @Permissions('platform-opportunities:read', 'leads:read')
  findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
    @Query('pipeline') pipeline?: string,
    @Query('platform') platform?: string,
    @Query('mine') mine?: string,
    @Query('filters') filters?: string,
  ) {
    const parsed = resolveListPagination(
      { page, pageSize, search },
      { maxPageSize: CRM_MAX_BOARD_PAGE_SIZE },
    );
    return this.service.findAll(req.user, {
      page: parsed.page,
      pageSize: parsed.pageSize,
      search: parsed.search,
      filtersStr: filters,
      status,
      stage: stage?.trim(),
      pipeline: pipeline?.trim(),
      platform,
      mine: mine === '1' || mine === 'true',
    });
  }

  @Post()
  @Permissions('platform-opportunities:write', 'leads:write')
  create(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.service.create(body, req.user);
  }

  @Get('export/csv')
  @Permissions('platform-opportunities:read', 'leads:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="platform-opportunities.csv"',
  )
  exportCsv(@Request() req: any) {
    return this.service.exportToCsv(req.user);
  }

  @Post('bulk-delete')
  @Permissions('platform-opportunities:write', 'leads:write')
  bulkRemove(@Request() req: any, @Body('ids') ids: string[]) {
    return this.service.bulkRemove(Array.isArray(ids) ? ids : [], req.user);
  }

  @Get(':id')
  @Permissions('platform-opportunities:read', 'leads:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(id, req.user);
  }

  @Patch(':id')
  @Permissions('platform-opportunities:write', 'leads:write')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  @Permissions('platform-opportunities:write', 'leads:write')
  async remove(@Request() req: any, @Param('id') id: string) {
    const ok = await this.service.remove(id, req.user);
    if (!ok) throw new NotFoundException('Platform opportunity not found');
    return { ok: true };
  }
}
