import { Injectable, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InboxAccountsService } from './inbox-accounts.service';
import { MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES } from '../shared/microsoft-graph-mail.constants';
import { InboxPushService } from './inbox-push.service';

const STATE_TTL_MS = 15 * 60 * 1000;

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Resolve sign-in address from id_token or access_token JWT (no Graph API — single-resource scopes). */
function resolveMicrosoftSignInEmail(
  accessToken: string,
  idToken?: string,
): string | undefined {
  for (const t of [idToken, accessToken]) {
    if (!t) continue;
    const p = parseJwtPayload(t);
    if (!p) continue;
    const candidates = [
      p.email,
      p.preferred_username,
      p.upn,
      p.unique_name,
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      if (typeof c === 'string' && c.includes('@')) return c;
    }
  }
  return undefined;
}

/** Resolve display name from id_token or access_token JWT. */
export function resolveMicrosoftSignInName(
  accessToken: string,
  idToken?: string,
): string | undefined {
  for (const t of [idToken, accessToken]) {
    if (!t) continue;
    const p = parseJwtPayload(t);
    if (!p) continue;
    if (typeof p.name === 'string' && p.name) return p.name;
  }
  return undefined;
}

@Injectable()
export class InboxOAuthService {
  private readonly logger = new Logger(InboxOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
    @Inject(forwardRef(() => InboxPushService))
    private readonly inboxPushService: InboxPushService,
  ) {}

  private getSecret(): string {
    return this.config.get<string>('JWT_SECRET') || 'supersecret';
  }

  /**
   * Origin where the API is reachable in the browser (OAuth redirects, no /api suffix).
   * Prefer explicit CRM / public URL — do not rely on localhost in production.
   */
  private getApiPublicBase(): string {
    const raw =
      this.config.get<string>('CRM_OAUTH_PUBLIC_URL') ||
      this.config.get<string>('PUBLIC_API_URL') ||
      this.config.get<string>('TRACKING_BASE_URL') ||
      this.config.get<string>('API_URL') ||
      this.config.get<string>('NEXT_PUBLIC_API_URL') ||
      'http://localhost:4000';
    let base = String(raw).trim().replace(/\/$/, '');
    if (/\/api$/i.test(base)) {
      base = base.replace(/\/api$/i, '');
    }
    return base;
  }

  private getPortalBase(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /** Reuse the same Entra app as portal SSO; optional CRM_INBOX_* overrides. */
  private getMicrosoftClientId(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_MICROSOFT_CLIENT_ID') ||
      this.config.get<string>('MICROSOFT_CLIENT_ID')
    );
  }

