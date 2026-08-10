import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Redirect,
  BadRequestException,
  Logger,
  Request as ReqDecorator,
} from '@nestjs/common';
import { PostmasterService } from './postmaster.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { Request } from 'express';
import { Public } from '../../auth/public.decorator';

@Controller('crm/postmaster')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PostmasterController {
  private readonly logger = new Logger(PostmasterController.name);

  constructor(private readonly postmasterService: PostmasterService) {}

  @Get('oauth/authorize')
  @Permissions('settings:write')
  async authorize(@ReqDecorator() req: Request) {
    const user = (req as any).user || {};
    const uid = user.sub || user.id;
    if (!uid) {
      throw new BadRequestException('User ID not found');
    }

    const state = this.postmasterService.signPostmasterState(uid);
    const authorizeUrl = this.postmasterService.buildGoogleAuthorizeUrl(state);
    return { authorizeUrl };
  }

  @Get('oauth/callback')
  @Public()
  @Redirect()
  async callback(@Query('code') code?: string, @Query('state') state?: string) {
    if (!code || !state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    try {
      const verified = this.postmasterService.verifyPostmasterState(state);
      const tokens = await this.postmasterService.exchangeGoogleCode(code);

      if (!tokens.refresh_token) {
        throw new BadRequestException(
          'Google did not return a refresh token. Revoke access and try again with consent prompts.',
        );
      }

      const { email } = await this.postmasterService.fetchGoogleProfile(
        tokens.access_token,
      );
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await this.postmasterService.saveOAuthTokens({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: expiresAt,
        connectedEmail: email,
      });

      const redirectUrl = this.postmasterService.redirectAfterOAuth(true);
      return { url: redirectUrl };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      const redirectUrl = this.postmasterService.redirectAfterOAuth(
        false,
        errorMsg,
      );
      return { url: redirectUrl };
    }
  }

  @Get('config')
  @Permissions('settings:write')
  async getConfig() {
    const config = await this.postmasterService.getConfig();
    if (!config) {
      return {
        isActive: false,
        hasRefreshToken: false,
        monitoredDomains: [],
      };
    }

    const configData = config.config || {};
    return {
      isActive: config.isActive,
      hasRefreshToken: !!configData.refreshToken,
      connectedEmail: configData.connectedEmail,
      monitoredDomains: configData.monitoredDomains || [],
      accessTokenExpiresAt: configData.accessTokenExpiresAt,
    };
  }

  @Put('config/domains')
  @Permissions('settings:write')
  async updateDomains(
    @Body('domains') domainsStr: string,
  ) {
    if (!domainsStr) {
      throw new BadRequestException('domains is required');
    }

    const domains = domainsStr
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d);

    await this.postmasterService.updateDomains(domains);
    return { success: true, domainsCount: domains.length };
  }

  @Delete('config')
  @Permissions('settings:write')
  async disconnect() {
    await this.postmasterService.disconnect();
    return { success: true };
  }

  @Post('sync')
  @Permissions('settings:write')
  async triggerSync() {
    await this.postmasterService.syncAllDomains();
    return { success: true, message: 'Sync completed' };
  }

  @Get('domains')
  @Permissions('settings:read')
  async listDomains() {
    const domains = await this.postmasterService.listDomains();
    return { domains };
  }

  @Get('domains/:domain/latest')
  @Permissions('dashboard:read')
  async getLatest(@Param('domain') domain: string) {
    const snapshot = await this.postmasterService.getLatestSnapshot(domain);
    return snapshot || null;
  }

  @Get('domains/:domain/snapshots')
  @Permissions('dashboard:read')
  async getSnapshots(
    @Param('domain') domain: string,
    @Query('days') days: string = '30',
  ) {
    const daysNum = parseInt(days, 10) || 30;
    const snapshots = await this.postmasterService.getSnapshotHistory(
      domain,
      daysNum,
    );
    return { domain, snapshots, daysRequested: daysNum };
  }
}
