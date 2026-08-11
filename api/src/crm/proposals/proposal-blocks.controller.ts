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
  UseGuards,
} from '@nestjs/common';
import { ProposalBlocksService } from './proposal-blocks.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { PROPOSAL_BLOCK_CATEGORIES } from '../schemas/proposal-block.schema';

function canManageAllBlocks(req: any): boolean {
  const jwt = [
    ...(Array.isArray(req.user?.permissions) ? req.user.permissions : []),
    ...(Array.isArray(req.user?.crmPermissions) ? req.user.crmPermissions : []),
  ];
  return (
    jwt.includes('proposals:write') || jwt.includes('settings:write')
  );
}

@Controller('crm/proposal-blocks')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProposalBlocksController {
  constructor(private readonly blocksService: ProposalBlocksService) {}

  @Get('categories')
  @Permissions(
    'proposals:read',
    'proposals:write',
    'deals:read',
    'leads:read',
  )
  categories() {
    return PROPOSAL_BLOCK_CATEGORIES.map((id) => ({
      id,
      label: labelForCategory(id),
    }));
  }

  @Get()
  @Permissions(
    'proposals:read',
    'proposals:write',
    'deals:read',
    'leads:read',
  )
  findAll(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.blocksService.findAll({
      category: category?.trim() || undefined,
      activeOnly: includeInactive === 'true' ? false : true,
    });
  }

  @Get(':id')
  @Permissions(
    'proposals:read',
    'proposals:write',
    'deals:read',
    'leads:read',
  )
  findOne(@Param('id') id: string) {
    return this.blocksService.findOne(id);
  }

  @Post()
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  create(@Request() req: any, @Body() body: any) {
    const cat = PROPOSAL_BLOCK_CATEGORIES.includes(body.category)
      ? body.category
      : 'other';
    return this.blocksService.create({
      name: body.name,
      category: cat,
      bodyHtml: body.bodyHtml ?? '',
      createdBy: req.user.userId,
      isActive: body.isActive,
    });
  }

  @Patch(':id')
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const cat =
      body.category != null && PROPOSAL_BLOCK_CATEGORIES.includes(body.category)
        ? body.category
        : undefined;
    return this.blocksService.update(
      id,
      {
        name: body.name,
        category: cat,
        bodyHtml: body.bodyHtml,
        isActive: body.isActive,
      },
      req.user.userId,
      canManageAllBlocks(req),
    );
  }

  @Delete(':id')
  @Permissions('proposals:write', 'deals:write', 'leads:write')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.blocksService.delete(
      id,
      req.user.userId,
      canManageAllBlocks(req),
    );
  }
}

function labelForCategory(id: string): string {
  const map: Record<string, string> = {
    portfolio: 'Portfolio & case studies',
    payment_terms: 'Payment terms & bank details',
    about_intro: 'About / introduction',
    scope_boilerplate: 'Scope boilerplate',
    legal: 'Legal & IP',
    commercials: 'Commercials & pricing',
    other: 'Other',
  };
  return map[id] ?? id;
}
