import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ConflictException,
  Request,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CRMService } from '../core/crm.service';
import { GlobalSearchService } from '../core/global-search.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { redactCrmRevenueForUser } from '../shared/crm-admin-access.util';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly crmService: CRMService,
    private readonly searchService: GlobalSearchService,
  ) {}

  @Get('search')
  async globalSearch(
    @Query('q') q: string,
    @Query('full') full?: string,
    @Request() req?: any,
  ) {
    const fullResults =
      full === '1' || full === 'true' || full === 'yes';
    const data = await this.searchService.search(q, { full: fullResults });
    return redactCrmRevenueForUser(req?.user, data);
  }

  @Get('clients')
  @Permissions('clients:read')
  findAll(@Query() query: any, @Request() req: any) {
    return this.clientsService.findAll(query, req.user);
  }

  @Post('clients')
  @Permissions('clients:write')
  async create(@Body() data: any, @Request() req: any) {
    try {
      return await this.clientsService.create(data, req.user);
    } catch (error: any) {
      console.error('Client creation error:', error);
      if (error.code === 11000) {
        throw new ConflictException('A client with this email already exists');
      }
      throw error;
    }
  }

  @Get('clients/:id')
  @Permissions('clients:read')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.clientsService.findOne(id, req.user);
  }

  @Put('clients/:id')
  @Permissions('clients:write')
  async update(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.clientsService.update(id, data, req.user);
  }

  @Patch('clients/:id')
  @Permissions('clients:write')
  async patchClient(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.clientsService.update(id, data, req.user);
  }

  @Delete('clients/:id')
  @Permissions('clients:delete')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.clientsService.delete(id, req.user?.userId);
  }
}
