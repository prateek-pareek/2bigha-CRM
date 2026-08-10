/** @deprecated Import from `@/lib/crm/email-intelligence` instead. */
import {
  fetchEmailIntelligenceStatus,
  fetchEmailIntelligenceSettings,
  saveEmailIntelligenceSettings,
  findEmailFromLinkedIn,
  primaryEmailFromFinderResult,
  type EmailIntelligenceStatus,
} from './email-intelligence';

export type EmailFinderStatus = {
  available: boolean;
  configured: boolean;
  isActive: boolean;
};

export async function fetchEmailFinderStatus(): Promise<EmailFinderStatus> {
  const status = await fetchEmailIntelligenceStatus();
  const linkedin = status.capabilities.linkedinFinder;
  return {
    available: linkedin.available,
    configured: linkedin.providerIds.length > 0,
    isActive: linkedin.available,
  };
}

export async function fetchEmailFinderSettings() {
  const data = await fetchEmailIntelligenceSettings();
  const tomba = data?.providers.find((p) => p.id === 'tomba');
  return {
    isActive: !!tomba?.enabled,
    apiKey: tomba?.apiKey ?? '',
    hasApiSecret: !!tomba?.hasApiSecret,
    configured: !!tomba?.configured,
  };
}

export async function saveEmailFinderSettings(body: {
  apiKey: string;
  apiSecret?: string;
  isActive: boolean;
}) {
  await saveEmailIntelligenceSettings({
    providers: {
      tomba: {
        enabled: body.isActive,
        apiKey: body.apiKey,
        apiSecret: body.apiSecret,
        capabilities: { linkedinFinder: true, emailVerifier: true },
      },
    },
  });
  return fetchEmailFinderSettings();
}

export { findEmailFromLinkedIn, primaryEmailFromFinderResult as primaryEmailFromTombaResult };
export type { EmailIntelligenceStatus };
