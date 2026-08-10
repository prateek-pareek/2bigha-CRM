import { Logger } from '@nestjs/common';
import {
  LlmMessageOptions,
  LlmProviderAdapter,
  LlmToolsTurnOptions,
} from '../llm.types';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

const FALLBACK_ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-haiku-4-5-20251001',
] as const;

const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-3-5-sonnet': 'claude-sonnet-4-6',
  'claude-3-5-sonnet-latest': 'claude-sonnet-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

export class AnthropicLlmProvider implements LlmProviderAdapter {
  readonly id = 'anthropic' as const;
  private readonly log = new Logger(AnthropicLlmProvider.name);

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY?.trim();
  }

  getApiKey(): string | null {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  }

  defaultModel(): string {
    return DEFAULT_ANTHROPIC_MODEL;
  }

  normalizeModelId(raw?: string): string {
    const m = String(raw || '').trim();
    if (!m) return '';
    const lower = m.toLowerCase();
    return MODEL_ALIASES[lower] || MODEL_ALIASES[m] || m;
  }

  resolveModelCandidates(override?: string, settingsModel?: string): string[] {
    const out: string[] = [];
    const add = (raw?: string) => {
      const n = this.normalizeModelId(raw);
      if (n && !out.includes(n)) out.push(n);
    };
    add(override);
    add(settingsModel);
    add(process.env.ANTHROPIC_MODEL);
    add(process.env.AI_LLM_MODEL);
    for (const m of FALLBACK_ANTHROPIC_MODELS) add(m);
    return out.length ? out : [DEFAULT_ANTHROPIC_MODEL];
  }

  async createMessageText(
    opts: LlmMessageOptions,
  ): Promise<{ text: string; model: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const requestedMax = opts.maxTokens ?? 4096;
    const maxTokenAttempts = [
      Math.min(requestedMax, 8192),
      Math.min(requestedMax, 4096),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    let lastStatus = 0;
    let lastErrText = '';
    let lastModel = models[0];

    for (const model of models) {
      for (const maxTokens of maxTokenAttempts) {
        lastModel = model;
        const result = await this.postMessage(apiKey, {
          model,
          maxTokens,
          userPrompt: opts.userPrompt,
          system: opts.system,
        });
        if (result.ok) {
          if (!result.text) throw new Error('Empty response from Anthropic');
          return { text: result.text, model };
        }
        lastStatus = result.status;
        lastErrText = result.errText;
        if (!this.shouldRetryWithAnotherModel(result.status, result.errText)) {
          break;
        }
        this.log.warn(
          `Anthropic ${opts.featureLabel || 'request'} failed for ${model} (${result.status})`,
        );
      }
    }

    throw new Error(
      `Anthropic failed (${lastStatus}) model=${lastModel}: ${lastErrText.slice(0, 280)}`,
    );
  }

  async createMessagesWithToolsTurn(opts: LlmToolsTurnOptions) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const requestedMax = opts.maxTokens ?? 4096;
    const maxTokenAttempts = [
      Math.min(requestedMax, 8192),
      Math.min(requestedMax, 4096),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    let lastStatus = 0;
    let lastErrText = '';
    let lastModel = models[0];

    for (const model of models) {
      for (const maxTokens of maxTokenAttempts) {
        lastModel = model;
        const result = await this.postMessagesWithTools(apiKey, {
          model,
          maxTokens,
          system: opts.system,
          tools: opts.tools,
          messages: opts.messages,
        });
        if (result.ok) {
          return {
            content: result.content,
            stop_reason: result.stop_reason,
            model,
          };
        }
        lastStatus = result.status;
        lastErrText = result.errText;
        if (!this.shouldRetryWithAnotherModel(result.status, result.errText)) {
          break;
        }
      }
    }

    throw new Error(
      `Anthropic tools failed (${lastStatus}) model=${lastModel}: ${lastErrText.slice(0, 280)}`,
    );
  }

  private shouldRetryWithAnotherModel(status: number, errText: string): boolean {
    if (status === 401) return false;
    if (status === 404) return true;
    if (status !== 400) return false;
    const lower = errText.toLowerCase();
    return (
      lower.includes('model') ||
      lower.includes('max_tokens') ||
      lower.includes('maximum')
    );
  }

  private async postMessage(
    apiKey: string,
    opts: {
      model: string;
      maxTokens: number;
      userPrompt: string;
      system?: string;
    },
  ): Promise<{ ok: true; text: string } | { ok: false; status: number; errText: string }> {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'user', content: opts.userPrompt }],
    };
    if (opts.system?.trim()) body.system = opts.system.trim();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, status: res.status, errText: await res.text().catch(() => '') };
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    return { ok: true, text };
  }

  private async postMessagesWithTools(
    apiKey: string,
    opts: {
      model: string;
      maxTokens: number;
      system: string;
      tools: unknown[];
      messages: Array<Record<string, unknown>>;
    },
  ): Promise<
    | { ok: true; content: Array<Record<string, unknown>>; stop_reason?: string }
    | { ok: false; status: number; errText: string }
  > {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system.trim(),
        tools: opts.tools,
        messages: opts.messages,
      }),
    });

    if (!res.ok) {
      return { ok: false, status: res.status, errText: await res.text().catch(() => '') };
    }

    const data = (await res.json()) as {
      content?: Array<Record<string, unknown>>;
      stop_reason?: string;
    };
    return {
      ok: true,
      content: data.content ?? [],
      stop_reason: data.stop_reason,
    };
  }
}
