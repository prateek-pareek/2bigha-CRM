import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { ReportingService } from '../reporting/reporting.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PipelineController {
  constructor(
    private readonly pipelinesService: PipelinesService,
    private readonly reportingService: ReportingService,
  ) {}

  @Get('pipelines')
  @Permissions(
    'leads:read',
    'deals:read',
    'proposals:read',
    'legal:read',
    'settings:read',
  )
  findAllPipelines(
    @Query('type')
    type?:
      | 'deals'
      | 'leads'
      | 'proposals'
      | 'quotations'
      | 'contracts'
      | 'legal',
  ) {
    return this.pipelinesService.findAll(type);
  }

  @Post('pipelines')
  @Permissions('settings:write')
  createPipeline(@Body() data: any) {
    return this.pipelinesService.create(data);
  }

  @Put('pipelines/:id')
  @Permissions('settings:write')
  updatePipeline(@Param('id') id: string, @Body() data: any) {
    return this.pipelinesService.update(id, data);
  }

  @Delete('pipelines/:id')
  @Permissions('settings:write')
  deletePipeline(@Param('id') id: string) {
    return this.pipelinesService.delete(id);
  }

  @Get('reports/deals')
  @Permissions('deals:read', 'settings:read')
  getDealStats(@Query('pipeline') pipeline?: string, @Query('owner') owner?: string) {
    return this.reportingService.getDealStats(owner, pipeline);
  }

  @Get('reports/leads')
  @Permissions('leads:read', 'settings:read')
  getLeadStats(@Query('pipeline') pipeline?: string, @Query('owner') owner?: string) {
    return this.reportingService.getLeadConversion(owner, undefined, undefined, pipeline);
  }

  @Get('reports/activities')
  @Permissions('activities:read', 'settings:read')
  getActivityStats(@Query('owner') owner?: string) {
    return this.reportingService.getActivityTrends(owner);
  }
}
