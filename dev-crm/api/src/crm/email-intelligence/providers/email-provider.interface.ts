import {
  EmailCapability,
  EmailProviderId,
  EmailVerificationNormalized,
  ProviderCredentials,
} from '../email-intelligence.types';

export interface EmailProviderAdapter {
  readonly id: EmailProviderId;
  readonly name: string;
  readonly supportedCapabilities: EmailCapability[];

  linkedinFinder(
    credentials: ProviderCredentials,
    url: string,
    options?: { enrichMobile?: boolean; full?: boolean },
  ): Promise<unknown>;

  emailVerifier(
    credentials: ProviderCredentials,
    email: string,
    options?: { enrichMobile?: boolean },
  ): Promise<EmailVerificationNormalized>;
}
