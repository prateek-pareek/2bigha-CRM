import { Logger } from '@nestjs/common';
import {
  anthropicMessagesToOpenAI,
  anthropicToolsToOpenAI,
  openAIResponseToAnthropic,
} from '../llm-message.util';
import {
  LlmMessageOptions,
  LlmProviderAdapter,
  LlmToolsTurnOptions,
} from '../llm.types';

const DEFAULT_OPENAI_MODEL = 'gpt-4o';

const FALLBACK_OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
] as const;

export class OpenAiLlmProvider implements LlmProviderAdapter {
  readonly id = 'openai' as const;
  private readonly log = new Logger(OpenAiLlmProvider.name);

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY?.trim();
  }

  getApiKey(): string | null {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }

  defaultModel(): string {
    return DEFAULT_OPENAI_MODEL;
  }

  normalizeModelId(raw?: string): string {
    return String(raw || '').trim();
  }

  resolveModelCandidates(override?: string, settingsModel?: string): string[] {
    const out: string[] = [];
    const add = (raw?: string) => {
      const n = this.normalizeModelId(raw);
      if (n && !out.includes(n)) out.push(n);
    };
    add(override);
    add(settingsModel);
    add(process.env.OPENAI_MODEL);
    add(process.env.AI_LLM_MODEL);
    for (const m of FALLBACK_OPENAI_MODELS) add(m);
    return out.length ? out : [DEFAULT_OPENAI_MODEL];
  }

  async createMessageText(
    opts: LlmMessageOptions,
  ): Promise<{ text: string; model: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 8192);

    let lastErr = '';
    for (const model of models) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            ...(opts.system?.trim()
              ? [{ role: 'system', content: opts.system.trim() }]
              : []),
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (!text) throw new Error('Empty response from OpenAI');
        return { text, model };
      }
      lastErr = await res.text().catch(() => '');
      if (res.status === 401) break;
      this.log.warn(`OpenAI ${opts.featureLabel || 'request'} failed for ${model}`);
    }
    throw new Error(`OpenAI failed: ${lastErr.slice(0, 280)}`);
  }

  async createMessagesWithToolsTurn(opts: LlmToolsTurnOptions) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 8192);
    const openAiMessages = anthropicMessagesToOpenAI(opts.messages, opts.system);
    const openAiTools = anthropicToolsToOpenAI(opts.tools);

    let lastErr = '';
    for (const model of models) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: openAiMessages,
          tools: openAiTools,
          tool_choice: 'auto',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: Record<string, unknown>; finish_reason?: string }>;
        };
        const message = data.choices?.[0]?.message ?? {};
        const converted = openAIResponseToAnthropic(message);
        return {
          content: converted.content,
          stop_reason: converted.stop_reason,
          model,
        };
      }
      lastErr = await res.text().catch(() => '');
      if (res.status === 401) break;
    }
    throw new Error(`OpenAI tools failed: ${lastErr.slice(0, 280)}`);
  }
}
