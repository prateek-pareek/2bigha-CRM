import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { EmailProviderAdapter } from './email-provider.interface';

const ANYMAIL_API = 'https://api.anymailfinder.com/v5.1';
const REQUEST_TIMEOUT_MS = 180_000;

@Injectable()
export class AnymailEmailProvider implements EmailProviderAdapter {
  readonly id: EmailProviderId = 'anymail';
  readonly name = 'Anymail Finder';
  readonly supportedCapabilities: EmailCapability[] = [
    'linkedinFinder',
    'emailVerifier',
  ];

  private async anymailPost(
    path: string,
    apiKey: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${ANYMAIL_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 402) {
      throw new BadRequestException(
        'Anymail Finder credits exhausted. Add credits or use another provider.',
      );
    }

    if (!res.ok) {
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error === 'string' && body.error) ||
        `Anymail Finder API error (${res.status})`;
      throw new BadRequestException(msg);
    }

    return body;
  }

  async linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
  ): Promise<unknown> {
    const body = await this.anymailPost('/find-email/person', credentials.apiKey, {
      linkedin_url: url.trim(),
    });

    const validEmail = body.valid_email;
    const email = body.email;
    const found =
      (typeof validEmail === 'string' && validEmail.includes('@')
        ? validEmail
        : null) ||
      (typeof email === 'string' && email.includes('@') ? email : null);

    if (!found) {
      const status = String(body.email_status ?? 'not_found');
      throw new BadRequestException(
        `Anymail Finder could not find a valid email (${status}).`,
      );
    }

    return body;
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
  ): Promise<EmailVerificationNormalized> {
    const body = await this.anymailPost('/verify-email', credentials.apiKey, {
      email: email.trim().toLowerCase(),
    });

    return this.normalizeVerification(email, body);
  }

  private normalizeVerification(
    email: string,
    raw: Record<string, unknown>,
  ): EmailVerificationNormalized {
    const status = String(raw.email_status ?? 'unknown').toLowerCase();
    const deliverable = status === 'valid';

    return {
      provider: this.id,
      email,
      result: status,
      status,
      deliverable,
      raw,
    };
  }
}
