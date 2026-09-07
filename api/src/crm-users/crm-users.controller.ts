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

@Controller('crm-users')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CRMUsersController {
  constructor(
    private readonly usersService: CRMUsersService,
    @InjectModel(UserConfig.name, 'crmConnection')
    private userConfigModel: Model<UserConfigDocument>,
  ) {}

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
  @Permissions('settings:admin')
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @Permissions('settings:admin')
  create(@Body() dto: any) {
    return this.usersService.create(dto);
  }

  @Get('roles')
  @Permissions('settings:admin')
  findAllRoles() {
    return this.usersService.findAllRoles();
  }

  @Get('permissions')
  @Permissions('settings:admin')
  findAllPermissions() {
    return this.usersService.findAllPermissions();
  }
  @Get('profile')
  async getProfile(@Request() req: any) {
    const user = req.user;
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
  @Permissions('settings:admin')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @Permissions('settings:admin')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('settings:admin')
  remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  @Post('roles')
  @Permissions('settings:admin')
  createRole(@Body() dto: any) {
    return this.usersService.createRole(dto);
  }

  @Put('roles/:id')
  @Permissions('settings:admin')
  updateRole(@Param('id') id: string, @Body() dto: any) {
    return this.usersService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @Permissions('settings:admin')
  deleteRole(@Param('id') id: string) {
    return this.usersService.deleteRole(id);
  }

  @Post('invite')
  @Permissions('settings:admin')
  inviteMember(@Body() body: { email: string; roleId: string }) {
    return this.usersService.inviteUser(body.email, body.roleId);
  }

  @Post('permissions')
  @Permissions('settings:admin')
  createPermission(@Body() dto: any) {
    return this.usersService.createPermission(dto);
  }

  @Post(':id/kommuno-sync')
  @Permissions('settings:admin')
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
