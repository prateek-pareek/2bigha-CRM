import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmOutreachAiSettingsService } from '../../crm/crm-outreach-ai-settings.service';
import { LlmConfigService } from './llm-config.service';
import { AnthropicLlmProvider } from './providers/anthropic.provider';
import { GoogleLlmProvider } from './providers/google.provider';
import { OpenAiLlmProvider } from './providers/openai.provider';
import { NvidiaLlmProvider } from './providers/nvidia.provider';
import {
  LlmMessageOptions,
  LlmProviderAdapter,
  LlmProviderId,
  LlmStatus,
  LlmToolsTurnOptions,
  LlmToolsTurnResult,
} from './llm.types';

export type { LlmMessageOptions as AnthropicMessageOptions };
export type { LlmToolsTurnOptions as AnthropicToolsTurnOptions };
export type { LlmToolsTurnResult as AnthropicToolsTurnResult };
export { DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic.provider';

@Injectable()
export class LlmClientService {
  private readonly log = new Logger(LlmClientService.name);
  private readonly providers: Record<LlmProviderId, LlmProviderAdapter>;

  constructor(
    private readonly config: LlmConfigService,
    private readonly outreachAiSettings: CrmOutreachAiSettingsService,
  ) {
    this.providers = {
      anthropic: new AnthropicLlmProvider(),
      openai: new OpenAiLlmProvider(),
      google: new GoogleLlmProvider(),
      nvidia: new NvidiaLlmProvider(),
    };
  }

  isConfigured(): boolean {
    return this.config.getConfiguredProviders().length > 0;
  }

  getStatus(): LlmStatus {
    const chain = this.config.resolveProviderChain();
    const active = chain[0] ?? null;
    return {
      configured: this.isConfigured(),
      activeProvider: active,
      provider: this.config.getPreferredProvider(),
      fallbackEnabled: this.config.isFallbackEnabled(),
      model: active
        ? this.providers[active].resolveModelCandidates()[0]
        : null,
      providers: this.config.providerStatus(),
    };
  }

  getApiKey(): string | null {
    const chain = this.config.resolveProviderChain();
    for (const id of chain) {
      const key = this.providers[id].getApiKey();
      if (key) return key;
    }
    return null;
  }

  requireApiKey(featureLabel = 'AI'): string {
    const key = this.getApiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        `${featureLabel} requires an LLM API key. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY. Configure AI_LLM_PROVIDER to choose a provider (default: auto).`,
      );
    }
    return key;
  }

  normalizeModelId(raw?: string, provider?: LlmProviderId): string {
    const id = provider ?? this.config.resolveProviderChain()[0] ?? 'anthropic';
    return this.providers[id].normalizeModelId(raw);
  }

  async resolveModel(override?: string): Promise<string> {
    const candidates = await this.resolveModelCandidates(override);
    return candidates[0] || this.providers.anthropic.defaultModel();
  }

  async resolveModelCandidates(override?: string): Promise<string[]> {
    const settings = await this.outreachAiSettings.getEffectiveForPromptSafe();
    const settingsModel = String(
      settings.llmModel || settings.anthropicModel || '',
    ).trim();
    const settingsProvider = String(settings.llmProvider || '').trim();
    const chain = this.config.resolveProviderChain(settingsProvider || undefined);
    const primary = chain[0] ?? 'anthropic';
    return this.providers[primary].resolveModelCandidates(override, settingsModel);
  }

  async createMessageText(opts: LlmMessageOptions): Promise<string> {
    const result = await this.executeWithFallback(
      opts.featureLabel || 'AI',
      opts.provider,
      async (adapter) => {
        const settings = await this.outreachAiSettings.getEffectiveForPromptSafe();
        const settingsModel = String(
          settings.llmModel || settings.anthropicModel || '',
        ).trim();
        const models = adapter.resolveModelCandidates(opts.model, settingsModel);
        return adapter.createMessageText({ ...opts, model: models[0] });
      },
    );
    return result.text;
  }

  async createMessagesWithToolsTurn(
    opts: LlmToolsTurnOptions,
  ): Promise<LlmToolsTurnResult> {
    return this.executeWithFallback(
      opts.featureLabel || 'AI',
      opts.provider,
      async (adapter) => {
        const settings = await this.outreachAiSettings.getEffectiveForPromptSafe();
        const settingsModel = String(
          settings.llmModel || settings.anthropicModel || '',
        ).trim();
        const models = adapter.resolveModelCandidates(opts.model, settingsModel);
        const turn = await adapter.createMessagesWithToolsTurn({
          ...opts,
          model: models[0],
        });
        return { ...turn, provider: adapter.id };
      },
    );
  }

  private async executeWithFallback<T extends { model: string; provider?: LlmProviderId }>(
    featureLabel: string,
    explicitProvider: LlmProviderId | undefined,
    fn: (adapter: LlmProviderAdapter) => Promise<T>,
  ): Promise<T> {
    const settings = await this.outreachAiSettings.getEffectiveForPromptSafe();
    const settingsProvider = String(settings.llmProvider || '').trim();
    let chain = explicitProvider
      ? [explicitProvider]
      : this.config.resolveProviderChain(settingsProvider || undefined);

    if (explicitProvider && !this.providers[explicitProvider].isConfigured()) {
      throw new ServiceUnavailableException(
        `${featureLabel}: provider "${explicitProvider}" is not configured.`,
      );
    }

    chain = chain.filter((id) => this.providers[id].isConfigured());
    if (!chain.length) {
      throw new ServiceUnavailableException(
        `${featureLabel} requires an LLM API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY).`,
      );
    }

    let lastError: Error | null = null;
    for (let i = 0; i < chain.length; i += 1) {
      const id = chain[i];
      try {
        const result = await fn(this.providers[id]);
        if (i > 0) {
          this.log.log(
            `${featureLabel} succeeded with fallback provider ${id} (model ${result.model})`,
          );
        }
        return { ...result, provider: id };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const canFallback =
          this.config.isFallbackEnabled() && i < chain.length - 1;
        this.log.warn(
          `${featureLabel} failed on ${id}: ${lastError.message.slice(0, 200)}${canFallback ? ' — trying next provider' : ''}`,
        );
        if (!canFallback) break;
      }
    }

    throw new ServiceUnavailableException(
      lastError?.message ||
      `${featureLabel} failed on all configured LLM providers.`,
    );
  }
}
