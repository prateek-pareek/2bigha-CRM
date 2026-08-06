import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { LeadEngagementAutomationService } from './lead-engagement-automation.service';
import type {
  LeadEngagementAutoFollowUp,
  LeadEngagementAutoOutreach,
  LeadEngagementAutomationRules,
} from '../schemas/lead-engagement-automation-template.schema';
import type { LeadEngagementRuleToggles } from './lead-engagement-automation.service';

@Controller('crm/lead-engagement-templates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class LeadEngagementAutomationController {
  constructor(
    private readonly leadEngagementAutomation: LeadEngagementAutomationService,
  ) {}

  @Get('system-presets')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'leads:read',
  )
  listSystemPresets() {
    return this.leadEngagementAutomation.listSystemPresets();
  }

  @Get()
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'leads:read',
  )
  listTemplates() {
    return this.leadEngagementAutomation.listTemplates();
  }

  @Get('pipeline-assignments')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'leads:read',
    'settings-pipelines:read',
  )
  listAssignments() {
    return this.leadEngagementAutomation.listPipelineAssignments();
  }

  @Get('for-pipeline/:pipelineId')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'leads:read',
    'leads:write',
  )
  getForPipeline(@Param('pipelineId') pipelineId: string) {
    return this.leadEngagementAutomation.getTemplateForPipeline(pipelineId);
  }

  @Get(':id/diagnose-followup')
  @Permissions(
    'workflows:read',
    'workflows:write',
    'settings:read',
    'settings:write',
    'settings-workflows:read',
    'settings-workflows:write',
    'leads:read',
  )
  diagnoseFollowUp(@Param('id') templateId: string) {
    return this.leadEngagementAutomation.diagnoseFollowUpConfiguration(templateId);
  }

  @Post('run')
  @Permissions(
    'workflows:write',
    'settings:write',
    'leads:write',
    'settings-workflows:write',
  )
  runAutomation(
    @Body()
    body: {
      leadIds?: string[];
      pipelineId?: string;
      includeEngagementReconcile?: boolean;
      dryRun?: boolean;
    },
  ) {
    return this.leadEngagementAutomation.runAutomationBulk(body);
  }

  @Put(':id/rule-toggles')
  @Permissions('workflows:write', 'settings:write', 'settings-workflows:write')
  updateRuleToggles(
    @Param('id') id: string,
    @Body() body: LeadEngagementRuleToggles,
  ) {
    return this.leadEngagementAutomation.updateRuleToggles(id, body);
  }

  @Post('from-preset')
  @Permissions('workflows:write', 'settings:write')
  createFromPreset(@Body() body: { presetKey: string }) {
    const key = String(body?.presetKey || '').trim();
    if (!key) {
      throw new BadRequestException('presetKey is required');
    }
    return this.leadEngagementAutomation.createFromPresetKey(key);
  }

  @Post()
  @Permissions('workflows:write', 'settings:write')
  createTemplate(
    @Body()
    body: {
      name: string;
      description?: string;
      enabled?: boolean;
      rules: LeadEngagementAutomationRules;
      autoFollowUp?: LeadEngagementAutoFollowUp;
      autoOutreach?: LeadEngagementAutoOutreach;
    },
  ) {
    if (!body?.name?.trim()) {
      throw new BadRequestException('Template name is required');
    }
    if (!body?.rules) {
      throw new BadRequestException('rules are required');
    }
    return this.leadEngagementAutomation.createTemplate(body);
  }

  @Put('pipeline-assignments/:pipelineId')
  @Permissions('workflows:write', 'settings:write')
  assignToPipeline(
    @Param('pipelineId') pipelineId: string,
    @Body() body: { templateId: string | null },
  ) {
    return this.leadEngagementAutomation.assignTemplateToPipeline(
      pipelineId,
      body?.templateId ?? null,
    );
  }

  @Put(':id')
  @Permissions('workflows:write', 'settings:write')
  updateTemplate(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      description: string;
      enabled: boolean;
      rules: LeadEngagementAutomationRules;
      autoFollowUp: LeadEngagementAutoFollowUp;
      autoOutreach: LeadEngagementAutoOutreach;
    }>,
  ) {
    return this.leadEngagementAutomation.updateTemplate(id, body);
  }

  @Delete(':id')
  @Permissions('workflows:write', 'settings:write')
  async deleteTemplate(@Param('id') id: string) {
    const ok = await this.leadEngagementAutomation.deleteTemplate(id);
    if (!ok) {
      throw new BadRequestException('Template not found or cannot delete system template');
    }
    return { ok: true };
  }
}
