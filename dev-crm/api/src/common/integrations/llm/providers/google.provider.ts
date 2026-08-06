import { Logger } from '@nestjs/common';
import {
  anthropicMessagesToGemini,
  anthropicToolsToGemini,
  geminiResponseToAnthropic,
} from '../llm-message.util';
import {
  LlmMessageOptions,
  LlmProviderAdapter,
  LlmToolsTurnOptions,
} from '../llm.types';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const FALLBACK_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const;

export class GoogleLlmProvider implements LlmProviderAdapter {
  readonly id = 'google' as const;
  private readonly log = new Logger(GoogleLlmProvider.name);

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
  }

  getApiKey(): string | null {
    return (
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      null
    );
  }

  defaultModel(): string {
    return DEFAULT_GEMINI_MODEL;
  }

  normalizeModelId(raw?: string): string {
    const m = String(raw || '').trim();
    if (!m) return '';
    return m.startsWith('models/') ? m.slice('models/'.length) : m;
  }

  resolveModelCandidates(override?: string, settingsModel?: string): string[] {
    const out: string[] = [];
    const add = (raw?: string) => {
      const n = this.normalizeModelId(raw);
      if (n && !out.includes(n)) out.push(n);
    };
    add(override);
    add(settingsModel);
    add(process.env.GOOGLE_MODEL);
    add(process.env.GEMINI_MODEL);
    add(process.env.AI_LLM_MODEL);
    for (const m of FALLBACK_GEMINI_MODELS) add(m);
    return out.length ? out : [DEFAULT_GEMINI_MODEL];
  }

  private geminiUrl(model: string, apiKey: string): string {
    const id = this.normalizeModelId(model);
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }

  async createMessageText(
    opts: LlmMessageOptions,
  ): Promise<{ text: string; model: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 8192);

    let lastErr = '';
    for (const model of models) {
      const body: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [{ text: opts.userPrompt }],
          },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (opts.system?.trim()) {
        body.systemInstruction = { parts: [{ text: opts.system.trim() }] };
      }

      const res = await fetch(this.geminiUrl(model, apiKey), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const converted = geminiResponseToAnthropic(data);
        const text = converted.content
          .filter((c) => c.type === 'text')
          .map((c) => String(c.text ?? ''))
          .join('\n')
          .trim();
        if (!text) throw new Error('Empty response from Gemini');
        return { text, model };
      }
      lastErr = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) break;
      this.log.warn(`Gemini ${opts.featureLabel || 'request'} failed for ${model}`);
    }
    throw new Error(`Gemini failed: ${lastErr.slice(0, 280)}`);
  }

  async createMessagesWithToolsTurn(opts: LlmToolsTurnOptions) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 8192);
    const contents = anthropicMessagesToGemini(opts.messages);
    const functionDeclarations = anthropicToolsToGemini(opts.tools);

    let lastErr = '';
    for (const model of models) {
      const body: Record<string, unknown> = {
        contents,
        tools: [{ functionDeclarations }],
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (opts.system?.trim()) {
        body.systemInstruction = { parts: [{ text: opts.system.trim() }] };
      }

      const res = await fetch(this.geminiUrl(model, apiKey), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const converted = geminiResponseToAnthropic(data);
        return {
          content: converted.content,
          stop_reason: converted.stop_reason,
          model,
        };
      }
      lastErr = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) break;
    }
    throw new Error(`Gemini tools failed: ${lastErr.slice(0, 280)}`);
  }
}
