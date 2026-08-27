import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CRMUser, CRMUserDocument } from './schemas/user.schema';
import { Role, RoleDocument } from './schemas/role.schema';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import * as bcrypt from 'bcrypt';
import { TrashService } from '../../trash/trash.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { isPlatformSuperAdminEmail } from '../../auth/platform-super-admin.util';
import { TwoBighaAgentService } from './twobigha-agent.service';
import { KommunoAgentService } from './kommuno-agent.service';

const CRM_PORTAL_MANAGEMENT_ROLES = new Set(
  [
    'ADMIN',
    'CEO',
    'CTO',
    'MANAGER',
    'EXECUTIVE',
    'SENIOR MEMBER',
    'ADMINISTRATOR',
  ].map((r) => r.toUpperCase()),
);

function hrmsUserHasCrmPortalAccess(doc: {
  role?: string;
  permittedTools?: string[];
  crmPermissions?: string[];
}): boolean {
  const role = (doc.role || '').toUpperCase();
  if (CRM_PORTAL_MANAGEMENT_ROLES.has(role)) return true;
  const tools = (doc.permittedTools || []).map((t) =>
    String(t || '').toUpperCase(),
  );
  if (tools.includes('CRM')) return true;
  if (Array.isArray(doc.crmPermissions) && doc.crmPermissions.length > 0)
    return true;
  return false;
}

const CANONICAL_CRM_PERMISSIONS: {
  name: string;
  module: string;
  description: string;
}[] = [
  { name: 'leads:delete', module: 'crm', description: 'Remove leads' },
  { name: 'contacts:delete', module: 'crm', description: 'Remove contacts' },
  {
    name: 'organizations:delete',
    module: 'crm',
    description: 'Remove organizations',
  },
  { name: 'clients:delete', module: 'crm', description: 'Remove clients' },
  {
    name: 'workflows:delete',
    module: 'crm',
    description: 'Remove automation workflows',
  },
  {
    name: 'inbox:delete',
    module: 'crm',
    description: 'Disconnect or remove connected mailboxes',
  },
  {
    name: 'leads:move_pipeline',
    module: 'crm',
    description: 'Move leads between pipelines (board drag & bulk move)',
  },
  { name: 'legal:read', module: 'crm', description: 'View legal cases' },
  {
    name: 'legal:write',
    module: 'crm',
    description: 'Create and edit legal cases',
  },
  { name: 'legal:delete', module: 'crm', description: 'Remove legal cases' },
  {
    name: 'legal:move_pipeline',
    module: 'crm',
    description: 'Move legal cases between pipelines and update stage',
  },
];

@Injectable()
export class CRMUsersService implements OnModuleInit {
  private readonly logger = new Logger(CRMUsersService.name);

  constructor(
    @InjectModel(CRMUser.name, 'crmConnection')
    private userModel: Model<CRMUserDocument>,
    @InjectModel(Role.name, 'crmConnection')
    private roleModel: Model<RoleDocument>,
    @InjectModel(Permission.name, 'crmConnection')
    private permissionModel: Model<PermissionDocument>,
    @InjectModel(User.name)
    private hrmsUserModel: Model<UserDocument>,
    private trashService: TrashService,
    private readonly twoBighaAgentService: TwoBighaAgentService,
    private readonly kommunoAgentService: KommunoAgentService,
  ) {}

  async onModuleInit() {
    for (const p of CANONICAL_CRM_PERMISSIONS) {
      try {
        await this.permissionModel.updateOne(
          { name: p.name },
          {
            $setOnInsert: {
              name: p.name,
              module: p.module,
              description: p.description,
            },
          },
          { upsert: true },
        );
      } catch (e) {
        this.logger.warn(`Could not upsert permission ${p.name}: ${e}`);
      }
    }
  }

