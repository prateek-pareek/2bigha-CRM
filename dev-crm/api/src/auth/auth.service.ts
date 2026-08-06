import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/schemas/user.schema';
import { CRMUsersService } from '../crm-users/crm-users.service';
import { applyPlatformSuperAdminPrivileges } from './platform-super-admin.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private crmUsersService: CRMUsersService,
  ) {}

  /**
   * Merges CRM app role permissions (Mongo CRM user → role) into crmPermissions so the portal matches RbacGuard.
   */
  async enrichUserWithCrmRolePermissions(user: any): Promise<any> {
    const plain = user?.toObject ? user.toObject() : { ...user };
    if (!plain?.email) return plain;

    let merged = Array.from(
      new Set([
        ...(Array.isArray(plain.crmPermissions) ? plain.crmPermissions : []),
      ]),
    );

    try {
      const crmUser = await this.crmUsersService.findOne(plain.email);
      if (crmUser) {
        const role = crmUser.roleId as any;
        const fromRole =
          role?.permissions
            ?.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
            .filter(Boolean) || [];
        const direct = Array.isArray(crmUser.permissions)
          ? crmUser.permissions
          : [];
        merged = Array.from(new Set([...merged, ...fromRole, ...direct]));
      }
    } catch (e) {
      this.logger.warn(`CRM role merge failed for ${plain.email}: ${e}`);
    }

    return { ...plain, crmPermissions: merged };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password || ''))) {
      this.logger.log(`User validated: ${email}`);

      const ensured = await this.usersService.ensurePlatformSuperAdminRecord(user);
      const userObj = (ensured as any).toObject
        ? (ensured as any).toObject()
        : ensured;

      // Auto-upgrade management permissions if missing
      const managementRoles = [
        'ADMIN',
        'CEO',
        'CTO',
        'MANAGER',
        'EXECUTIVE',
        'SENIOR MEMBER',
        'ADMINISTRATOR',
      ];
      const isAdmin = managementRoles.includes(
        userObj.role?.toUpperCase() || '',
      );
      if (
        isAdmin &&
        (!userObj.permittedTools || userObj.permittedTools.length < 4)
      ) {
        this.logger.log(
          `Auto-upgrading permissions for management user: ${email}`,
        );
        const updated = await this.usersService.update(userObj._id.toString(), {
          permittedTools: ['CRM'],
        } as any);
        if (updated) {
          const freshUserObj = (updated as any).toObject
            ? (updated as any).toObject()
            : updated;
          const { password: _p, ...result } = freshUserObj;
          return result;
        }
      }

      const { password, ...result } = userObj;
      return result;
    }
    this.logger.warn(`Authentication failed for user: ${email}`);
    return null;
  }

  private readonly ADMIN_ROLES = ['ADMIN', 'CEO', 'CTO', 'MANAGER', 'EXECUTIVE', 'SENIOR MEMBER', 'ADMINISTRATOR', 'SUPERADMIN', 'SUPER_ADMIN', 'OWNER'];
  private readonly DEFAULT_EMPLOYEE_PERMISSIONS = [
    'leaves:read', 'leaves:create', 'leaves:edit',
    'announcements:read',
    'holidays:read',
    'timesheets:read',
    'expenses:read',
    'sops:read',
  ];

  async login(user: any) {
    let u = await this.enrichUserWithCrmRolePermissions(user);

    // Ensure default permissions are always present for non-admin employees
    const role = String(u.role || '').toUpperCase().trim();
    const isAdmin = this.ADMIN_ROLES.includes(role);
    if (!isAdmin) {
      const existing: string[] = u.permissions || [];
      const missing = this.DEFAULT_EMPLOYEE_PERMISSIONS.filter(p => !existing.includes(p));
      if (missing.length > 0) {
        u.permissions = [...existing, ...missing];
        await this.usersService.update(u._id.toString(), { permissions: u.permissions } as any);
      }
    }
    const payload = {
      email: u.email,
      sub: u._id.toString(),
      role: u.role,
      roleId: u.roleId || null,
      useRoleOverrides: u.useRoleOverrides !== false,
      version: u.tokenVersion || 0,
      pmProjects: u.pmProjects || [],
      pmSpaces: u.pmSpaces || [],
      pmPermissions: u.pmPermissions || [],
      crmPermissions: u.crmPermissions || [],
      permittedTools: u.permittedTools || [],
      salesWorkspaceAccessibleEmployees: u.salesWorkspaceAccessibleEmployees || [],
      access_version: u.accessVersion || 0,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: applyPlatformSuperAdminPrivileges({
        _id: u._id.toString(),
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        roleId: u.roleId || null,
        useRoleOverrides: u.useRoleOverrides !== false,
        permissions: u.permissions || [],
        permittedTools: u.permittedTools || [],
        crmPermissions: u.crmPermissions || [],
        pmProjects: u.pmProjects || [],
        pmSpaces: u.pmSpaces || [],
        pmPermissions: u.pmPermissions || [],
        salesWorkspaceAccessibleEmployees: u.salesWorkspaceAccessibleEmployees || [],
        accessibleClientPortals: u.accessibleClientPortals || [],
        access_version: u.accessVersion || 0,
        version: u.tokenVersion || 0,
      }),
    };
  }

  async register(createUserDto: any) {
    return this.usersService.create(createUserDto);
  }
}
