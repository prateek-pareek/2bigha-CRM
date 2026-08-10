import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { applyPlatformSuperAdminPrivileges } from './platform-super-admin.util';
import { getEffectiveHrmsPermissions } from './hrms-permissions.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'supersecret',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    const userDoc = user as any;

    // Check if token version matches the one in DB (forces logout on password change)
    if (payload.version !== userDoc.tokenVersion) {
      throw new UnauthorizedException(
        'Session expired due to security changes. Please log in again.',
      );
    }

    return applyPlatformSuperAdminPrivileges({
      _id: userDoc._id.toString(),
      userId: userDoc._id.toString(),
      id: userDoc._id.toString(),
      email: userDoc.email,
      firstName: userDoc.firstName,
      lastName: userDoc.lastName,
      fullName:
        [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ').trim() ||
        userDoc.email?.split('@')[0] ||
        '',
      role: userDoc.role,
      roleId: userDoc.roleId || null,
      useRoleOverrides: userDoc.useRoleOverrides !== false,
      permittedTools: userDoc.permittedTools || [],
      permissions: getEffectiveHrmsPermissions(userDoc),
      crmPermissions: userDoc.crmPermissions || [],
      pmProjects: userDoc.pmProjects || [],
      projectAccess: [],
      pmSpaces: userDoc.pmSpaces || [],
      pmPermissions: userDoc.pmPermissions || [],
      salesWorkspaceAccessibleEmployees: userDoc.salesWorkspaceAccessibleEmployees || [],
      accessVersion: userDoc.accessVersion || 0,
      version: userDoc.tokenVersion || 0,
    });
  }
}
