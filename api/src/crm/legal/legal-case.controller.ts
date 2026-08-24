import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { resolveListPagination, CRM_MAX_BOARD_PAGE_SIZE } from '../../common/lib/pagination/list-pagination';
import { LegalCaseService } from './legal-case.service';
import {
  LegalVerificationBucket,
  TwoBighaLegalVerificationService,
} from './twobigha-legal-verification.service';
import { CreateLegalCaseDto } from './dto/create-legal-case.dto';
import { UpdateLegalCaseDto } from './dto/update-legal-case.dto';

const LEGAL_VERIFICATION_BUCKETS: LegalVerificationBucket[] = ['pending', 'verified'];

@Controller('crm/legal-cases')
@UseGuards(JwtAuthGuard, RbacGuard)
export class LegalCaseController {
  constructor(
    private readonly legalCaseService: LegalCaseService,
    private readonly twoBighaLegalVerificationService: TwoBighaLegalVerificationService,
  ) {}

  /**
   * Live read-through to 2bigha's Legal Verification Queue — `:bucket` is
   * one of pending|verified, mapping to getPendingVerificationProperties/
   * getVerifiedProperties. Read-only review screen: distinct from this
   * CRM's own legal-case CRUD below, and from the PM-adapter-backed
   * `/crm/legal/verification` workflow. No confirmed verify/reject mutation
   * exists in the documented API yet.
   */
  @Get('twobigha/verification-queue/:bucket')
  @Permissions('legal:read')
  listTwoBighaVerificationQueue(
    @Param('bucket') bucket: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchTerm') searchTerm?: string,
  ) {
    if (!LEGAL_VERIFICATION_BUCKETS.includes(bucket as LegalVerificationBucket)) {
      throw new BadRequestException(
        `Invalid legal-verification bucket "${bucket}" — expected one of ${LEGAL_VERIFICATION_BUCKETS.join(', ')}`,
      );
    }
    return this.twoBighaLegalVerificationService.listLegalVerificationQueue(
      bucket as LegalVerificationBucket,
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        searchTerm,
      },
    );
  }

  @Post()
  @Permissions('legal:write')
  create(@Body() dto: CreateLegalCaseDto, @Request() req: any) {
    return this.legalCaseService.create(dto, req.user);
  }

  @Get()
  @Permissions('legal:read')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('pipeline') pipeline?: string,
    @Query('stage') stage?: string,
    @Query('caseOwner') caseOwner?: string,
    @Query('priority') priority?: string,
    @Query('caseType') caseType?: string,
  ) {
    const parsed = resolveListPagination(
      { page, pageSize: limit, search },
      { maxPageSize: CRM_MAX_BOARD_PAGE_SIZE },
    );
    return this.legalCaseService.findAll({
      page: parsed.page,
      pageSize: parsed.pageSize,
      search: parsed.search,
      pipeline,
      stage,
      caseOwner,
      priority,
      caseType,
    });
  }

  @Get(':id')
  @Permissions('legal:read')
  findOne(@Param('id') id: string) {
    return this.legalCaseService.findOne(id);
  }

  @Patch(':id')
  @Permissions('legal:write')
  update(@Param('id') id: string, @Body() dto: UpdateLegalCaseDto, @Request() req: any) {
    return this.legalCaseService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('legal:delete')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.legalCaseService.remove(id, req.user?.userId);
  }

  @Post('bulk-delete')
  @Permissions('legal:delete')
  bulkDelete(@Body('ids') ids: string[], @Request() req: any) {
    return this.legalCaseService.bulkDelete(ids, req.user?.userId);
  }

  @Post('bulk-assign')
  @Permissions('legal:write')
  bulkAssign(@Body() body: { caseOwner?: string; ids?: string[] }) {
    return this.legalCaseService.bulkAssign(body);
  }

  @Patch(':id/stage')
  @Permissions('legal:move_pipeline')
  updateStage(@Param('id') id: string, @Body('stage') stage: string) {
    return this.legalCaseService.updateStage(id, stage);
  }

  @Post(':id/link-lead')
  @Permissions('legal:write')
  linkLead(@Param('id') id: string, @Body('leadId') leadId: string) {
    return this.legalCaseService.linkLead(id, leadId);
  }

  @Post(':id/unlink-lead')
  @Permissions('legal:write')
  unlinkLead(@Param('id') id: string, @Body('leadId') leadId: string) {
    return this.legalCaseService.unlinkLead(id, leadId);
  }

  @Post(':id/link-contact')
  @Permissions('legal:write')
  linkContact(@Param('id') id: string, @Body('contactId') contactId: string) {
    return this.legalCaseService.linkContact(id, contactId);
  }

  @Post(':id/unlink-contact')
  @Permissions('legal:write')
  unlinkContact(@Param('id') id: string, @Body('contactId') contactId: string) {
    return this.legalCaseService.unlinkContact(id, contactId);
  }
}
