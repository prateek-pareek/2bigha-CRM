import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { applyPlatformSuperAdminPrivileges } from './platform-super-admin.util';
import { sanitizeUser } from './sanitize-user.util';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Request() req: any, @Body() loginDto: LoginDto) {
    return this.authService.login(req.user);
  }

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: any) {
    const user = await this.usersService.findOne(req.user._id);
    if (!user) return null;
    const ensured = await this.usersService.ensurePlatformSuperAdminRecord(user);
    const enriched =
      await this.authService.enrichUserWithCrmRolePermissions(ensured);
    return sanitizeUser(applyPlatformSuperAdminPrivileges(enriched));
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: any) {
    const user = await this.usersService.findOne(req.user._id);
    return this.authService.login(user);
  }

  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftLogin() {
    // Guard redirects to Microsoft login page
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftCallback(@Request() req: any, @Res() res: Response) {
    const result = await this.authService.login(req.user);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // Use standard redirect for both
    return res.redirect(
      `${frontendUrl}/auth/callback?token=${result.access_token}&user=${encodeURIComponent(JSON.stringify(result.user))}`,
    );
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // Guard redirects to Google login page
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Request() req: any, @Res() res: Response) {
    const result = await this.authService.login(req.user);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    return res.redirect(
      `${frontendUrl}/auth/callback?token=${result.access_token}&user=${encodeURIComponent(JSON.stringify(result.user))}`,
    );
  }
}
