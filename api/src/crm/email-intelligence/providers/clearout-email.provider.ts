import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';
import { EmailProviderAdapter } from './email-provider.interface';

const CLEAROUT_API = 'https://api.clearout.io/v2';

@Injectable()
export class ClearoutEmailProvider implements EmailProviderAdapter {
  readonly id: EmailProviderId = 'clearout';
  readonly name = 'Clearout';
  readonly supportedCapabilities: EmailCapability[] = ['emailVerifier'];

  private async clearoutPost(
    path: string,
    apiKey: string,
    payload: Record<string, unknown>,
    timeoutMs = 130_000,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${CLEAROUT_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...payload, timeout: timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 5_000),
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 402) {
      throw new BadRequestException(
        'Clearout credits exhausted. Add credits in Clearout or use another verifier provider.',
      );
    }

    if (!res.ok) {
      const err = body.error as { message?: string } | undefined;
      const detail =
        err?.message || `Clearout API error (${res.status})`;
      throw new BadRequestException(detail);
    }

    if (body.status === 'failed') {
      const err = body.error as { message?: string } | undefined;
      throw new BadRequestException(
        err?.message || 'Clearout verification failed.',
      );
    }

    return body;
  }

  async linkedinFinder(): Promise<unknown> {
    throw new BadRequestException(
      'Clearout does not support LinkedIn URL lookup. Enable Prospeo, Tomba, or Anymail for LinkedIn finder.',
    );
  }

  async emailVerifier(
    credentials: ProviderCredentials,
    email: string,
  ): Promise<EmailVerificationNormalized> {
    const body = await this.clearoutPost(
      '/email_verify/instant',
      credentials.apiKey,
      { email: email.trim().toLowerCase() },
    );

    return this.normalizeVerification(email, body);
  }

  private normalizeVerification(
    email: string,
    raw: Record<string, unknown>,
  ): EmailVerificationNormalized {
    const data = raw.data as Record<string, unknown> | undefined;
    const status = String(data?.status ?? 'unknown').toLowerCase();
    const safeToSend = String(data?.safe_to_send ?? '').toLowerCase();
    const disposable = String(data?.disposable ?? '').toLowerCase() === 'yes';
    const acceptAll =
      String(data?.sub_status ?? '')
        .toLowerCase()
        .includes('catch') ||
      status.includes('catch');

    const deliverable =
      safeToSend === 'yes' ||
      status === 'valid' ||
      status === 'deliverable';

    return {
      provider: this.id,
      email: String(data?.email_address ?? email),
      result: status || safeToSend || 'unknown',
      status,
      deliverable,
      acceptAll,
      disposable,
      raw,
    };
  }
}
