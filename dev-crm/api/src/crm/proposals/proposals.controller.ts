import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { ProposalExportService } from './proposal-export.service';
import { ProposalsService } from './proposals.service';

@Controller('crm/proposals')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly proposalExportService: ProposalExportService,
  ) {}

  @Get()
  @Permissions('proposals:read', 'proposals:write', 'deals:read', 'leads:read')
  list(
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('pipeline') pipeline?: string,
    @Query('stage') stage?: string,
  ) {
    return this.proposalsService.findAll({
      kind,
      status,
      search: q,
      pipeline,
      stage,
    });
  }

  @Get(':id/export/pdf')
  @Permissions('proposals:read', 'proposals:write', 'deals:read', 'leads:read')
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.proposalExportService.pdfBuffer(id);
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_') || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get(':id/export/docx')
  @Permissions('proposals:read', 'proposals:write', 'deals:read', 'leads:read')
  async exportDocx(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.proposalExportService.docxBuffer(id);
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_') || 'document.docx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get(':id/export/xlsx')
  @Permissions('proposals:read', 'proposals:write', 'deals:read', 'leads:read')
  async exportXlsx(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.proposalExportService.xlsxBuffer(id);
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_') || 'document.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get(':id')
  @Permissions('proposals:read', 'proposals:write', 'deals:read', 'leads:read')
  getOne(@Param('id') id: string) {
    return this.proposalsService.findOne(id);
  }

  @Post()
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  create(@Request() req: any, @Body() body: any) {
    return this.proposalsService.create(body, req.user.userId);
  }

  @Patch(':id')
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  update(@Param('id') id: string, @Body() body: any) {
    return this.proposalsService.update(id, body);
  }

  @Delete(':id')
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  remove(@Param('id') id: string) {
    return this.proposalsService.remove(id);
  }
}
