import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { CRMUsersService } from './crm-users.service';
import {
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from '../shared/crm-admin-access.util';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: CRMUsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user) {
      return false;
    }

    // Fetch CRM user profile (permissions, role) — also used for admin bypass + crmDbUser on request
    let dbUser = (await this.usersService.findOne(user.email)) as any;

    if (!dbUser) {
      console.log(`RbacGuard: Auto-creating stub CRM user for ${user.email}`);
      try {
        dbUser = (await this.usersService.create({
          email: user.email,
          firstName: user.firstName || user.name?.split(' ')[0] || 'User',
          lastName: user.lastName || user.name?.split(' ')[1] || '',
          role: user.role,
          isActive: true,
          password: Math.random().toString(36) + 'Aa1!',
        })) as any;
      } catch (e) {
        // If creation failed due to duplicate key, try to find the user one last time
        if (e.code === 11000 || e.message?.includes('duplicate key')) {
          dbUser = await this.usersService.findOne(user.email);
          if (!dbUser) {
            throw new ForbiddenException(
              'User creation failed due to conflict and lookup failed',
            );
          }
        } else {
          console.error('RbacGuard: Failed to auto-create user', e);
          throw new ForbiddenException(
            'User is not found in local DB and auto-creation failed',
          );
        }
      }
    }

    if (!dbUser?.isActive) {
      console.log(`RbacGuard: User ${user.email} is inactive`);
      throw new ForbiddenException('User is inactive');
    }

    request.crmDbUser = dbUser;
    if (request.user) {
      request.user.crmDbUser = dbUser;
    }

    if (hasCrmAdminJwtBypass(user) || hasCrmAdminFromDbUser(dbUser)) {
      return true;
    }

    // Get permissions from both Token and DB (support name or key on populated Permission docs)
    const userRole = dbUser.roleId as any;
    const dbRolePermissions =
      userRole?.permissions
        ?.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
        .filter(Boolean) || [];
    const dbDirectPermissions = dbUser.permissions || [];

    const jwtCrm = Array.isArray(user.crmPermissions)
      ? user.crmPermissions
      : [];
    const jwtHrms = Array.isArray(user.permissions) ? user.permissions : [];
    const tokenPermissions = [...jwtHrms, ...jwtCrm];

    // Merge and unique
    const userPermissions = Array.from(
      new Set([
        ...dbRolePermissions,
        ...tokenPermissions,
        ...dbDirectPermissions,
      ]),
    );

    const hasPermission = requiredPermissions.some((permission) => {
      if (userPermissions.includes(permission)) return true;
      const [prefix, action] = permission.split(':');
      if (!action) return false;
      // Legacy: bare module token (e.g. "leads") only grants read, never write/delete
      if (action === 'read' && userPermissions.includes(prefix)) return true;
      return false;
    });

    if (!hasPermission) {
      console.log('RbacGuard: Insufficient permissions');
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