  async findOne(email: string): Promise<CRMUserDocument | undefined> {
    if (!email) return undefined;
    // Use direct lookup or lowercase to avoid regex injection/crash issues (e.g. with '+')
    const user = await this.userModel
      .findOne({
        email: {
          $regex: new RegExp(
            `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        },
      })
      .populate({
        path: 'roleId',
        populate: { path: 'permissions' },
      })
      .exec();
    return user || undefined;
  }

  async findById(id: string): Promise<CRMUserDocument | undefined> {
    if (!Types.ObjectId.isValid(id)) return undefined;
    const user = await this.userModel
      .findById(id)
      .populate({
        path: 'roleId',
        populate: { path: 'permissions' },
      })
      .exec();
    return user || undefined;
  }

  async findAll(): Promise<CRMUserDocument[]> {
    return this.userModel
      .find({ isActive: { $ne: false } })
      .populate('roleId')
      .exec();
  }

  async findAllWithCrmPortalAccess(): Promise<
    Array<{
      _id: string;
      firstName: string;
      lastName: string;
      email?: string;
    }>
  > {
    const managementRoleList = Array.from(CRM_PORTAL_MANAGEMENT_ROLES);
    const users = await this.hrmsUserModel
      .find({
        isActive: { $ne: false },
        $or: [
          { role: { $in: managementRoleList.map((r) => new RegExp(`^${r}$`, 'i')) } },
          { permittedTools: 'CRM' },
          { 'crmPermissions.0': { $exists: true } },
        ],
      })
      .select('firstName lastName email')
      .lean()
      .exec();
    return users.map((u) => ({
      _id: String(u._id),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email,
    }));
  }


  /** Standalone CRM: optional CRM_ALLOWED_EMAIL_DOMAIN (e.g. @acme.com). Empty = any email. */
  private assertEmailAllowed(email?: string) {
    if (!email) return;
    const domain = (process.env.CRM_ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
    if (!domain) return;
    const needle = domain.startsWith('@') ? domain : `@${domain}`;
    if (!email.toLowerCase().endsWith(needle)) {
      throw new BadRequestException(
        `Only ${needle} email addresses are allowed.`,
      );
    }
  }

  async create(createUserDto: any): Promise<CRMUserDocument> {
    this.assertEmailAllowed(createUserDto.email);
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const createdUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });
    await createdUser.save();

    // Sync this agent to 2bigha (createAdmin) — never throws; a 2bigha
    // outage or missing role-id config must not block creating the CRM
    // user locally, the sync status is stored instead.
    const syncResult = await this.twoBighaAgentService.syncAgentCreate({
      _id: String(createdUser._id),
      email: createdUser.email,
      firstName: createdUser.firstName,
      lastName: createdUser.lastName,
    });
    createdUser.twobighaAdminId = syncResult.twobighaAdminId ?? createdUser.twobighaAdminId;
    createdUser.twobighaSyncStatus = syncResult.status;
    createdUser.twobighaSyncError =
      syncResult.status === 'failed' || syncResult.status === 'skipped' ? syncResult.error : undefined;
    createdUser.twobighaSyncedAt = syncResult.syncedAt;
    await createdUser.save();

    // Sync this agent to Kommuno — never throws; integration issues must not block user creation
    const kommunoResult = await this.kommunoAgentService.syncAgentCreate(createdUser);
    createdUser.kommunoAgentId = kommunoResult.kommunoAgentId ?? createdUser.kommunoAgentId;
    createdUser.kommunoSyncStatus = kommunoResult.status;
    createdUser.kommunoSyncError =
      kommunoResult.status === 'failed' || kommunoResult.status === 'skipped' ? kommunoResult.error : undefined;
    createdUser.kommunoSyncedAt = kommunoResult.syncedAt;
    await createdUser.save();

    return createdUser;
  }

  async update(
    id: string,
    updateUserDto: any,
  ): Promise<CRMUserDocument | null> {
    if (updateUserDto.email) {
      this.assertEmailAllowed(updateUserDto.email);
    }
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const bypassSync = !!updateUserDto.bypassKommunoSync;
    delete updateUserDto.bypassKommunoSync;

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();

    if (updatedUser) {
      if (bypassSync) {
        if (updatedUser.kommunoAgentId) {
          updatedUser.kommunoSyncStatus = 'synced';
          updatedUser.kommunoSyncError = undefined;
          updatedUser.kommunoSyncedAt = new Date();
          await updatedUser.save();
        } else {
          updatedUser.kommunoSyncStatus = 'not_synced';
          updatedUser.kommunoSyncError = undefined;
          await updatedUser.save();
        }
      } else {
        const syncResult = await this.kommunoAgentService.syncAgentUpdate(updatedUser);
        updatedUser.kommunoAgentId = syncResult.kommunoAgentId ?? updatedUser.kommunoAgentId;
        updatedUser.kommunoSyncStatus = syncResult.status;
        updatedUser.kommunoSyncError =
          syncResult.status === 'failed' || syncResult.status === 'skipped' ? syncResult.error : undefined;
        updatedUser.kommunoSyncedAt = syncResult.syncedAt;
        await updatedUser.save();
      }
    }

    return updatedUser;
  }

  async delete(id: string): Promise<any> {
    const user = await this.userModel.findById(id).exec();
    if (user && isPlatformSuperAdminEmail(user.email)) {
      throw new ForbiddenException(
        'The platform super-admin account cannot be deleted.',
      );
    }
    if (user) {
      await this.trashService.moveToTrash(
        id,
        'CRMUser',
        user.toObject(),
        'Admin',
      );
      if (user.kommunoAgentId) {
        void this.kommunoAgentService.syncAgentDelete(user.kommunoAgentId);
      }
    }
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async removeByEmail(email: string): Promise<void> {
    if (isPlatformSuperAdminEmail(email)) return;
    await this.userModel
      .deleteMany({
        email: {
          $regex: new RegExp(
            `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        },
      })
      .exec();
  }

  // Role Methods
  async findAllRoles(): Promise<RoleDocument[]> {
    return this.roleModel.find().populate('permissions').exec();
  }

  async findRoleById(id: string): Promise<RoleDocument | null> {
    return this.roleModel.findById(id).populate('permissions').exec();
  }

  async updateRole(id: string, roleDto: any): Promise<RoleDocument | null> {
    return this.roleModel.findByIdAndUpdate(id, roleDto, { new: true }).exec();
  }

  async deleteRole(id: string): Promise<any> {
    return this.roleModel.findByIdAndDelete(id).exec();
  }

  async createRole(roleDto: any): Promise<RoleDocument> {
    return new this.roleModel(roleDto).save();
  }

  async inviteUser(email: string, roleId: string): Promise<CRMUserDocument> {
    this.assertEmailAllowed(email);

    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const inviteToken = Math.random().toString(36).substring(2, 15);
    const inviteExpiry = new Date();
    inviteExpiry.setHours(inviteExpiry.getHours() + 48);

    const newUser = new this.userModel({
      email,
      roleId,
      isActive: false,
      inviteToken,
      inviteExpiry,
      password: await bcrypt.hash(Math.random().toString(36), 10),
    });

    return newUser.save();
  }

  // Permission Methods
  async findAllPermissions(): Promise<PermissionDocument[]> {
    return this.permissionModel.find().exec();
  }

  async createPermission(permissionDto: any): Promise<PermissionDocument> {
    return new this.permissionModel(permissionDto).save();
  }

  async createFromMicrosoft(dto: {
    email: string;
    firstName: string;
    lastName: string;
    azureId: string;
    password: string;
    roleId?: any;
    isActive: boolean;
    role: string;
  }): Promise<CRMUserDocument> {
    const createdUser = new this.userModel({
      ...dto,
      authProvider: 'microsoft',
    });
    return createdUser.save();
  }

  async syncWithEmployee(employee: any): Promise<void> {
    let role = await this.roleModel.findOne({ name: 'Sales Rep' }).exec();
    if (!role) {
      role = await this.roleModel.findOne().exec();
    }

    await this.userModel
      .findOneAndUpdate(
        { email: employee.email },
        {
          $set: {
            firstName: employee.firstName,
            lastName: employee.lastName,
            isActive: employee.status === 'Active',
            role: 'Sales Rep',
            roleId: role?._id,
            assignedLeadsPipeline: employee.assignedLeadsPipeline,
          },
          $setOnInsert: {
            email: employee.email,
            password: await bcrypt.hash('2Bigha@2026', 10),
            authProvider: 'local',
            _id: employee._id,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async syncAgentToKommuno(id: string): Promise<CRMUserDocument | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new BadRequestException('User not found');

    const syncResult = await this.kommunoAgentService.syncAgentUpdate(user);
    user.kommunoAgentId = syncResult.kommunoAgentId ?? user.kommunoAgentId;
    user.kommunoSyncStatus = syncResult.status;
    user.kommunoSyncError =
      syncResult.status === 'failed' || syncResult.status === 'skipped' ? syncResult.error : undefined;
    user.kommunoSyncedAt = syncResult.syncedAt;
    return user.save();
  }
}
