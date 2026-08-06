export type LlmProviderId = 'anthropic' | 'openai' | 'google' | 'nvidia';

export type LlmMessageOptions = {
  userPrompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
  featureLabel?: string;
  provider?: LlmProviderId;
};

export type LlmToolsTurnOptions = {
  system: string;
  tools: unknown[];
  messages: Array<Record<string, unknown>>;
  maxTokens?: number;
  model?: string;
  featureLabel?: string;
  provider?: LlmProviderId;
};

export type LlmToolsTurnResult = {
  content: Array<Record<string, unknown>>;
  stop_reason?: string;
  model: string;
  provider: LlmProviderId;
};

export type LlmStatus = {
  configured: boolean;
  activeProvider: LlmProviderId | null;
  provider: LlmProviderId | 'auto';
  fallbackEnabled: boolean;
  model: string | null;
  providers: Record<
    LlmProviderId,
    { configured: boolean; model: string; envKeys: string[] }
  >;
};

export type LlmProviderAdapter = {
  id: LlmProviderId;
  isConfigured(): boolean;
  getApiKey(): string | null;
  defaultModel(): string;
  normalizeModelId(raw?: string): string;
  resolveModelCandidates(
    override?: string,
    settingsModel?: string,
  ): string[];
  createMessageText(opts: LlmMessageOptions): Promise<{ text: string; model: string }>;
  createMessagesWithToolsTurn(
    opts: LlmToolsTurnOptions,
  ): Promise<Omit<LlmToolsTurnResult, 'provider'>>;
};