  private getMicrosoftClientSecret(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_MICROSOFT_CLIENT_SECRET') ||
      this.config.get<string>('MICROSOFT_CLIENT_SECRET')
    );
  }

  /** CRM inbox Gmail; optional CRM_INBOX_* overrides same as portal SSO (GOOGLE_*). */
  private getGoogleClientId(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_GOOGLE_CLIENT_ID') ||
      this.config.get<string>('GOOGLE_CLIENT_ID')
    );
  }

  private getGoogleClientSecret(): string | undefined {
    return (
      this.config.get<string>('CRM_INBOX_GOOGLE_CLIENT_SECRET') ||
      this.config.get<string>('GOOGLE_CLIENT_SECRET')
    );
  }

  getRedirectUris() {
    const base = this.getApiPublicBase();
    return {
      google: `${base}/api/crm/inbox-accounts/oauth/google/callback`,
      microsoft: `${base}/api/crm/inbox-accounts/oauth/microsoft/callback`,
    };
  }

  signOAuthState(
    userId: string,
    provider: 'gmail' | 'outlook',
    options?: { returnTo?: string },
  ): string {
    const payload = Buffer.from(
      JSON.stringify({
        userId,
        provider,
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

  verifyOAuthState(token: string): {
    userId: string;
    provider: 'gmail' | 'outlook';
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
      provider: 'gmail' | 'outlook';
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
        'Gmail OAuth is not configured (set CRM_INBOX_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID)',
      );
    }
    const redirectUri = this.getRedirectUris().google;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  buildMicrosoftAuthorizeUrl(state: string): string {
    const clientId = this.getMicrosoftClientId();
    if (!clientId) {
      throw new BadRequestException(
        'Microsoft OAuth is not configured (set MICROSOFT_CLIENT_ID or CRM_INBOX_MICROSOFT_CLIENT_ID)',
      );
    }
    const redirectUri = this.getRedirectUris().microsoft;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES,
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
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
        'Gmail OAuth credentials are not configured (CRM_INBOX_GOOGLE_* or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)',
      );
    }
    const redirectUri = this.getRedirectUris().google;
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
      this.logger.warn(`Google token exchange failed: ${JSON.stringify(json)}`);
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

  async exchangeMicrosoftCode(code: string): Promise<{
    refresh_token?: string;
    access_token: string;
    expires_in: number;
    id_token?: string;
  }> {
    const clientId = this.getMicrosoftClientId();
    const clientSecret = this.getMicrosoftClientSecret();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Microsoft OAuth credentials are not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET or CRM_INBOX_*)',
      );
    }
    const redirectUri = this.getRedirectUris().microsoft;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES,
    });
    const res = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.warn(
        `Microsoft token exchange failed: ${JSON.stringify(json)}`,
      );
      throw new BadRequestException(
        (json.error_description as string) || 'Microsoft token exchange failed',
      );
    }
    return {
      refresh_token: json.refresh_token as string | undefined,
      access_token: json.access_token as string,
      expires_in: (json.expires_in as number) || 3600,
      id_token: json.id_token as string | undefined,
    };
  }

  async completeGoogleOAuth(code: string, state: string): Promise<void> {
    const { userId } = this.verifyOAuthState(state);
    const tokens = await this.exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Revoke CRM access in your Google account and try again, or use a Google account that has not connected before.',
      );
    }
    const { email, name } = await this.fetchGoogleProfile(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const account = await this.inboxAccountsService.createOAuthAccount(userId, {
      email,
      provider: 'gmail',
      displayName: name || email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAt,
    });
    void this.inboxPushService
      .registerPushForAccount(String((account as any)._id))
      .catch((err: unknown) =>
        this.logger.warn(
          `Gmail push registration failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  async completeMicrosoftOAuth(code: string, state: string): Promise<void> {
    const { userId } = this.verifyOAuthState(state);
    const tokens = await this.exchangeMicrosoftCode(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Microsoft did not return a refresh token. Disconnect the app in your Microsoft account and try again.',
      );
    }
    const email = resolveMicrosoftSignInEmail(
      tokens.access_token,
      tokens.id_token,
    );
    if (!email) {
      throw new BadRequestException(
        'Could not read mailbox address from Microsoft token. Try again or use app-password connection.',
      );
    }
    const name = resolveMicrosoftSignInName(
      tokens.access_token,
      tokens.id_token,
    );
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const account = await this.inboxAccountsService.createOAuthAccount(userId, {
      email,
      provider: 'outlook',
      displayName: name || email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAt,
      microsoftGraphMail: true,
    });
    void this.inboxPushService
      .registerPushForAccount(String((account as any)._id))
      .catch((err: unknown) =>
        this.logger.warn(
          `Microsoft push registration failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  redirectAfterOAuth(
    success: boolean,
    errorMessage?: string,
    returnTo?: string,
  ): string {
    const base = this.getPortalBase();
    const params = new URLSearchParams();
    const isCalendar = returnTo === 'calendar';
    params.set(isCalendar ? 'calendar_oauth' : 'inbox_oauth', success ? 'success' : 'error');
    if (!success && errorMessage) {
      params.set('reason', errorMessage.slice(0, 500));
    }
    const path =
      isCalendar ? '/crm/workspace' : '/crm/inbox';
    if (isCalendar) {
      params.set('tab', 'calendar');
    }
    return `${base}${path}?${params.toString()}`;
  }
}
