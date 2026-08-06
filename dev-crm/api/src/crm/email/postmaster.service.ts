import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { google, gmailpostmastertools_v1 } from 'googleapis';
import * as crypto from 'crypto';
import { PostmasterDomainSnapshot, PostmasterDomainSnapshotDocument } from '../schemas/postmaster-domain-snapshot.schema';

const STATE_TTL_MS = 15 * 60 * 1000;

interface IntegrationDocument extends Document {
  name: string;
  type: string;
  module: string;
  config: Record<string, any>;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PostmasterConfig {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt?: Date;
  connectedEmail: string;
  monitoredDomains: string[];
}

@Injectable()
export class PostmasterService {
  private readonly logger = new Logger(PostmasterService.name);

  constructor(
    @InjectModel('Integration', 'crmConnection')
    private readonly integrationModel: Model<IntegrationDocument>,
    @InjectModel(PostmasterDomainSnapshot.name, 'crmConnection')
    private readonly snapshotModel: Model<PostmasterDomainSnapshotDocument>,
    private readonly configService: ConfigService,
  ) {}

  private getSecret(): string {
    return this.configService.get<string>('JWT_SECRET') || 'supersecret';
  }

  private getApiPublicBase(): string {
    const raw =
      this.configService.get<string>('CRM_OAUTH_PUBLIC_URL') ||
      this.configService.get<string>('PUBLIC_API_URL') ||
      this.configService.get<string>('TRACKING_BASE_URL') ||
      this.configService.get<string>('API_URL') ||
      this.configService.get<string>('NEXT_PUBLIC_API_URL') ||
      'http://localhost:4000';
    let base = String(raw).trim().replace(/\/$/, '');
    if (/\/api$/i.test(base)) {
      base = base.replace(/\/api$/i, '');
    }
    return base;
  }

