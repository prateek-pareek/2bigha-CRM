import { Logger } from '@nestjs/common';
import axios from 'axios';
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

const DEFAULT_NVIDIA_MODEL = 'qwen/qwen3.5-397b-a17b';
const INVOKE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

export class NvidiaLlmProvider implements LlmProviderAdapter {
  readonly id = 'nvidia' as const;
  private readonly log = new Logger(NvidiaLlmProvider.name);

  isConfigured(): boolean {
    return !!process.env.NVIDIA_API_KEY?.trim();
  }

  getApiKey(): string | null {
    return process.env.NVIDIA_API_KEY?.trim() || null;
  }

  defaultModel(): string {
    return DEFAULT_NVIDIA_MODEL;
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
    add(process.env.NVIDIA_MODEL);
    add(process.env.AI_LLM_MODEL);
    add(DEFAULT_NVIDIA_MODEL);
    add('qwen/qwen3.5-397b-a17b'); // Backup Qwen model
    return out;
  }

  async createMessageText(
    opts: LlmMessageOptions,
  ): Promise<{ text: string; model: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 16384);

    let lastErr = '';
    for (const model of models) {
      try {
        const response = await axios.post(
          INVOKE_URL,
          {
            model,
            max_tokens: maxTokens,
            temperature: 0.6,
            top_p: 0.95,
            stream: false,
            messages: [
              ...(opts.system?.trim()
                ? [{ role: 'system', content: opts.system.trim() }]
                : []),
              { role: 'user', content: opts.userPrompt },
            ],
            chat_template_kwargs: { thinking: true, reasoning_effort: 'high' },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              Accept: 'application/json',
            },
            responseType: 'json',
            timeout: 300000,
          },
        );

        const data = response.data;
        const text = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (!text) throw new Error('Empty response from Nvidia NIM');
        return { text, model };
      } catch (error: any) {
        if (error.response) {
          lastErr = JSON.stringify(error.response.data);
          if (error.response.status === 401) break;
        } else {
          lastErr = error.message;
        }
        this.log.warn(`Nvidia ${opts.featureLabel || 'request'} failed for ${model}`);
      }
    }
    throw new Error(`Nvidia NIM failed: ${lastErr.slice(0, 280)}`);
  }

  async createMessagesWithToolsTurn(opts: LlmToolsTurnOptions) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
    const models = this.resolveModelCandidates(opts.model);
    const maxTokens = Math.min(opts.maxTokens ?? 4096, 16384);

    // Use the existing utility to convert anthropic formats to OpenAI-compatible formats
    const openAiMessages = anthropicMessagesToOpenAI(opts.messages, opts.system);
    const openAiTools = anthropicToolsToOpenAI(opts.tools);

    let lastErr = '';
    for (const model of models) {
      try {
        const payload: any = {
          model,
          max_tokens: maxTokens,
          temperature: 0.6,
          top_p: 0.95,
          stream: false,
          messages: openAiMessages,
          chat_template_kwargs: { thinking: true, reasoning_effort: 'high' },
        };

        if (openAiTools && openAiTools.length > 0) {
          payload.tools = openAiTools;
        }

        const response = await axios.post(INVOKE_URL, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          responseType: 'json',
          timeout: 300000,
        });

        const data = response.data;
        const message = data.choices?.[0]?.message ?? {};
        const converted = openAIResponseToAnthropic(message);

        return {
          content: converted.content,
          stop_reason: converted.stop_reason,
          model,
        };
      } catch (error: any) {
        if (error.response) {
          lastErr = JSON.stringify(error.response.data);
          if (error.response.status === 401) break;
        } else {
          lastErr = error.message;
        }
        this.log.warn(`Nvidia tools turn failed for ${model}: ${lastErr.slice(0, 150)}`);
      }
    }
    throw new Error(`Nvidia NIM tools failed: ${lastErr.slice(0, 280)}`);
  }
}
