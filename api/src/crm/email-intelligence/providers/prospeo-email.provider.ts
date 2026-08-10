import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { EmailProviderAdapter } from './email-provider.interface';

const PROSPEO_API = 'https://api.prospeo.io';

@Injectable()
export class ProspeoEmailProvider implements EmailProviderAdapter {
  readonly id: EmailProviderId = 'prospeo';
  readonly name = 'Prospeo';
  readonly supportedCapabilities: EmailCapability[] = [
    'linkedinFinder',
    'emailVerifier',
  ];

  private async prospeoPost(
    path: string,
    apiKey: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${PROSPEO_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok || body.error === true) {
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error_code === 'string' && body.error_code) ||
        `Prospeo API error (${res.status})`;
      throw new BadRequestException(msg);
    }

    return body;
  }

  async linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
  ): Promise<unknown> {
    const body = await this.prospeoPost('/enrich-person', credentials.apiKey, {
      only_verified_email: true,
      enrich_mobile: false,
      data: { linkedin_url: url.trim() },
    });

    const person = this.extractPerson(body);
    const email = this.extractEmail(person);
    if (!email) {
      throw new BadRequestException(
        'Prospeo could not find a verified email for this LinkedIn profile.',
      );
    }

    return body;
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
  ): Promise<EmailVerificationNormalized> {
    const body = await this.prospeoPost('/enrich-person', credentials.apiKey, {
      only_verified_email: true,
      enrich_mobile: false,
      data: { email: email.trim().toLowerCase() },
    });

    const person = this.extractPerson(body);
    const foundEmail = this.extractEmail(person);
    const status = String(
      person?.email_status ?? person?.email_verification_status ?? 'unknown',
    ).toLowerCase();

    const deliverable =
      !!foundEmail &&
      (status.includes('verified') ||
        status === 'valid' ||
        status === 'deliverable');

    return {
      provider: this.id,
      email: foundEmail ?? email,
      result: foundEmail ? status || 'verified' : 'not_found',
      status,
      deliverable,
      raw: body,
    };
  }

  private extractPerson(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const response = body.response as Record<string, unknown> | undefined;
    const person =
      response?.person ??
      body.person ??
      (body.data as Record<string, unknown> | undefined)?.person;
    return person && typeof person === 'object'
      ? (person as Record<string, unknown>)
      : undefined;
  }

  private extractEmail(person?: Record<string, unknown>): string | null {
    const email = person?.email ?? person?.work_email;
    if (typeof email === 'string' && email.includes('@')) return email.trim();
    return null;
  }
}
