import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { EmailProviderAdapter } from './email-provider.interface';

const CLAY_API = 'https://api.clay.com/v1';

@Injectable()
export class ClayEmailProvider implements EmailProviderAdapter {
  private readonly logger = new Logger(ClayEmailProvider.name);

  readonly id: EmailProviderId = 'clay';
  readonly name = 'Clay';
  readonly supportedCapabilities: EmailCapability[] = [
    'linkedinFinder',
    'emailVerifier',
  ];

  private async clayFetch(
    path: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${CLAY_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 429) {
      throw new BadRequestException(
        'Clay rate limit reached. Try again later or use another provider.',
      );
    }

    if (!res.ok) {
      const message =
        (typeof json.message === 'string' && json.message) ||
        (typeof json.error === 'string' && json.error) ||
        `Clay API error (${res.status})`;
      throw new BadRequestException(message);
    }

    return json;
  }

  private personFromResponse(
    json: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const data = json.data;
    if (data && typeof data === 'object') {
      return data as Record<string, unknown>;
    }
    return undefined;
  }

  private extractEmail(person?: Record<string, unknown>): string | null {
    if (!person) return null;
    const candidates = [
      person.email,
      person.work_email,
      person.workEmail,
      person.primary_email,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.includes('@')) return c.trim();
    }
    return null;
  }

  private async enrichPerson(
    apiKey: string,
    payload: Record<string, unknown>,
    webhookUrl?: string,
  ): Promise<Record<string, unknown>> {
    if (webhookUrl?.trim()) {
      try {
        await fetch(webhookUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            source: 'mathionix-crm',
          }),
        });
      } catch (err) {
        this.logger.warn(`Clay webhook fire-and-forget failed: ${err}`);
      }
    }

    return this.clayFetch('/people/enrich', apiKey, payload);
  }

  async linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
    _options?: { enrichMobile?: boolean; full?: boolean },
  ): Promise<unknown> {
    const json = await this.enrichPerson(
      credentials.apiKey,
      { linkedinUrl: url.trim() },
      credentials.webhookUrl,
    );

    const person = this.personFromResponse(json);
    const email = this.extractEmail(person);
    if (!email) {
      throw new BadRequestException(
        'Clay enriched the profile but did not return a work email. Ensure your Clay plan includes contact data, or add a Clay table webhook with an email waterfall.',
      );
    }

    return json;
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
  ): Promise<EmailVerificationNormalized> {
    const json = await this.enrichPerson(
      credentials.apiKey,
      { email: email.trim().toLowerCase() },
      credentials.webhookUrl,
    );

    const person = this.personFromResponse(json);
    const found = this.extractEmail(person);
    const deliverable = !!found && found.toLowerCase() === email.toLowerCase();

    return {
      provider: this.id,
      email: found ?? email,
      result: deliverable ? 'valid' : found ? 'mismatch' : 'unknown',
      status: deliverable ? 'valid' : 'unknown',
      deliverable,
      raw: json,
    };
  }
}
