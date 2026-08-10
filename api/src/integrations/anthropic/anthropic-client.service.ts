import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../llm/llm-client.service';
import {
  LlmMessageOptions,
  LlmToolsTurnOptions,
} from '../llm/llm.types';

export type {
  LlmMessageOptions as AnthropicMessageOptions,
  LlmToolsTurnOptions as AnthropicToolsTurnOptions,
  LlmToolsTurnResult as AnthropicToolsTurnResult,
} from '../llm/llm.types';
export { DEFAULT_ANTHROPIC_MODEL } from '../llm/providers/anthropic.provider';

/**
 * Backward-compatible facade — routes all calls through the multi-provider LlmClientService.
 */
@Injectable()
export class AnthropicClientService {
  constructor(private readonly llm: LlmClientService) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  getApiKey(): string | null {
    return this.llm.getApiKey();
  }

  requireApiKey(featureLabel = 'AI'): string {
    return this.llm.requireApiKey(featureLabel);
  }

  normalizeModelId(raw?: string): string {
    return this.llm.normalizeModelId(raw);
  }

  async resolveModel(override?: string): Promise<string> {
    return this.llm.resolveModel(override);
  }

  async resolveModelCandidates(override?: string): Promise<string[]> {
    return this.llm.resolveModelCandidates(override);
  }

  async createMessageText(opts: LlmMessageOptions): Promise<string> {
    return this.llm.createMessageText(opts);
  }

  async createMessagesWithToolsTurn(opts: LlmToolsTurnOptions) {
    return this.llm.createMessagesWithToolsTurn(opts);
  }

  getLlmStatus() {
    return this.llm.getStatus();
  }
}
