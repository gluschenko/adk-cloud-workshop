import { BaseLlm } from '@google/adk';
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';

const DEFAULT_GEMMA_SERVICE_URL = 'http://localhost:8010';
const DEFAULT_GEMMA_MODEL = 'gemma4-e4b-native-q';

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

interface ChatMessage {
  role: ChatRole;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ChatMessage['tool_calls'];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export class LiteRtLlm extends BaseLlm {
  readonly endpoint: string;

  constructor({
    model = process.env.GEMMA_MODEL ?? DEFAULT_GEMMA_MODEL,
    endpoint = process.env.GEMMA_SERVICE_URL ?? DEFAULT_GEMMA_SERVICE_URL,
  }: {
    model?: string;
    endpoint?: string;
  } = {}) {
    super({ model });
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = false,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    if (stream) {
      yield {
        errorCode: 'UNSUPPORTED_STREAMING',
        errorMessage: 'The local Gemma LiteRT adapter currently supports non-streaming calls only.',
      };
      return;
    }

    this.maybeAppendUserContent(llmRequest);

    const body = {
      model: this.model,
      messages: toChatMessages(llmRequest),
      tools: toOpenAiTools(llmRequest),
      temperature: llmRequest.config?.temperature,
      max_tokens: llmRequest.config?.maxOutputTokens,
      stream: false,
    };

    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortSignal,
      });

      const json = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
      if (!response.ok) {
        yield {
          errorCode: `HTTP_${response.status}`,
          errorMessage: json.error?.message ?? response.statusText,
        };
        return;
      }

      yield toLlmResponse(json);
    } catch (err) {
      yield {
        errorCode: 'GEMMA_SERVICE_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live connections are not supported by the local Gemma LiteRT adapter.');
  }
}

export function defaultModel(): LiteRtLlm {
  return new LiteRtLlm();
}

function toChatMessages(llmRequest: LlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const system = partsToText(toParts(llmRequest.config?.systemInstruction));
  if (system) messages.push({ role: 'system', content: system });

  for (const content of llmRequest.contents) {
    const parts = content.parts ?? [];
    const toolResponses = parts.filter((part) => part.functionResponse);
    if (toolResponses.length) {
      for (const part of toolResponses) {
        const response = part.functionResponse;
        if (!response) continue;
        messages.push({
          role: 'tool',
          tool_call_id: response.id ?? response.name,
          content: JSON.stringify(response.response ?? {}),
        });
      }
      continue;
    }

    const toolCalls = parts
      .map((part) => part.functionCall)
      .filter((call): call is NonNullable<typeof call> => Boolean(call));
    const text = partsToText(parts);
    if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.map((call) => ({
          id: call.id ?? call.name ?? crypto.randomUUID(),
          type: 'function',
          function: {
            name: call.name ?? '',
            arguments: JSON.stringify(call.args ?? {}),
          },
        })),
      });
      continue;
    }

    messages.push({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: text,
    });
  }

  return messages;
}

function toParts(value: unknown): Array<{ text?: string }> {
  if (!value) return [];
  if (typeof value === 'string') return [{ text: value }];
  if (typeof value === 'object' && 'parts' in value && Array.isArray((value as { parts?: unknown }).parts)) {
    return (value as { parts: Array<{ text?: string }> }).parts;
  }
  return [];
}

function partsToText(parts: Array<{ text?: string }> | undefined): string {
  return (parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}

function toOpenAiTools(llmRequest: LlmRequest) {
  const declarations =
    llmRequest.config?.tools?.flatMap((tool) =>
      hasFunctionDeclarations(tool) ? tool.functionDeclarations ?? [] : [],
    ) ?? [];
  if (!declarations.length) return undefined;
  return declarations.map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: normalizeJsonSchema(declaration.parametersJsonSchema ?? declaration.parameters ?? { type: 'object' }),
    },
  }));
}

function hasFunctionDeclarations(value: unknown): value is { functionDeclarations?: Array<Record<string, unknown>> } {
  return Boolean(value && typeof value === 'object' && 'functionDeclarations' in value);
}

function normalizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJsonSchema);
  if (!value || typeof value !== 'object') return value;
  const record = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, key === 'type' && typeof child === 'string' ? child.toLowerCase() : normalizeJsonSchema(child)]),
  );
  if (record.type === 'object' && !record.properties) record.properties = {};
  return record;
}

function toLlmResponse(response: ChatCompletionResponse): LlmResponse {
  const choice = response.choices?.[0];
  const message = choice?.message;
  if (!message) {
    return { errorCode: 'EMPTY_RESPONSE', errorMessage: 'Gemma service returned no choices.' };
  }

  const toolCalls = message.tool_calls?.length ? message.tool_calls : parseToolCalls(message.content);
  if (toolCalls?.length) {
    return {
      content: {
        role: 'model',
        parts: toolCalls.map((call) => ({
          functionCall: {
            id: call.id,
            name: call.function.name,
            args: parseJsonObject(call.function.arguments),
          },
        })),
      },
      usageMetadata: toUsageMetadata(response),
    };
  }

  return {
    content: { role: 'model', parts: [{ text: message.content ?? '' }] },
    usageMetadata: toUsageMetadata(response),
  };
}

function parseToolCalls(content: string | null | undefined): ChatMessage['tool_calls'] | undefined {
  if (!content) return undefined;
  const parsed = parseJsonObject(content);
  const calls = parsed.tool_calls;
  if (!Array.isArray(calls)) return undefined;
  return calls.map((call, index) => ({
    id: typeof call.id === 'string' ? call.id : `call_${index + 1}`,
    type: 'function',
    function: {
      name: String(call.name ?? call.function?.name ?? ''),
      arguments: JSON.stringify(call.arguments ?? call.function?.arguments ?? {}),
    },
  }));
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toUsageMetadata(response: ChatCompletionResponse) {
  if (!response.usage) return undefined;
  return {
    promptTokenCount: response.usage.prompt_tokens,
    candidatesTokenCount: response.usage.completion_tokens,
    totalTokenCount: response.usage.total_tokens,
  };
}
