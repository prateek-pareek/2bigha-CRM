import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole, UserRoleDocument } from './schemas/user-role.schema';
import { CRMUser, CRMUserDocument } from '../crm-users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { NotificationsService } from '../notifications/notifications.service';
import { TrashService } from '../trash/trash.service';
import {
  isPlatformSuperAdminEmail,
  PLATFORM_SUPER_ADMIN_DEFAULTS,
} from '../auth/platform-super-admin.util';

const ADMIN_ROLES = ['ADMIN', 'CEO', 'CTO', 'MANAGER', 'EXECUTIVE', 'SENIOR MEMBER', 'ADMINISTRATOR', 'SUPERADMIN', 'SUPER_ADMIN', 'OWNER'];

const DEFAULT_EMPLOYEE_PERMISSIONS = [
  'leaves:read', 'leaves:create', 'leaves:edit',
  'announcements:read',
  'holidays:read',
  'timesheets:read',
  'expenses:read',
  'sops:read',
];

function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(String(role || '').toUpperCase().trim());
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRoleDocument>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private crmUserModel: Model<CRMUserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly trashService: TrashService,
  ) {}

  private async applyRoleTemplateToUserData(updateData: any): Promise<void> {
    const roleId = updateData?.roleId;
    const useRoleOverrides =
      updateData?.useRoleOverrides !== undefined
        ? !!updateData.useRoleOverrides
        : true;
    if (!roleId || useRoleOverrides) return;
    const roleDoc = await this.userRoleModel.findById(roleId).lean().exec();
    if (!roleDoc || roleDoc.isActive === false) return;
    updateData.permissions = Array.isArray(roleDoc.permissions)
      ? roleDoc.permissions
      : [];
    updateData.crmPermissions = Array.isArray(roleDoc.crmPermissions)
      ? roleDoc.crmPermissions
      : [];
    updateData.pmPermissions = Array.isArray(roleDoc.pmPermissions)
      ? roleDoc.pmPermissions
      : [];
    updateData.permittedTools = Array.isArray(roleDoc.permittedTools)
      ? roleDoc.permittedTools
      : [];
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    // Apply default permissions for non-admin employees if none provided
    const incomingPerms: string[] = (createUserDto as any).permissions || [];
    const role = (createUserDto as any).role || '';
    const defaultPerms = !isAdminRole(role) && incomingPerms.length === 0
      ? DEFAULT_EMPLOYEE_PERMISSIONS
      : incomingPerms;

    const createData: any = {
      ...createUserDto,
      password: hashedPassword,
      permissions: defaultPerms,
      useRoleOverrides:
        (createUserDto as any).useRoleOverrides !== undefined
          ? !!(createUserDto as any).useRoleOverrides
          : true,
    };
    await this.applyRoleTemplateToUserData(createData);
    const createdUser = new this.userModel(createData);
    const saved = await createdUser.save();

    // Notify about new account
    try {
      // Sync user counterpart in CRM DB using email-based upsert
      try {
        const crmUserData = {
          email: saved.email,
          firstName: saved.firstName,
          lastName: saved.lastName,
          role: saved.role || 'user',
          password: saved.password,
          isActive: true,
          permissions: [],
        };
        await this.crmUserModel
          .findOneAndUpdate(
            { email: saved.email },
            {
              $set: crmUserData,
              $setOnInsert: { _id: saved._id },
            },
            { upsert: true, new: true },
          )
          .exec();
        this.logger.log(`Synced counterpart CRM user for ${saved.email}`);
      } catch (crmSyncErr) {
        this.logger.error('Failed to sync matching CRM user', crmSyncErr);
      }
      await this.notificationsService.create({
        recipient: saved._id.toString(),
        title: 'Account Created',
        message: 'Your Mathionix Suite account has been created successfully.',
        type: 'Info',
      });
      await this.notificationsService.sendInvitationEmail(saved.email, {
        fullName: `${saved.firstName} ${saved.lastName}`,
        email: saved.email,
        loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`,
      });
    } catch (e) {
      this.logger.error('Failed to send welcome notifications', e);
    }

    return saved;
  }

  async countAll(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().populate('roleId').exec();
  }

  async findOne(id: string): Promise<User | null> {
    return this.userModel.findById(id).populate('roleId').exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).populate('roleId').exec();
  }

  /** Keeps ceo@mathionix.com at full super-admin access in the database. */
  async ensurePlatformSuperAdminRecord(user: User): Promise<User> {
    if (!isPlatformSuperAdminEmail(user.email)) return user;

    const userId = String((user as UserDocument & { _id?: unknown })._id || '');
    if (!userId) return user;

    const needsRole =
      String(user.role || '').trim().toLowerCase() !==
      PLATFORM_SUPER_ADMIN_DEFAULTS.role.toLowerCase();
    const needsPerms = !(user.permissions || []).includes('all');
    const tools = new Set(
      (user.permittedTools || []).map((t) => String(t || '').toUpperCase()),
    );
    const needsTools = PLATFORM_SUPER_ADMIN_DEFAULTS.permittedTools.some(
      (t) => !tools.has(t),
    );

    if (!needsRole && !needsPerms && !needsTools) return user;

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          role: PLATFORM_SUPER_ADMIN_DEFAULTS.role,
          permissions: [...PLATFORM_SUPER_ADMIN_DEFAULTS.permissions],
          permittedTools: [...PLATFORM_SUPER_ADMIN_DEFAULTS.permittedTools],
        },
        { new: true },
      )
      .exec();
    return updated || user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User | null> {
    const currentUser = await this.userModel.findById(id).exec();
    if (!currentUser) return null;

    const updateData: any = { ...updateUserDto };
    if (isPlatformSuperAdminEmail(currentUser.email)) {
      updateData.role = PLATFORM_SUPER_ADMIN_DEFAULTS.role;
      updateData.permissions = [...PLATFORM_SUPER_ADMIN_DEFAULTS.permissions];
      updateData.permittedTools = [...PLATFORM_SUPER_ADMIN_DEFAULTS.permittedTools];
    }
    await this.applyRoleTemplateToUserData(updateData);

    // Fix: Only trigger force logout if password is non-empty and changed
    const forceLogoutFields = ['password'];
    const softRefreshFields = [
      'role',
      'permissions',
      'permittedTools',
      'crmPermissions',
      'pmProjects',
      'pmSpaces',
      'pmPermissions',
      'assignedLeadsPipeline',
      'assignedDealsPipeline',
      'accessibleEmailAccounts',
      'salesWorkspaceAccessibleEmployees',
    ];

    const hasPasswordUpdate =
      !!updateUserDto.password && updateUserDto.password.length > 0;
    const requiresForceLogout =
      hasPasswordUpdate &&
      requiresFieldsChanged(currentUser, updateUserDto, forceLogoutFields);
    const requiresSoftRefresh = requiresFieldsChanged(
      currentUser,
      updateUserDto,
      softRefreshFields,
    );

    if (hasPasswordUpdate) {
      const salt = await bcrypt.genSalt();
      updateData.password = await bcrypt.hash(
        updateUserDto.password as string,
        salt,
      );
    } else {
      delete updateData.password;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          ...updateData,
          $inc: {
            tokenVersion: requiresForceLogout ? 1 : 0,
            accessVersion: requiresSoftRefresh ? 1 : 0,
          },
        },
        { new: true },
      )
      .exec();

    // Notify about access changes
    if (requiresSoftRefresh && updatedUser) {
      try {
        const addedTools = (updatedUser.permittedTools || []).filter(
          (t) => !(currentUser.permittedTools || []).includes(t),
        );
        const removedTools = (currentUser.permittedTools || []).filter(
          (t) => !(updatedUser.permittedTools || []).includes(t),
        );

        const now = new Date().toLocaleString();
        if (addedTools.length > 0) {
          const title = 'Access Granted';
          const message = `You have been granted access to [${addedTools.join(', ')}] at ${now}.`;
          await this.notificationsService.create({
            recipient: id,
            title,
            message,
            type: 'Success',
          });
        }

        if (removedTools.length > 0) {
          const title = 'Access Revoked';
          const message = `Your access to [${removedTools.join(', ')}] has been revoked at ${now}.`;
          await this.notificationsService.create({
            recipient: id,
            title,
            message,
            type: 'Warning',
          });
        }

        // Always sync to CRM if role/status/access changed (Staff Profile Edit)
        try {
          await this.crmUserModel.findOneAndUpdate(
            { email: updatedUser.email },
            {
              $set: {
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                role: updatedUser.role || 'user',
                isActive: true,
                permissions: updatedUser.crmPermissions || [],
                accessibleEmailAccounts: updatedUser.accessibleEmailAccounts || [],
              },
              $setOnInsert: {
                _id: updatedUser._id,
                password: updatedUser.password || 'sso_provisioned',
              },
            },
            { upsert: true },
          );
          this.logger.log(`Synced user permissions to CRM database: ${updatedUser.email} (${(updatedUser.crmPermissions || []).length} keys)`);
        } catch (crmSyncError) {
          this.logger.error(
            'Failed to sync user to CRM database',
            crmSyncError,
          );
        }

      } catch (e) {
        this.logger.error('Failed to send access change notification', e);
      }
    }

    // Always sync to CRM on any profile save (unconditional — ensures permissions and email access are always up-to-date)
    if (updatedUser) {
      try {
        await this.crmUserModel.findOneAndUpdate(
          { email: updatedUser.email },
          {
            $set: {
              firstName: updatedUser.firstName,
              lastName: updatedUser.lastName,
              role: updatedUser.role || 'user',
              isActive: true,
              permissions: updatedUser.crmPermissions || [],
              accessibleEmailAccounts: updatedUser.accessibleEmailAccounts || [],
            },
            $setOnInsert: {
              _id: updatedUser._id,
              password: updatedUser.password || 'sso_provisioned',
            },
          },
          { upsert: true },
        );
        this.logger.log(`CRM sync (unconditional): ${updatedUser.email} — CRM permissions: [${(updatedUser.crmPermissions || []).join(', ')}]`);
      } catch (crmSyncError) {
        this.logger.error('Failed to unconditionally sync user to CRM database', crmSyncError);
      }
    }

    return updatedUser;
  }

  async remove(id: string): Promise<User | null> {
    const user = await this.userModel.findById(id).exec();
    if (user && isPlatformSuperAdminEmail(user.email)) {
      throw new ForbiddenException(
        'The platform super-admin account cannot be deleted.',
      );
    }
    if (user) {
      // Move User to Trash
      await this.trashService.moveToTrash(id, 'User', user.toObject(), 'Admin');

      // Also delete from the CRM database
      try {
        await this.crmUserModel.findOneAndDelete({ email: user.email }).exec();
        this.logger.log(`Deleted CRM user record for ${user.email}`);
      } catch (satelliteError) {
        this.logger.error(
          `Failed to delete CRM user record for ${user.email}`,
          satelliteError,
        );
      }
    }
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async syncAllUsersToSatellites(): Promise<{
    synced: number;
    skipped: number;
    errors: number;
  }> {
    const allHrmsUsers = await this.userModel.find({ isActive: true }).exec();
    let synced = 0,
      skipped = 0,
      errors = 0;

    for (const user of allHrmsUsers) {
      try {
        const fullName =
          `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() ||
          user.email.split('@')[0];

        // Sync to CRM
        await this.crmUserModel
          .findOneAndUpdate(
            { email: user.email },
            {
              $set: {
                firstName: (user as any).firstName,
                lastName: (user as any).lastName,
                role: (user as any).role || 'user',
                isActive: true,
              },
              $setOnInsert: {
                _id: user._id,
                email: user.email,
                password: (user as any).password || 'sso_provisioned',
                permissions: [],
              },
            },
            { upsert: true },
          )
          .exec();

        synced++;
        this.logger.log(`Synced CRM user: ${user.email}`);
      } catch (err) {
        errors++;
        this.logger.error(`Failed to sync ${user.email}`, err);
      }
    }

    return { synced, skipped, errors };
  }
}

function requiresFieldsChanged(
  current: any,
  update: any,
  fields: string[],
): boolean {
  return fields.some((field) => {
    if (!(field in update)) return false;
    const oldVal = current[field];
    const newVal = update[field];

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (oldVal.length !== newVal.length) return true;
      return !oldVal.every((v) => newVal.includes(v));
    }

    return oldVal !== newVal;
  });
}
