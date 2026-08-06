import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplateMergeService } from './email-template-merge.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

function normalizeCategoryAudience(
  v: unknown,
): 'all' | 'agency' | 'freelancer' {
  const s = String(v ?? 'all').toLowerCase();
  return s === 'agency' || s === 'freelancer' ? s : 'all';
}

function normalizeCategoryMaterial(
  v: unknown,
): 'all' | 'cv' | 'portfolio' | 'case_study' {
  const s = String(v ?? 'all').toLowerCase().replace(/-/g, '_');
  if (s === 'cv' || s === 'portfolio' || s === 'case_study') return s;
  return 'all';
}

@Controller('email-templates')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmailTemplatesController {
  constructor(
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly emailTemplateMergeService: EmailTemplateMergeService,
  ) {}

  @Get()
  @Permissions('settings:write', 'leads:read', 'deals:read', 'contacts:read') // Admins manage, others can use
  findAll(@Query() query: any) {
    return this.emailTemplatesService.findAll(query);
  }

  /** Merge field values for the current user + CRM record (used by inbox compose). */
  @Get('merge-data')
  @Permissions(
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'inbox:read',
  )
  async mergeData(
    @Query('module') module: string,
    @Query('entityId') entityId: string,
    @Request() req: any,
  ) {
    const merge = await this.emailTemplateMergeService.mergeForComposer(
      module,
      entityId,
      {
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        email: req.user?.email,
      },
    );
    return { merge };
  }

  @Get(':id')
  @Permissions('leads:read', 'deals:read', 'contacts:read')
  findOne(@Param('id') id: string) {
    return this.emailTemplatesService.findOne(id);
  }

  @Post()
  @Permissions('settings:write')
  create(@Request() req: any, @Body() data: any) {
    if (data.type) data.type = data.type.toLowerCase();
    if (Array.isArray(data.serviceOfferingIds)) {
      data.serviceOfferingIds = data.serviceOfferingIds.filter(Boolean);
    }
    data.categoryAudience = normalizeCategoryAudience(data.categoryAudience);
    data.categoryMaterial = normalizeCategoryMaterial(data.categoryMaterial);
    return this.emailTemplatesService.create({
      ...data,
      createdBy: req.user.userId,
    });
  }

  @Put(':id')
  @Permissions('settings:write')
  update(@Param('id') id: string, @Body() data: any) {
    if (data.type) data.type = data.type.toLowerCase();
    if (Array.isArray(data.serviceOfferingIds)) {
      data.serviceOfferingIds = data.serviceOfferingIds.filter(Boolean);
    }
    if (data.categoryAudience !== undefined) {
      data.categoryAudience = normalizeCategoryAudience(data.categoryAudience);
    }
    if (data.categoryMaterial !== undefined) {
      data.categoryMaterial = normalizeCategoryMaterial(data.categoryMaterial);
    }
    return this.emailTemplatesService.update(id, data);
  }

  @Delete(':id')
  @Permissions('settings:write')
  delete(@Param('id') id: string) {
    return this.emailTemplatesService.delete(id);
  }
}
