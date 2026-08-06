import { Injectable } from '@nestjs/common';
import {
  EmailCapability,
  EmailProviderDefinition,
  EmailProviderId,
} from '../email-intelligence.types';
import { AnymailEmailProvider } from './anymail-email.provider';
import { ClayEmailProvider } from './clay-email.provider';
import { ClearoutEmailProvider } from './clearout-email.provider';
import { EmailProviderAdapter } from './email-provider.interface';
import { HunterEmailProvider } from './hunter-email.provider';
import { ProspeoEmailProvider } from './prospeo-email.provider';
import { TombaEmailProvider } from './tomba-email.provider';

export const EMAIL_PROVIDER_DEFINITIONS: EmailProviderDefinition[] = [
  {
    id: 'tomba',
    name: 'Tomba.io',
    description:
      'LinkedIn URL finder and email verifier. Uses API key + secret.',
    capabilities: ['linkedinFinder', 'emailVerifier'],
    docsUrl: 'https://tomba.io/api',
    authMode: 'apiKeySecret',
    freeApiAccess: 'included',
    freeTierHint: '~25 API credits/month (renewing)',
    defaultPriority: 10,
  },
  {
    id: 'prospeo',
    name: 'Prospeo',
    description:
      'LinkedIn URL enrichment for verified work emails. API key only.',
    capabilities: ['linkedinFinder', 'emailVerifier'],
    docsUrl: 'https://prospeo.io/api-docs/enrich-person',
    authMode: 'apiKey',
    freeApiAccess: 'included',
    freeTierHint: '~75 email credits/month with API access',
    defaultPriority: 20,
  },
  {
    id: 'anymail',
    name: 'Anymail Finder',
    description:
      'LinkedIn URL finder and email verifier. API key in Authorization header.',
    capabilities: ['linkedinFinder', 'emailVerifier'],
    docsUrl: 'https://anymailfinder.com/email-finder-api/docs',
    authMode: 'apiKey',
    freeApiAccess: 'trial',
    freeTierHint: '~100 trial credits to test API (one-time signup)',
    defaultPriority: 25,
  },
  {
    id: 'clearout',
    name: 'Clearout',
    description:
      'Email verifier (instant verify API). Finder needs name + domain in Clearout app, not LinkedIn URLs.',
    capabilities: ['emailVerifier'],
    docsUrl: 'https://docs.clearout.io/developers/api/email-verify',
    authMode: 'apiKey',
    freeApiAccess: 'included',
    freeTierHint: '100 signup credits (non-expiring); ~4 credits per verify',
    defaultPriority: 30,
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    description:
      'LinkedIn handle finder and verifier. Many free accounts are extension/dashboard-only — confirm API works with your key.',
    capabilities: ['linkedinFinder', 'emailVerifier'],
    docsUrl: 'https://hunter.io/api-documentation/v2',
    authMode: 'apiKey',
    freeApiAccess: 'unknown',
    freeTierHint:
      'Official free plan lists API; many teams need a paid plan for programmatic access',
    defaultPriority: 40,
  },
  {
    id: 'clay',
    name: 'Clay',
    description:
      'People enrich API (LinkedIn URL or email). Optional table webhook for async waterfalls.',
    capabilities: ['linkedinFinder', 'emailVerifier'],
    docsUrl: 'https://university.clay.com/docs/using-clay-as-an-api',
    authMode: 'apiKey',
    freeApiAccess: 'paid_only',
    freeTierHint: 'API access typically requires a paid Clay plan',
    defaultPriority: 50,
  },
];

@Injectable()
export class EmailProviderRegistry {
  private readonly adapters: Map<EmailProviderId, EmailProviderAdapter>;

  constructor(
    tomba: TombaEmailProvider,
    hunter: HunterEmailProvider,
    prospeo: ProspeoEmailProvider,
    clay: ClayEmailProvider,
    clearout: ClearoutEmailProvider,
    anymail: AnymailEmailProvider,
  ) {
    this.adapters = new Map<EmailProviderId, EmailProviderAdapter>([
      [tomba.id, tomba],
      [hunter.id, hunter],
      [prospeo.id, prospeo],
      [clay.id, clay],
      [clearout.id, clearout],
      [anymail.id, anymail],
    ]);
  }

  get(id: EmailProviderId): EmailProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  getDefinition(id: EmailProviderId): EmailProviderDefinition | undefined {
    return EMAIL_PROVIDER_DEFINITIONS.find((d) => d.id === id);
  }

  listDefinitions(): EmailProviderDefinition[] {
    return EMAIL_PROVIDER_DEFINITIONS;
  }

  supportsCapability(
    adapter: EmailProviderAdapter,
    capability: EmailCapability,
  ): boolean {
    return adapter.supportedCapabilities.includes(capability);
  }
}
