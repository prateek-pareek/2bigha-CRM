import { Injectable } from '@nestjs/common';
import { LlmProviderId, LlmStatus } from './llm.types';

const PROVIDER_ENV_KEYS: Record<LlmProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
};

const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
  nvidia: 'qwen/qwen3.5-397b-a17b',
};

const MODEL_ENV_KEYS: Record<LlmProviderId, string[]> = {
  anthropic: ['ANTHROPIC_MODEL'],
  openai: ['OPENAI_MODEL'],
  google: ['GOOGLE_MODEL', 'GEMINI_MODEL'],
  nvidia: ['NVIDIA_MODEL'],
};

/** Pure helper — safe to import without Nest DI (avoids circular deps). */
export function isAnyLlmProviderConfigured(): boolean {
  return (
    !!process.env.ANTHROPIC_API_KEY?.trim() ||
    !!process.env.OPENAI_API_KEY?.trim() ||
    !!process.env.GOOGLE_API_KEY?.trim() ||
    !!process.env.GEMINI_API_KEY?.trim() ||
    !!process.env.NVIDIA_API_KEY?.trim()
  );
}

@Injectable()
export class LlmConfigService {
  getProviderEnvKeys(id: LlmProviderId): string[] {
    return PROVIDER_ENV_KEYS[id];
  }

  isProviderConfigured(id: LlmProviderId): boolean {
    return this.getProviderEnvKeys(id).some((k) => !!process.env[k]?.trim());
  }

  getConfiguredProviders(): LlmProviderId[] {
    const order: LlmProviderId[] = ['anthropic', 'openai', 'google', 'nvidia'];
    return order.filter((id) => this.isProviderConfigured(id));
  }

  getPreferredProvider(): LlmProviderId | 'auto' {
    const raw = String(process.env.AI_LLM_PROVIDER || 'auto')
      .trim()
      .toLowerCase();
    if (raw === 'anthropic' || raw === 'openai' || raw === 'google' || raw === 'nvidia') {
      return raw as LlmProviderId;
    }
    return 'auto';
  }

  isFallbackEnabled(): boolean {
    const raw = String(process.env.AI_LLM_FALLBACK ?? 'true').toLowerCase();
    return !['false', '0', 'no'].includes(raw);
  }

  /** CRM settings provider override → env → auto chain. */
  resolveProviderChain(settingsProvider?: string): LlmProviderId[] {
    const configured = this.getConfiguredProviders();
    if (!configured.length) return [];

    const pref = String(settingsProvider || this.getPreferredProvider()).toLowerCase();
    if (pref === 'anthropic' || pref === 'openai' || pref === 'google' || pref === 'nvidia') {
      if (configured.includes(pref as LlmProviderId)) {
        const rest = configured.filter((p) => p !== pref);
        return this.isFallbackEnabled() ? [pref, ...rest] : [pref];
      }
      return this.isFallbackEnabled() ? configured : [];
    }

    return configured;
  }

  getApiKey(id: LlmProviderId): string | null {
    for (const key of this.getProviderEnvKeys(id)) {
      const v = process.env[key]?.trim();
      if (v) return v;
    }
    return null;
  }

  defaultModel(id: LlmProviderId): string {
    return DEFAULT_MODELS[id];
  }

  resolveModelFromEnv(id: LlmProviderId): string {
    for (const key of MODEL_ENV_KEYS[id]) {
      const v = process.env[key]?.trim();
      if (v) return v;
    }
    const global = process.env.AI_LLM_MODEL?.trim();
    if (global) return global;
    return this.defaultModel(id);
  }

  providerStatus(): LlmStatus['providers'] {
    return {
      anthropic: {
        configured: this.isProviderConfigured('anthropic'),
        model: this.resolveModelFromEnv('anthropic'),
        envKeys: this.getProviderEnvKeys('anthropic'),
      },
      openai: {
        configured: this.isProviderConfigured('openai'),
        model: this.resolveModelFromEnv('openai'),
        envKeys: this.getProviderEnvKeys('openai'),
      },
      google: {
        configured: this.isProviderConfigured('google'),
        model: this.resolveModelFromEnv('google'),
        envKeys: this.getProviderEnvKeys('google'),
      },
      nvidia: {
        configured: this.isProviderConfigured('nvidia'),
        model: this.resolveModelFromEnv('nvidia'),
        envKeys: this.getProviderEnvKeys('nvidia'),
      },
    };
  }
}
