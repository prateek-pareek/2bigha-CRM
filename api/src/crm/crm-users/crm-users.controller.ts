import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CRMUsersService } from './crm-users.service';
import { AuthGuard } from '@nestjs/passport';
import { RbacGuard } from './rbac.guard';
import { Permissions } from './permissions.decorator';
import { UserConfig, UserConfigDocument } from './schemas/user-config.schema';
import { HrmsOutboundService } from '../integrations/hrms/hrms-outbound.service';
import { RoleAuditLogService } from '../../users/role-audit-log.service';
import { ForbiddenException } from '@nestjs/common';
import { hasCrmAdminFromDbUser, hasCrmAdminJwtBypass } from '../shared/crm-admin-access.util';
import { collectRolePermissionNames } from '../shared/crm-role-permissions.util';

/** Access to Settings, Users & access, Roles and the activity log can only be granted/revoked by an Admin. */
const ADMIN_ONLY_GRANT_PREFIXES = ['settings:', 'settings-users:', 'settings-roles:', 'settings-access-log:'];
const adminOnlyGrants = (names: string[]) =>
  names.filter((n) => ADMIN_ONLY_GRANT_PREFIXES.some((p) => n.startsWith(p))).sort();

const SENSITIVE_KEYS = new Set(['password', 'inviteToken', 'token', 'refreshToken', 'apiKey', 'secret']);

/** Strips secrets and mongoose internals so the activity log only keeps access-relevant fields. */
function auditSnapshot(doc: any): Record<string, unknown> | undefined {
  if (!doc) return undefined;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plain)) {
    if (SENSITIVE_KEYS.has(k) || k === '__v') continue;
    out[k] = v;
  }
  return JSON.parse(JSON.stringify(out));
}

