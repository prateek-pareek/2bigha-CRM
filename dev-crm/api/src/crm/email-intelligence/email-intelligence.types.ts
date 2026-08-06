export const EMAIL_INTELLIGENCE_INTEGRATION_TYPE = 'email-intelligence';

/** Legacy single-provider document (migrated on read). */
export const LEGACY_EMAIL_FINDER_TYPE = 'email-finder';

export type EmailCapability = 'linkedinFinder' | 'emailVerifier';

export type EmailProviderId =
  | 'tomba'
  | 'hunter'
  | 'prospeo'
  | 'clay'
  | 'clearout'
  | 'anymail';

/** Whether the vendor includes programmatic API access on a free / trial plan. */
export type FreeApiAccess = 'included' | 'trial' | 'paid_only' | 'unknown';

export type EmailProviderAuthMode = 'apiKey' | 'apiKeySecret';

export type EmailProviderCapabilities = {
  linkedinFinder: boolean;
  emailVerifier: boolean;
};

export type EmailProviderStoredConfig = {
  enabled: boolean;
  apiKey?: string;
  apiSecret?: string;
  /** Optional Clay table webhook for async waterfall workflows. */
  webhookUrl?: string;
  capabilities: EmailProviderCapabilities;
  priority: number;
};

export type EmailIntelligenceStoredDoc = {
  type: string;
  providers: Record<string, EmailProviderStoredConfig>;
};

export type EmailProviderDefinition = {
  id: EmailProviderId;
  name: string;
  description: string;
  capabilities: EmailCapability[];
  docsUrl: string;
  authMode: EmailProviderAuthMode;
  freeApiAccess: FreeApiAccess;
  freeTierHint: string;
  defaultPriority: number;
};

export type EmailProviderPublicDto = {
  id: EmailProviderId;
  name: string;
  description: string;
  supportedCapabilities: EmailCapability[];
  docsUrl: string;
  authMode: EmailProviderAuthMode;
  requiresApiSecret: boolean;
  freeApiAccess: FreeApiAccess;
  freeTierHint: string;
  enabled: boolean;
  configured: boolean;
  hasApiSecret: boolean;
  apiKey: string;
  webhookUrl: string;
  capabilities: EmailProviderCapabilities;
  priority: number;
};

export type CapabilityStatusDto = {
  available: boolean;
  providerIds: EmailProviderId[];
};

export type EmailIntelligenceStatusDto = {
  capabilities: Record<EmailCapability, CapabilityStatusDto>;
};

export type EmailVerificationNormalized = {
  provider: EmailProviderId;
  email: string;
  result: string;
  status?: string;
  score?: number;
  deliverable: boolean;
  acceptAll?: boolean;
  disposable?: boolean;
  raw?: unknown;
};

export type ProviderCredentials = {
  apiKey: string;
  apiSecret: string;
  webhookUrl?: string;
};
