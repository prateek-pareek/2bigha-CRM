import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { linkedinProfileHandle } from '../utils/linkedin.util';
import { EmailProviderAdapter } from './email-provider.interface';

const HUNTER_API = 'https://api.hunter.io/v2';

@Injectable()
export class HunterEmailProvider implements EmailProviderAdapter {
  readonly id: EmailProviderId = 'hunter';
  readonly name = 'Hunter.io';
  readonly supportedCapabilities: EmailCapability[] = [
    'linkedinFinder',
    'emailVerifier',
  ];

  private async hunterGet(
    path: string,
    params: Record<string, string | undefined>,
    apiKey: string,
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${HUNTER_API}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') url.searchParams.set(key, value);
    }
    url.searchParams.set('api_key', apiKey);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 202) {
      throw new BadRequestException(
        'Hunter verification is still in progress. Try again in a few seconds.',
      );
    }

    if (!res.ok) {
      const errors = body.errors as { details?: string; id?: string }[] | undefined;
      const detail =
        errors?.[0]?.details || errors?.[0]?.id || `Hunter API error (${res.status})`;
      throw new BadRequestException(detail);
    }

    return body;
  }

  async linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
  ): Promise<unknown> {
    const handle = linkedinProfileHandle(url);
    if (!handle) {
      throw new BadRequestException(
        'Could not parse LinkedIn profile handle from URL.',
      );
    }

    const body = await this.hunterGet(
      '/email-finder',
      { linkedin_handle: handle },
      credentials.apiKey,
    );

    const data = body.data as Record<string, unknown> | undefined;
    if (!data?.email) {
      throw new BadRequestException(
        'Hunter could not find an email for this LinkedIn profile.',
      );
    }

    return body;
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
  ): Promise<EmailVerificationNormalized> {
    const url = new URL(`${HUNTER_API}/email-verifier`);
    url.searchParams.set('email', email);
    url.searchParams.set('api_key', credentials.apiKey);

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.status === 202) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }

      if (!res.ok) {
        const errors = body.errors as { details?: string; id?: string }[] | undefined;
        const detail =
          errors?.[0]?.details ||
          errors?.[0]?.id ||
          `Hunter verifier error (${res.status})`;
        throw new BadRequestException(detail);
      }

      return this.normalizeVerification(email, body);
    }

    throw new BadRequestException(
      'Hunter verification timed out. Try again in a few seconds.',
    );
  }

  private normalizeVerification(
    email: string,
    raw: Record<string, unknown>,
  ): EmailVerificationNormalized {
    const data = raw.data as Record<string, unknown> | undefined;
    const status = String(data?.status ?? 'unknown').toLowerCase();
    const result = String(data?.result ?? status).toLowerCase();
    const score = typeof data?.score === 'number' ? data.score : undefined;
    const acceptAll = !!data?.accept_all;
    const disposable = !!data?.disposable;

    const deliverable =
      status === 'valid' ||
      result === 'deliverable' ||
      (data?.smtp_check === true && !data?.block);

    return {
      provider: this.id,
      email: String(data?.email ?? email),
      result: result || status,
      status,
      score,
      deliverable,
      acceptAll,
      disposable,
      raw,
    };
  }
}
