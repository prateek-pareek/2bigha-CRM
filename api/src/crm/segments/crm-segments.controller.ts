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
import { CrmSegmentsService } from './crm-segments.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { CrmFilterCriterion } from '../shared/crm-list-filters';
import { CrmSegmentMemberModule } from '../schemas/crm-segment.schema';

@Controller('crm/segments')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmSegmentsController {
  constructor(private readonly segmentsService: CrmSegmentsService) {}

  @Get()
  @Permissions('leads:read', 'contacts:read')
  findAll(@Request() req: any) {
    return this.segmentsService.findAll(req.user);
  }

  @Get('for-record')
  @Permissions('leads:read', 'contacts:read')
  findForRecord(
    @Request() req: any,
    @Query('module') module: string,
    @Query('entityId') entityId: string,
  ) {
    const mod = this.segmentsService.parseMemberModule(module);
    return this.segmentsService.findForRecord(mod, entityId, req.user);
  }

  @Post('preview-counts')
  @Permissions('leads:read', 'contacts:read')
  previewCounts(
    @Request() req: any,
    @Body()
    body: {
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
      members?: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
    },
  ) {
    return this.segmentsService.previewCounts(body, req.user);
  }

  @Post('preview-members')
  @Permissions('leads:read', 'contacts:read')
  previewMembers(
    @Request() req: any,
    @Body()
    body: {
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
      members?: Array<{ module: CrmSegmentMemberModule; entityId: string }>;
      module: string;
      page?: number;
      pageSize?: number;
      search?: string;
    },
  ) {
    return this.segmentsService.previewMembers(body, req.user);
  }

  @Post(':id/clone')
  @Permissions('leads:read', 'contacts:read')
  clone(@Request() req: any, @Param('id') id: string) {
    return this.segmentsService.clone(id, req.user);
  }

  @Post(':id/assign-leads')
  @Permissions('leads:write')
  assignLeads(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      ownerName: string;
      leadIds?: string[];
      scope?: 'selected' | 'all';
    },
  ) {
    return this.segmentsService.assignLeads(id, body, req.user);
  }

  @Get(':id/campaign-recipients')
  @Permissions('outreach:read', 'leads:read', 'contacts:read')
  campaignRecipients(
    @Request() req: any,
    @Param('id') id: string,
    @Query('max') max?: string,
  ) {
    const maxN = max ? Number(max) : undefined;
    return this.segmentsService.exportCampaignRecipients(id, req.user, {
      max: Number.isFinite(maxN) ? maxN : undefined,
    });
  }

  @Get(':id/members')
  @Permissions('leads:read', 'contacts:read')
  listMembers(
    @Request() req: any,
    @Param('id') id: string,
    @Query('module') module: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    const mod = this.segmentsService.parseMemberModule(module);
    return this.segmentsService.listMembers(id, mod, req.user, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
    });
  }

  @Get(':id')
  @Permissions('leads:read', 'contacts:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.segmentsService.findOne(id, req.user);
  }

  @Post()
  @Permissions('leads:read', 'contacts:read')
  create(
    @Request() req: any,
    @Body()
    body: {
      name: string;
      description?: string;
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
    },
  ) {
    return this.segmentsService.create(body, req.user);
  }

  @Put(':id')
  @Permissions('leads:read', 'contacts:read')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      description?: string;
      listType?: 'dynamic' | 'static';
      leadFilters?: CrmFilterCriterion[];
      contactFilters?: CrmFilterCriterion[];
    }>,
  ) {
    return this.segmentsService.update(id, body, req.user);
  }

  @Delete(':id')
  @Permissions('leads:read', 'contacts:read')
  delete(@Param('id') id: string) {
    return this.segmentsService.delete(id);
  }

  @Post(':id/members')
  @Permissions('leads:read', 'contacts:read')
  addMember(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { module: CrmSegmentMemberModule; entityId: string },
  ) {
    const mod = this.segmentsService.parseMemberModule(body.module);
    return this.segmentsService.addMember(id, mod, body.entityId, req.user);
  }

  @Delete(':id/members/:module/:entityId')
  @Permissions('leads:read', 'contacts:read')
  removeMember(
    @Request() req: any,
    @Param('id') id: string,
    @Param('module') module: string,
    @Param('entityId') entityId: string,
  ) {
    const mod = this.segmentsService.parseMemberModule(module);
    return this.segmentsService.removeMember(id, mod, entityId, req.user);
  }
}