  private getPortalBase(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private getGoogleClientId(): string | undefined {
    return (
      this.configService.get<string>('CRM_INBOX_GOOGLE_CLIENT_ID') ||
      this.configService.get<string>('GOOGLE_CLIENT_ID')
    );
  }

  private getGoogleClientSecret(): string | undefined {
    return (
      this.configService.get<string>('CRM_INBOX_GOOGLE_CLIENT_SECRET') ||
      this.configService.get<string>('GOOGLE_CLIENT_SECRET')
    );
  }

  getRedirectUri(): string {
    const base = this.getApiPublicBase();
    return `${base}/api/crm/postmaster/oauth/callback`;
  }

  signPostmasterState(userId: string, options?: { returnTo?: string }): string {
    const payload = Buffer.from(
      JSON.stringify({
        userId,
        provider: 'postmaster',
        returnTo: options?.returnTo,
        exp: Date.now() + STATE_TTL_MS,
      }),
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  }

  verifyPostmasterState(token: string): {
    userId: string;
    provider: string;
    returnTo?: string;
  } {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) {
      throw new BadRequestException('Invalid OAuth state');
    }
    const expected = crypto
      .createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
    if (expected !== sig) {
      throw new BadRequestException('Invalid OAuth state signature');
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId: string;
      provider: string;
      returnTo?: string;
      exp: number;
    };
    if (data.exp < Date.now()) {
      throw new BadRequestException(
        'OAuth state expired; try connecting again',
      );
    }
    return {
      userId: data.userId,
      provider: data.provider,
      returnTo: data.returnTo,
    };
  }

  buildGoogleAuthorizeUrl(state: string): string {
    const clientId = this.getGoogleClientId();
    if (!clientId) {
      throw new BadRequestException(
        'Google OAuth is not configured (set CRM_INBOX_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID)',
      );
    }
    const redirectUri = this.getRedirectUri();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/postmaster.readonly',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeGoogleCode(code: string): Promise<{
    refresh_token?: string;
    access_token: string;
    expires_in: number;
  }> {
    const clientId = this.getGoogleClientId();
    const clientSecret = this.getGoogleClientSecret();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Google OAuth credentials are not configured',
      );
    }
    const redirectUri = this.getRedirectUri();
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(
        `Google token exchange failed: ${JSON.stringify(json)}`,
      );
      throw new BadRequestException(
        (json.error_description as string) || 'Google token exchange failed',
      );
    }
    return {
      refresh_token: json.refresh_token as string | undefined,
      access_token: json.access_token as string,
      expires_in: (json.expires_in as number) || 3600,
    };
  }

  async fetchGoogleProfile(
    accessToken: string,
  ): Promise<{ email: string; name?: string }> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as { email?: string; name?: string };
    if (!res.ok || !json.email) {
      throw new BadRequestException('Could not read Google account info');
    }
    return { email: json.email, name: json.name };
  }

  async getConfig(): Promise<IntegrationDocument | null> {
    return (await this.integrationModel
      .findOne({ type: 'google_postmaster' })
      .exec()) as IntegrationDocument | null;
  }

  async saveOAuthTokens(data: {
    refreshToken: string;
    accessToken: string;
    accessTokenExpiresAt: Date;
    connectedEmail: string;
    monitoredDomains?: string[];
  }): Promise<IntegrationDocument> {
    return (await this.integrationModel
      .findOneAndUpdate(
        { type: 'google_postmaster' },
        {
          type: 'google_postmaster',
          name: 'Google Postmaster Tools',
          module: 'all',
          isActive: true,
          config: {
            refreshToken: data.refreshToken,
            accessToken: data.accessToken,
            accessTokenExpiresAt: data.accessTokenExpiresAt,
            connectedEmail: data.connectedEmail,
            monitoredDomains: data.monitoredDomains || [],
          },
        },
        { upsert: true, new: true },
      )
      .exec()) as IntegrationDocument;
  }

  async updateDomains(domains: string[]): Promise<IntegrationDocument> {
    const config = await this.getConfig();
    if (!config) {
      throw new BadRequestException(
        'Postmaster Tools not connected. Please connect first.',
      );
    }
    return (await this.integrationModel
      .findByIdAndUpdate(
        config._id,
        { 'config.monitoredDomains': domains },
        { new: true },
      )
      .exec()) as IntegrationDocument;
  }

  async disconnect(): Promise<void> {
    await (this.integrationModel.deleteOne({ type: 'google_postmaster' }).exec() as Promise<any>);
  }

  async getValidAccessToken(): Promise<string> {
    const config = await this.getConfig();
    if (!config) {
      throw new BadRequestException('Postmaster Tools not connected');
    }

    const configData = config.config as PostmasterConfig;
    const { accessToken, accessTokenExpiresAt, refreshToken } = configData;

    // 2-minute buffer — refresh if expiring soon
    if (
      accessTokenExpiresAt &&
      new Date(accessTokenExpiresAt).getTime() > Date.now() + 120_000
    ) {
      return accessToken;
    }

    // Refresh token
    const clientId = this.getGoogleClientId();
    const clientSecret = this.getGoogleClientSecret();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Google OAuth credentials not configured',
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.error(`Token refresh failed: ${JSON.stringify(json)}`);
      throw new BadRequestException('Failed to refresh access token');
    }

    // Write back new token
    const newExpiresAt = new Date(Date.now() + ((json.expires_in as number) || 3600) * 1000);
    await (this.integrationModel
      .findByIdAndUpdate(config._id, {
        'config.accessToken': json.access_token,
        'config.accessTokenExpiresAt': newExpiresAt,
      })
      .exec() as Promise<any>);

    return json.access_token as string;
  }

  private async buildClient(): Promise<gmailpostmastertools_v1.Gmailpostmastertools> {
    const accessToken = await this.getValidAccessToken();
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmailpostmastertools({ version: 'v1', auth });
  }

  async listDomains(): Promise<string[]> {
    try {
      const client = await this.buildClient();
      const response = await client.domains.list({});
      const domains = response.data.domains || [];
      return domains
        .map((d: any) => {
          const name = d.name || '';
          return name.replace(/^domains\//, '');
        })
        .filter((d: string) => d && !d.includes('/'));
    } catch (error) {
      this.logger.error('Error listing Postmaster domains:', error);
      if ((error as any).status === 403) {
        throw new HttpException(
          'Access denied to Postmaster Tools. Ensure the connected account has access.',
          HttpStatus.FORBIDDEN,
        );
      }
      throw error;
    }
  }

  async fetchAndCacheStats(
    domain: string,
    date: string,
  ): Promise<PostmasterDomainSnapshotDocument | null> {
    try {
      const client = await this.buildClient();
      const resourceName = `domains/${domain}/trafficStats/${date}`;

      const response = await client.domains.trafficStats.get({
        name: resourceName,
      });

      const stats = response.data;
      if (!stats) {
        this.logger.debug(
          `No Postmaster data for domain=${domain}, date=${date}`,
        );
        return null;
      }

      const snapshot = (await this.snapshotModel.findOneAndUpdate(
        { domain, date },
        {
          domain,
          date,
          domainReputation: stats.domainReputation,
          userReportedSpamRatio: stats.userReportedSpamRatio || 0,
          spfSuccessRatio: stats.spfSuccessRatio || 0,
          dkimSuccessRatio: stats.dkimSuccessRatio || 0,
          dmarcSuccessRatio: stats.dmarcSuccessRatio || 0,
          inboundEncryptionRatio: stats.inboundEncryptionRatio || 0,
          outboundEncryptionRatio: stats.outboundEncryptionRatio || 0,
          ipReputations: stats.ipReputations || [],
          deliveryErrors: stats.deliveryErrors || [],
          rawResponse: stats,
        },
        { upsert: true, new: true },
      )) as PostmasterDomainSnapshotDocument;

      return snapshot;
    } catch (error: any) {
      if (error.status === 404) {
        this.logger.debug(
          `No data for domain=${domain}, date=${date} (404 is normal for low-volume days)`,
        );
        return null;
      }
      this.logger.error(
        `Error fetching Postmaster stats for ${domain}/${date}:`,
        error,
      );
      throw error;
    }
  }

  async syncDomainStats(domain: string, days: number = 7): Promise<void> {
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
      try {
        await this.fetchAndCacheStats(domain, dateStr);
      } catch (error) {
        this.logger.warn(
          `Failed to sync ${domain}/${dateStr}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async syncAllDomains(): Promise<void> {
    const config = await this.getConfig();
    if (!config?.isActive) {
      this.logger.debug('Postmaster Tools not active, skipping sync');
      return;
    }

    const domains = (config.config as PostmasterConfig).monitoredDomains || [];
    if (domains.length === 0) {
      this.logger.debug('No monitored domains configured, skipping sync');
      return;
    }

    for (const domain of domains) {
      try {
        await this.syncDomainStats(domain, 7);
      } catch (error) {
        this.logger.error(
          `Failed to sync domain ${domain}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async getLatestSnapshot(
    domain: string,
  ): Promise<PostmasterDomainSnapshotDocument | null> {
    return (await this.snapshotModel
      .findOne({ domain })
      .sort({ date: -1 })
      .exec()) as PostmasterDomainSnapshotDocument | null;
  }

  async getSnapshotHistory(
    domain: string,
    days: number = 30,
  ): Promise<PostmasterDomainSnapshotDocument[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return (await this.snapshotModel
      .find({ domain, createdAt: { $gte: cutoffDate } })
      .sort({ date: -1 })
      .exec()) as PostmasterDomainSnapshotDocument[];
  }

  redirectAfterOAuth(
    success: boolean,
    errorMessage?: string,
  ): string {
    const base = this.getPortalBase();
    const params = new URLSearchParams();
    params.set('postmaster_oauth', success ? 'success' : 'error');
    if (!success && errorMessage) {
      params.set('reason', errorMessage.slice(0, 500));
    }
    return `${base}/crm/settings/integrations/postmaster?${params.toString()}`;
  }
}