@Controller('crm-users')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CRMUsersController {
  constructor(
    private readonly usersService: CRMUsersService,
    @InjectModel(UserConfig.name, 'crmConnection')
    private userConfigModel: Model<UserConfigDocument>,
    private readonly hrmsOutbound: HrmsOutboundService,
    private readonly accessAudit: RoleAuditLogService,
  ) {}

  /** Rejects non-admins who add or remove Settings / Users / Roles grants. Unchanged sets pass (the UI resubmits them). */
  private assertAdminOnlyGrantsUnchanged(req: any, nextNames: string[], prevNames: string[]) {
    if (hasCrmAdminJwtBypass(req?.user) || hasCrmAdminFromDbUser(req?.crmDbUser)) return;
    if (JSON.stringify(adminOnlyGrants(nextNames)) !== JSON.stringify(adminOnlyGrants(prevNames))) {
      throw new ForbiddenException('Only an Admin can grant or remove access to Settings, Users & access and Roles.');
    }
  }

  /** "Name (Role)" so the log shows which role made the change. */
  private actorOf(req: any) {
    const u = req?.user || {};
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name || u.email;
    return { userId: u.userId ?? u._id, firstName: [name, u.role ? `(${u.role})` : ''].filter(Boolean).join(' ') };
  }

  /**
   * Who changed what in Users & Roles. Visible to Admin/CEO (management bypass) and to anyone
   * granted `settings-access-log:read` in the access control list.
   */
  @Get('access-activity')
  @Permissions('settings-access-log:read')
  accessActivity(@Query() query: any) {
    return this.accessAudit.list({
      targetType: query.targetType,
      action: query.action,
      actor: query.actor,
      from: query.from,
      to: query.to,
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 50,
    });
  }

  @Get('list')
  findAllList() {
    return this.usersService.findAll();
  }

  /** HRMS users who can use the CRM portal (tool access, CRM permissions, or management role). */
  @Get('list/crm-portal')
  findCrmPortalUsers() {
    return this.usersService.findAllWithCrmPortalAccess();
  }

  /** CRM team + 2bigha staff/agents for task assignee pickers. */
  @Get('list/task-assignees')
  listTaskAssignees() {
    return this.usersService.listTaskAssigneeDirectory();
  }

  @Get()
  @Permissions('settings-users:read')
  findAll() {
    return this.usersService.findAllIncludingPending();
  }

  @Post()
  @Permissions('settings-users:write')
  async create(@Body() dto: any, @Request() req: any) {
    this.hrmsOutbound.assertCrmUserManagementAllowed('add');
    this.assertAdminOnlyGrantsUnchanged(req, collectRolePermissionNames(dto), []);
    const created: any = await this.usersService.create(dto);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'user_created',
      targetType: 'CrmUser',
      targetId: created?._id,
      targetLabel: created?.email ?? dto?.email,
      after: auditSnapshot(created),
    });
    return created;
  }

  @Get('roles')
  @Permissions('settings-roles:read', 'settings-users:read')
  findAllRoles() {
    return this.usersService.findAllRoles();
  }

  @Get('permissions')
  @Permissions('settings-roles:read', 'settings-users:read')
  findAllPermissions() {
    return this.usersService.findAllPermissions();
  }
  @Get('profile')
  async getProfile(@Request() req: any) {
    const user = req.user;
    // Enrich with latest database permissions to avoid stale JWT issues
    const dbUser = await this.usersService.findOne(user.email);
    const consolidatedPermissions = Array.from(
      new Set([
        ...(user.permissions || []),
        ...(user.crmPermissions || []),
        ...((dbUser as any)?.permissions || []),
      ]),
    );
    return {
      ...user,
      permissions: consolidatedPermissions,
      crmPermissions: (dbUser as any)?.permissions || user.crmPermissions || [],
      role: dbUser?.role || user.role,
      agentMobile: dbUser?.agentMobile,
    };
  }

  @Get('config')
  async getConfig(@Request() req: any) {
    const config = await this.userConfigModel
      .findOne({ userId: req.user.userId })
      .exec();
    if (!config) {
      return {
        dashboardLayout: [
          {
            id: 'leads-status',
            type: 'chart',
            component: 'LeadsByStatus',
            title: 'Leads by Status',
            layout: { x: 0, y: 0, w: 6, h: 4 },
          },
          {
            id: 'sales-trend',
            type: 'chart',
            component: 'SalesTrend',
            title: 'Sales Trend',
            layout: { x: 6, y: 0, w: 6, h: 4 },
          },
        ],
        savedReports: [],
      };
    }
    return config;
  }

  @Post('config')
  async updateConfig(@Request() req: any, @Body() configDto: any) {
    return this.userConfigModel
      .findOneAndUpdate(
        { userId: req.user.userId },
        { ...configDto, userId: req.user.userId },
        { upsert: true, new: true },
      )
      .exec();
  }

  @Get(':id')
  @Permissions('settings-users:read')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @Permissions('settings-users:edit')
  async update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const before: any = await this.usersService.findById(id).catch(() => null);
    if (Array.isArray(dto?.permissions) || Array.isArray(dto?.crmPermissions)) {
      this.assertAdminOnlyGrantsUnchanged(
        req,
        collectRolePermissionNames(dto),
        collectRolePermissionNames(before ? { permissions: before.permissions, crmPermissions: before.crmPermissions } : {}),
      );
    }
    const beforeSnap = auditSnapshot(before);
    const updated: any = await this.usersService.update(id, dto);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'user_updated',
      targetType: 'CrmUser',
      targetId: id,
      targetLabel: updated?.email ?? before?.email,
      before: beforeSnap,
      after: auditSnapshot(updated),
    });
    return updated;
  }

  @Delete(':id')
  @Permissions('settings-users:delete')
  async remove(@Param('id') id: string, @Request() req: any) {
    this.hrmsOutbound.assertCrmUserManagementAllowed('remove');
    const before: any = await this.usersService.findById(id).catch(() => null);
    const result = await this.usersService.delete(id);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'user_deleted',
      targetType: 'CrmUser',
      targetId: id,
      targetLabel: before?.email,
      before: auditSnapshot(before),
    });
    return result;
  }

  @Post('roles')
  @Permissions('settings-roles:write')
  async createRole(@Body() dto: any, @Request() req: any) {
    this.assertAdminOnlyGrantsUnchanged(req, collectRolePermissionNames(dto), []);
    const created = await this.usersService.createRole(dto);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'role_created',
      targetType: 'UserRole',
      targetId: created?._id ?? created?.id,
      targetLabel: created?.name ?? dto?.name,
      after: auditSnapshot(created),
    });
    return created;
  }

  @Put('roles/:id')
  @Permissions('settings-roles:edit')
  async updateRole(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const before = await this.usersService.findRoleById(id).catch(() => null);
    if (Array.isArray(dto?.permissions) || Array.isArray(dto?.crmPermissions)) {
      this.assertAdminOnlyGrantsUnchanged(req, collectRolePermissionNames(dto), collectRolePermissionNames(before));
    }
    const updated = await this.usersService.updateRole(id, dto);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'role_updated',
      targetType: 'UserRole',
      targetId: id,
      targetLabel: updated?.name ?? before?.name,
      before: auditSnapshot(before),
      after: auditSnapshot(updated),
    });
    return updated;
  }

  @Delete('roles/:id')
  @Permissions('settings-roles:delete')
  async deleteRole(@Param('id') id: string, @Request() req: any) {
    const before = await this.usersService.findRoleById(id).catch(() => null);
    const result = await this.usersService.deleteRole(id);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'role_deleted',
      targetType: 'UserRole',
      targetId: id,
      targetLabel: before?.name,
      before: auditSnapshot(before),
    });
    return result;
  }

  @Post('invite')
  @Permissions('settings-users:write')
  async inviteMember(@Body() body: { email: string; roleId: string }, @Request() req: any) {
    this.hrmsOutbound.assertCrmUserManagementAllowed('add');
    const invited: any = await this.usersService.inviteUser(body.email, body.roleId);
    await this.accessAudit.log({
      actor: this.actorOf(req),
      action: 'user_invited',
      targetType: 'CrmUser',
      targetId: invited?._id,
      targetLabel: body.email,
      after: { email: body.email, roleId: body.roleId },
    });
    return invited;
  }

  @Post('permissions')
  @Permissions('settings-roles:write')
  createPermission(@Body() dto: any) {
    return this.usersService.createPermission(dto);
  }

  @Post(':id/kommuno-sync')
  @Permissions('settings-users:edit')
  syncToKommuno(@Param('id') id: string) {
    return this.usersService.syncAgentToKommuno(id);
  }

  // ── 2bigha admin (Agent) sync — Create & Fetch ───────────────────────────
  /** getAllAdmins — read 2bigha's agent list to reconcile against CRM users. */
  @Get('twobigha/admins')
  @Permissions('settings:admin')
  fetchTwoBighaAdmins(@Query() query: any) {
    return this.usersService.fetchTwoBighaAdmins({
      search: query?.search,
      isActive:
        query?.isActive === undefined ? undefined : query.isActive === 'true' || query.isActive === true,
      department: query?.department,
      roleSlug: query?.roleSlug,
      limit: query?.limit ? Number(query.limit) : undefined,
      offset: query?.offset ? Number(query.offset) : undefined,
      fetchAll: query?.all === 'true' || query?.all === true,
    });
  }

  /** Sync-health rollup for the Settings → 2bigha Sync hub (Agents tab). */
  @Get('twobigha/summary')
  @Permissions('settings:admin')
  twoBighaSummary() {
    return this.usersService.twoBighaSummary();
  }

  /** Manually (re)sync one agent to 2bigha (createAdmin). */
  @Post(':id/twobigha-sync')
  @Permissions('settings:admin')
  syncToTwoBigha(@Param('id') id: string) {
    return this.usersService.resyncAgentToTwoBigha(id);
  }
}
