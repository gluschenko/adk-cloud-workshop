import { BaseLlm } from '@google/adk';
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';

const DEFAULT_GEMMA_MODEL = 'onnx-community/gemma-4-E4B-it-ONNX';
const DEFAULT_GEMMA_DEVICE = 'cpu';
const DEFAULT_GEMMA_DTYPE = 'q4';
const DEFAULT_MAX_NEW_TOKENS = 512;

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface TransformersRuntime {
  processor: {
    (input: string, image?: unknown, audio?: unknown, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
    apply_chat_template: (messages: ChatMessage[], options?: Record<string, unknown>) => string;
    batch_decode: (tokens: unknown, options?: Record<string, unknown>) => string[];
  };
  model: {
    generate: (inputs: Record<string, unknown>) => Promise<unknown>;
  };
}

let runtimePromise: Promise<TransformersRuntime> | undefined;

export class GemmaOnnxLlm extends BaseLlm {
  readonly device: string;
  readonly dtype: string;

  constructor({
    model = process.env.GEMMA_MODEL ?? DEFAULT_GEMMA_MODEL,
    device = process.env.GEMMA_DEVICE ?? DEFAULT_GEMMA_DEVICE,
    dtype = process.env.GEMMA_DTYPE ?? DEFAULT_GEMMA_DTYPE,
  }: {
    model?: string;
    device?: string;
    dtype?: string;
  } = {}) {
    super({ model });
    this.device = device;
    this.dtype = dtype;
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = false,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    if (stream) {
      yield {
        errorCode: 'UNSUPPORTED_STREAMING',
        errorMessage: 'The local Gemma ONNX adapter currently supports non-streaming calls only.',
      };
      return;
    }

    if (abortSignal?.aborted) {
      yield {
        errorCode: 'ABORTED',
        errorMessage: 'The local Gemma ONNX request was aborted before generation started.',
      };
      return;
    }

    this.maybeAppendUserContent(llmRequest);

    try {
      const { processor, model } = await getRuntime({
        modelId: this.model,
        device: this.device,
        dtype: this.dtype,
      });
      const messages = toChatMessages(llmRequest);
      const tools = toGemmaTools(llmRequest);
      const prompt = processor.apply_chat_template(messages, {
        add_generation_prompt: true,
        enable_thinking: false,
        tools,
      });
      const inputs = await processor(prompt, undefined, undefined, {
        add_special_tokens: false,
      });
      const inputLength = getInputLength(inputs);
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: llmRequest.config?.maxOutputTokens ?? DEFAULT_MAX_NEW_TOKENS,
        do_sample: Boolean(llmRequest.config?.temperature && llmRequest.config.temperature > 0),
        temperature: llmRequest.config?.temperature,
      });
      const generated = sliceGeneratedTokens(outputs, inputLength);
      const decoded = processor.batch_decode(generated, {
        skip_special_tokens: true,
      });

      yield toLlmResponse(decoded[0] ?? '');
    } catch (err) {
      yield {
        errorCode: 'GEMMA_ONNX_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live connections are not supported by the local Gemma ONNX adapter.');
  }
}

export function defaultModel(): GemmaOnnxLlm {
  return new GemmaOnnxLlm();
}

async function getRuntime({
  modelId,
  device,
  dtype,
}: {
  modelId: string;
  device: string;
  dtype: string;
}): Promise<TransformersRuntime> {
  runtimePromise ??= loadRuntime({ modelId, device, dtype });
  return runtimePromise;
}

async function loadRuntime({
  modelId,
  device,
  dtype,
}: {
  modelId: string;
  device: string;
  dtype: string;
}): Promise<TransformersRuntime> {
  const transformers = await import('@huggingface/transformers');
  const { AutoProcessor, env } = transformers as Record<string, unknown>;
  const Gemma4ForConditionalGeneration = (transformers as Record<string, unknown>).Gemma4ForConditionalGeneration;

  if (!AutoProcessor || typeof (AutoProcessor as { from_pretrained?: unknown }).from_pretrained !== 'function') {
    throw new Error('@huggingface/transformers does not export AutoProcessor.');
  }
  if (!Gemma4ForConditionalGeneration || typeof (Gemma4ForConditionalGeneration as { from_pretrained?: unknown }).from_pretrained !== 'function') {
    throw new Error(
      '@huggingface/transformers is too old for Gemma 4 ONNX. Install a version that exports Gemma4ForConditionalGeneration.',
    );
  }

  if (env && typeof env === 'object') {
    (env as { allowLocalModels?: boolean; allowRemoteModels?: boolean }).allowLocalModels = true;
    (env as { allowLocalModels?: boolean; allowRemoteModels?: boolean }).allowRemoteModels = true;
  }

  const processor = await (AutoProcessor as { from_pretrained: (id: string) => Promise<TransformersRuntime['processor']> }).from_pretrained(modelId);
  const model = await (
    Gemma4ForConditionalGeneration as {
      from_pretrained: (id: string, options: Record<string, unknown>) => Promise<TransformersRuntime['model']>;
    }
  ).from_pretrained(modelId, {
    dtype,
    device,
  });

  return { processor, model };
}

function toChatMessages(llmRequest: LlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const system = partsToText(toParts(llmRequest.config?.systemInstruction));
  const tools = toGemmaTools(llmRequest);
  if (system || tools.length) {
    messages.push({
      role: 'system',
      content: [
        system,
        tools.length ? 'When you need a tool, respond only with JSON: {"tool_calls":[{"name":"tool_name","arguments":{}}]}' : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  }

  for (const content of llmRequest.contents) {
    const parts = content.parts ?? [];
    const toolResponses = parts.filter((part) => part.functionResponse);
    if (toolResponses.length) {
      for (const part of toolResponses) {
        const response = part.functionResponse;
        if (!response) continue;
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            name: response.name,
            id: response.id,
            response: response.response ?? {},
          }),
        });
      }
      continue;
    }

    const toolCalls = parts
      .map((part) => part.functionCall)
      .filter((call): call is NonNullable<typeof call> => Boolean(call));
    if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          tool_calls: toolCalls.map((call) => ({
            id: call.id ?? call.name ?? crypto.randomUUID(),
            name: call.name ?? '',
            arguments: call.args ?? {},
          })),
        }),
      });
      continue;
    }

    messages.push({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: partsToText(parts),
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

function toGemmaTools(llmRequest: LlmRequest) {
  const declarations =
    llmRequest.config?.tools?.flatMap((tool) =>
      hasFunctionDeclarations(tool) ? tool.functionDeclarations ?? [] : [],
    ) ?? [];
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

function getInputLength(inputs: Record<string, unknown>): number {
  const inputIds = inputs.input_ids as { dims?: number[] } | undefined;
  return inputIds?.dims?.at(-1) ?? 0;
}

function sliceGeneratedTokens(outputs: unknown, inputLength: number): unknown {
  if (!inputLength) return outputs;
  if (outputs && typeof outputs === 'object' && 'slice' in outputs && typeof (outputs as { slice?: unknown }).slice === 'function') {
    return (outputs as { slice: (start: unknown, end: unknown) => unknown }).slice(null, [inputLength, null]);
  }
  return outputs;
}

function toLlmResponse(content: string): LlmResponse {
  const text = stripThought(content).trim();
  const toolCalls = parseToolCalls(text);
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
    };
  }

  return {
    content: { role: 'model', parts: [{ text }] },
  };
}

function stripThought(content: string): string {
  return content.replace(/<\|channel\>thought[\s\S]*?<channel\|>/g, '');
}

function parseToolCalls(content: string): ToolCall[] | undefined {
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
