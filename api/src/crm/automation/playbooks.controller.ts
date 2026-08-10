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
import { PlaybooksService } from './playbooks.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

@Controller('crm/playbooks')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PlaybooksController {
  constructor(private readonly playbooksService: PlaybooksService) {}

  @Get('templates')
  @Permissions('settings:write')
  listTemplates() {
    return this.playbooksService.listTemplates();
  }

  @Get('recommendations')
  @Permissions(
    'dashboard:read',
    'leads:read',
    'deals:read',
    'contacts:read',
  )
  recommendations(
    @Query('relatedTo') relatedTo: string,
    @Query('relatedType') relatedType: string,
  ) {
    return this.playbooksService.recommendations(relatedTo, relatedType);
  }

  @Get()
  @Permissions(
    'dashboard:read',
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
  )
  findAll(
    @Query('appliesTo') appliesTo?: string,
    @Query('admin') admin?: string,
    @Query('category') category?: string,
    @Query('team') team?: string,
    @Query('salesStage') salesStage?: string,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
    @Query('status') status?: string,
  ) {
    if (admin === '1' || admin === 'true') {
      return this.playbooksService.findAllAdmin({
        category,
        team,
        salesStage,
        search,
        status,
        includeArchived: includeArchived === '1' || includeArchived === 'true',
      });
    }
    return this.playbooksService.findAll(appliesTo, {
      category,
      team,
      salesStage,
      search,
    });
  }

  @Post('from-template')
  @Permissions('settings:write')
  createFromTemplate(
    @Body() body: { templateKey: string },
    @Request() req: any,
  ) {
    const uid = req.user?.userId || req.user?._id;
    return this.playbooksService.createFromTemplate(
      body.templateKey,
      uid ? String(uid) : undefined,
    );
  }

  @Get(':id')
  @Permissions(
    'dashboard:read',
    'leads:read',
    'deals:read',
    'contacts:read',
    'organizations:read',
    'clients:read',
    'settings:write',
  )
  findOne(@Param('id') id: string) {
    return this.playbooksService.findOne(id);
  }

  @Post()
  @Permissions('settings:write')
  create(@Body() dto: any, @Request() req: any) {
    const uid = req.user?.userId || req.user?._id;
    return this.playbooksService.create(dto, uid ? String(uid) : undefined);
  }

  @Put(':id')
  @Permissions('settings:write')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.playbooksService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings:write')
  remove(@Param('id') id: string) {
    return this.playbooksService.remove(id);
  }

  @Post(':id/clone')
  @Permissions('settings:write')
  clone(@Param('id') id: string, @Request() req: any) {
    const uid = req.user?.userId || req.user?._id;
    return this.playbooksService.clone(id, uid ? String(uid) : undefined);
  }

  @Post(':id/archive')
  @Permissions('settings:write')
  archive(
    @Param('id') id: string,
    @Body() body: { archived?: boolean },
  ) {
    const archived = body?.archived !== false;
    return this.playbooksService.setArchived(id, archived);
  }

  @Post(':id/apply')
  @Permissions('activities:write')
  apply(
    @Param('id') id: string,
    @Body() body: { relatedTo: string; relatedType: string },
    @Request() req: any,
  ) {
    return this.playbooksService.apply(
      id,
      body.relatedTo,
      body.relatedType,
      req.user,
    );
  }

  @Post(':id/runner/submit')
  @Permissions('activities:write')
  submitRunner(
    @Param('id') id: string,
    @Body()
    body: {
      relatedTo: string;
      relatedType: string;
      answers: Record<string, unknown>;
      callOutcome: string;
      callOutcomeNote?: string;
    },
    @Request() req: any,
  ) {
    return this.playbooksService.submitRunner(id, body, req.user);
  }
}
