import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import {
  isPlatformSuperAdminEmail,
  PLATFORM_SUPER_ADMIN_DEFAULTS,
} from './platform-super-admin.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      clientID:
        configService.get<string>('GOOGLE_CLIENT_ID') || 'dummy-client-id',
      clientSecret:
        configService.get<string>('GOOGLE_CLIENT_SECRET') ||
        'dummy-client-secret',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    const email = profile.emails?.[0]?.value || '';

    const lower = email.toLowerCase();
    const allowedGoogleLogin =
      lower.endsWith('@mathionix.com') || lower.endsWith('@gmail.com');
    if (email && !allowedGoogleLogin) {
      throw new UnauthorizedException(
        'Access denied. Only @mathionix.com or @gmail.com Google accounts are allowed.',
      );
    }

    // Try to find the user in our DB
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Check if this is the first user ever
      const usersCount = await this.usersService.countAll();
      const isFirstUser = usersCount === 0;

      const firstName =
        profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
      const lastName =
        profile.name?.familyName ||
        profile.displayName?.split(' ').slice(1).join(' ') ||
        '';

      const isSuperAdmin = isPlatformSuperAdminEmail(email);
      user = await this.usersService.create({
        email,
        firstName,
        lastName,
        password: Math.random().toString(36).slice(-12),
        role: isSuperAdmin || isFirstUser ? 'Admin' : 'Employee',
        permissions: isSuperAdmin ? [...PLATFORM_SUPER_ADMIN_DEFAULTS.permissions] : undefined,
        permittedTools: isSuperAdmin
          ? [...PLATFORM_SUPER_ADMIN_DEFAULTS.permittedTools]
          : ['CRM'],
      });
    }

    if (user) {
      user = await this.usersService.ensurePlatformSuperAdminRecord(user);
    }

    return user;
  }
}
