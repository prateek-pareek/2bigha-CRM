import {
  EmailProviderAuthMode,
  EmailProviderStoredConfig,
} from '../email-intelligence.types';

export function isProviderConfigured(
  authMode: EmailProviderAuthMode,
  config: EmailProviderStoredConfig,
): boolean {
  const apiKey = config.apiKey?.trim() ?? '';
  const apiSecret = config.apiSecret?.trim() ?? '';
  if (!apiKey) return false;
  if (authMode === 'apiKeySecret') return apiSecret.length > 0;
  return true;
}

export function providerCredentials(
  authMode: EmailProviderAuthMode,
  config: EmailProviderStoredConfig,
): { apiKey: string; apiSecret: string; webhookUrl?: string } {
  const webhookUrl = config.webhookUrl?.trim();
  return {
    apiKey: config.apiKey!.trim(),
    apiSecret: authMode === 'apiKeySecret' ? config.apiSecret!.trim() : '',
    webhookUrl: webhookUrl || undefined,
  };
}
