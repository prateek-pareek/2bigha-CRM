import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { DealEngagementAutomationService } from './deal-engagement-automation.service';
import { DEAL_ENGAGEMENT_SYSTEM_PRESETS } from './deal-engagement-automation-presets';

@Controller('crm/deal-engagement-templates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DealEngagementAutomationController {
  constructor(
    private readonly dealEngagementAutomation: DealEngagementAutomationService,
  ) {}

  @Get('system-presets')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'deals:read',
  )
  listSystemPresets() {
    return DEAL_ENGAGEMENT_SYSTEM_PRESETS.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
    }));
  }

  @Get()
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'deals:read',
    'settings-pipelines:read',
  )
  listTemplates() {
    return this.dealEngagementAutomation.listTemplates();
  }

  @Get('pipeline-assignments')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'deals:read',
    'settings-pipelines:read',
  )
  listAssignments() {
    return this.dealEngagementAutomation.listPipelineAssignments();
  }

  @Put('pipeline-assignments/:pipelineId')
  @Permissions('workflows:write', 'settings:write')
  assignToPipeline(
    @Param('pipelineId') pipelineId: string,
    @Body() body: { templateId: string | null },
  ) {
    return this.dealEngagementAutomation.assignTemplateToPipeline(
      pipelineId,
      body?.templateId ?? null,
    );
  }
}
