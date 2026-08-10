import { BadRequestException, Injectable } from '@nestjs/common';
import { Finder, TombaClient, TombaException, Verifier } from 'tomba';
import {
  EmailCapability,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { EmailProviderAdapter } from './email-provider.interface';

@Injectable()
export class TombaEmailProvider implements EmailProviderAdapter {
  readonly id = 'tomba' as const;
  readonly name = 'Tomba.io';
  readonly supportedCapabilities: EmailCapability[] = [
    'linkedinFinder',
    'emailVerifier',
  ];

  private client(credentials: ProviderCredentials): TombaClient {
    const client = new TombaClient();
    client.setKey(credentials.apiKey).setSecret(credentials.apiSecret);
    return client;
  }

  async linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
    options?: { enrichMobile?: boolean; full?: boolean },
  ): Promise<unknown> {
    const finder = new Finder(this.client(credentials));
    try {
      return await finder.linkedinFinder(
        url,
        options?.enrichMobile,
        options?.full,
      );
    } catch (err) {
      throw this.wrap(err, 'LinkedIn finder');
    }
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
    options?: { enrichMobile?: boolean },
  ): Promise<EmailVerificationNormalized> {
    const verifier = new Verifier(this.client(credentials));
    let raw: unknown;
    try {
      raw = await verifier.emailVerifier(email, options?.enrichMobile);
    } catch (err) {
      throw this.wrap(err, 'Email verifier');
    }
    return this.normalizeVerification(email, raw);
  }

  private normalizeVerification(
    email: string,
    raw: unknown,
  ): EmailVerificationNormalized {
    const data =
      raw && typeof raw === 'object'
        ? ((raw as { data?: { email?: Record<string, unknown> } }).data?.email ??
          (raw as { email?: Record<string, unknown> }).email)
        : undefined;

    const result = String(data?.result ?? data?.status ?? 'unknown').toLowerCase();
    const score =
      typeof data?.score === 'number' ? data.score : undefined;
    const acceptAll = !!data?.accept_all;
    const disposable = !!data?.disposable;
    const smtpCheck = data?.smtp_check;
    const mxCheck = data?.mx_check;

    const deliverable =
      result === 'valid' ||
      result === 'deliverable' ||
      (smtpCheck === true && mxCheck === true && !data?.block);

    return {
      provider: this.id,
      email: String(data?.email ?? email),
      result,
      status: typeof data?.status === 'string' ? data.status : undefined,
      score,
      deliverable,
      acceptAll,
      disposable,
      raw,
    };
  }

  private wrap(err: unknown, label: string): BadRequestException {
    if (err instanceof TombaException) {
      return new BadRequestException(
        err.message || `${label} request failed.`,
      );
    }
    return new BadRequestException(`${label} request failed.`);
  }
}
