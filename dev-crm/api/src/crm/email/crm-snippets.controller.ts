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
import { CrmSnippetsService } from './crm-snippets.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';

/** Normalize role from JWT user (string or { name }) — aligned with RbacGuard. */
function roleKeyFromRequestUser(user: any): string {
  const r = user?.role;
  if (r != null && typeof r === 'object' && r !== null && 'name' in r) {
    return String((r as { name?: string }).name ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }
  return String(r ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Settings writers, CRM admin:manage, or platform admin roles may edit/delete any snippet. */
function userCanManageAllSnippets(req: any): boolean {
  const jwt = [
    ...(Array.isArray(req.user?.permissions) ? req.user.permissions : []),
    ...(Array.isArray(req.user?.crmPermissions) ? req.user.crmPermissions : []),
  ];
  if (jwt.includes('settings:write') || jwt.includes('admin:manage')) {
    return true;
  }
  const roleKey = roleKeyFromRequestUser(req.user);
  return (
    roleKey === 'ADMIN' ||
    roleKey === 'ADMINISTRATOR' ||
    roleKey === 'SUPERADMIN' ||
    roleKey === 'CEO' ||
    roleKey === 'CTO' ||
    roleKey === 'OWNER'
  );
}

@Controller('snippets')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CrmSnippetsController {
  constructor(private readonly snippetsService: CrmSnippetsService) {}

  @Get()
  @Permissions(
    'settings:write',
    'leads:read',
    'deals:read',
    'contacts:read',
    'inbox:read',
    'clients:read',
  )
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.snippetsService.findAll({
      activeOnly: includeInactive === 'true' ? false : true,
    });
  }

  @Get(':id')
  @Permissions(
    'settings:write',
    'leads:read',
    'deals:read',
    'contacts:read',
    'inbox:read',
    'clients:read',
  )
  async findOne(@Param('id') id: string) {
    const s = await this.snippetsService.findOne(id);
    if (!s) return null;
    return s;
  }

  @Post()
  @Permissions('settings:write', 'contacts:write', 'leads:write', 'deals:write')
  create(@Request() req: any, @Body() body: any) {
    return this.snippetsService.create({
      name: body.name,
      shortcut: body.shortcut,
      body: body.body,
      createdBy: req.user.userId,
      isActive: body.isActive,
      serviceOfferingIds: Array.isArray(body.serviceOfferingIds)
        ? body.serviceOfferingIds.filter(Boolean)
        : [],
      categoryAudience: body.categoryAudience,
      categoryMaterial: body.categoryMaterial,
    });
  }

  @Put(':id')
  @Permissions('settings:write', 'contacts:write', 'leads:write', 'deals:write')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const patch: {
      name?: string;
      shortcut?: string;
      body?: string;
      isActive?: boolean;
      serviceOfferingIds?: string[];
      categoryAudience?: unknown;
      categoryMaterial?: unknown;
    } = {
      name: body.name,
      shortcut: body.shortcut,
      body: body.body,
      isActive: body.isActive,
    };
    if (Array.isArray(body.serviceOfferingIds)) {
      patch.serviceOfferingIds = body.serviceOfferingIds.filter(Boolean);
    }
    if (body.categoryAudience !== undefined) {
      patch.categoryAudience = body.categoryAudience;
    }
    if (body.categoryMaterial !== undefined) {
      patch.categoryMaterial = body.categoryMaterial;
    }
    return this.snippetsService.update(
      id,
      patch,
      req.user.userId,
      userCanManageAllSnippets(req),
    );
  }

  @Delete(':id')
  @Permissions('settings:write', 'contacts:write', 'leads:write', 'deals:write')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.snippetsService.delete(
      id,
      req.user.userId,
      userCanManageAllSnippets(req),
    );
  }
}
