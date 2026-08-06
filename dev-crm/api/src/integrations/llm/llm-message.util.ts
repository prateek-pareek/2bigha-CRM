/** Convert Anthropic-style tool defs to OpenAI function tools. */
export function anthropicToolsToOpenAI(tools: unknown[]): unknown[] {
  return (tools as Array<Record<string, unknown>>).map((t) => ({
    type: 'function',
    function: {
      name: String(t.name ?? ''),
      description: String(t.description ?? ''),
      parameters: (t.input_schema as Record<string, unknown>) || {
        type: 'object',
        properties: {},
      },
    },
  }));
}

/** Convert Anthropic-style tool defs to Gemini function declarations. */
export function anthropicToolsToGemini(tools: unknown[]): unknown[] {
  return (tools as Array<Record<string, unknown>>).map((t) => ({
    name: String(t.name ?? ''),
    description: String(t.description ?? ''),
    parameters: (t.input_schema as Record<string, unknown>) || {
      type: 'object',
      properties: {},
    },
  }));
}

type OpenAIChatMessage = Record<string, unknown>;

/** Anthropic agent loop messages → OpenAI chat messages. */
export function anthropicMessagesToOpenAI(
  messages: Array<Record<string, unknown>>,
  system: string,
): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];
  if (system.trim()) {
    out.push({ role: 'system', content: system.trim() });
  }

  for (const m of messages) {
    const role = String(m.role ?? 'user');
    const content = m.content;

    if (role === 'user' && Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_result') {
          out.push({
            role: 'tool',
            tool_call_id: String(block.tool_use_id ?? ''),
            content: String(block.content ?? ''),
          });
        }
      }
      continue;
    }

    if (role === 'assistant' && Array.isArray(content)) {
      const blocks = content as Array<Record<string, unknown>>;
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text ?? ''))
        .join('\n')
        .trim();
      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      const msg: OpenAIChatMessage = {
        role: 'assistant',
        content: text || null,
      };
      if (toolUses.length) {
        msg.tool_calls = toolUses.map((tu) => ({
          id: String(tu.id ?? ''),
          type: 'function',
          function: {
            name: String(tu.name ?? ''),
            arguments: JSON.stringify(tu.input ?? {}),
          },
        }));
      }
      out.push(msg);
      continue;
    }

    out.push({
      role,
      content:
        typeof content === 'string' ? content : JSON.stringify(content ?? ''),
    });
  }

  return out;
}

export function openAIResponseToAnthropic(message: Record<string, unknown>): {
  content: Array<Record<string, unknown>>;
  stop_reason?: string;
} {
  const content: Array<Record<string, unknown>> = [];
  const text = String(message.content ?? '').trim();
  if (text) content.push({ type: 'text', text });

  const toolCalls = Array.isArray(message.tool_calls)
    ? (message.tool_calls as Array<Record<string, unknown>>)
    : [];
  for (const tc of toolCalls) {
    const fn = (tc.function as Record<string, unknown>) || {};
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(String(fn.arguments || '{}')) as Record<string, unknown>;
    } catch {
      input = {};
    }
    content.push({
      type: 'tool_use',
      id: String(tc.id ?? ''),
      name: String(fn.name ?? ''),
      input,
    });
  }

  return {
    content,
    stop_reason: toolCalls.length ? 'tool_use' : 'end_turn',
  };
}

/** Anthropic agent loop messages → Gemini contents[]. */
export function anthropicMessagesToGemini(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    const role = String(m.role ?? 'user');
    const content = m.content;

    if (role === 'user' && Array.isArray(content)) {
      const parts: Array<Record<string, unknown>> = [];
      for (const block of content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_result') {
          let response: Record<string, unknown> = {};
          try {
            response = JSON.parse(String(block.content ?? '{}')) as Record<
              string,
              unknown
            >;
          } catch {
            response = { result: String(block.content ?? '') };
          }
          parts.push({
            functionResponse: {
              name: String(block.tool_name ?? 'tool'),
              response,
            },
          });
        }
      }
      if (parts.length) out.push({ role: 'user', parts });
      continue;
    }

    if (role === 'assistant' && Array.isArray(content)) {
      const parts: Array<Record<string, unknown>> = [];
      for (const block of content as Array<Record<string, unknown>>) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: String(block.text) });
        }
        if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: String(block.name ?? ''),
              args: (block.input as Record<string, unknown>) || {},
            },
          });
        }
      }
      if (parts.length) out.push({ role: 'model', parts });
      continue;
    }

    out.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof content === 'string' ? content : JSON.stringify(content ?? '') }],
    });
  }

  return out;
}

export function geminiResponseToAnthropic(data: Record<string, unknown>): {
  content: Array<Record<string, unknown>>;
  stop_reason?: string;
} {
  const content: Array<Record<string, unknown>> = [];
  const candidates = Array.isArray(data.candidates)
    ? (data.candidates as Array<Record<string, unknown>>)
    : [];
  const parts =
    (candidates[0]?.content as Record<string, unknown> | undefined)?.parts;
  const partList = Array.isArray(parts)
    ? (parts as Array<Record<string, unknown>>)
    : [];

  let hasTool = false;
  for (const part of partList) {
    if (part.text) {
      content.push({ type: 'text', text: String(part.text) });
    }
    if (part.functionCall) {
      hasTool = true;
      const fc = part.functionCall as Record<string, unknown>;
      content.push({
        type: 'tool_use',
        id: `gemini_${String(fc.name ?? 'tool')}_${Date.now()}`,
        name: String(fc.name ?? ''),
        input: (fc.args as Record<string, unknown>) || {},
      });
    }
  }

  return {
    content,
    stop_reason: hasTool ? 'tool_use' : 'end_turn',
  };
}
