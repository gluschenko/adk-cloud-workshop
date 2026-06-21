import { FunctionTool } from '@google/adk';
import { z } from 'zod';

const REQUEST_TIMEOUT_MS = 120_000;

interface RemoteAgentToolOptions {
  name: string;
  description: string;
  url: string;
}

interface SsePacket {
  event: string;
  data: unknown;
}

interface RemoteToolContext {
  userContent?: { parts?: Array<{ text?: string }> };
  invocationContext?: { userContent?: { parts?: Array<{ text?: string }> } };
}

export function createRemoteAgentTool({ name, description, url }: RemoteAgentToolOptions) {
  return new FunctionTool({
    name,
    description,
    parameters: z.object({
      request: z.string().describe('A clear, self-contained natural-language request for the specialist agent.'),
    }),
    execute: async ({ request }: { request: string }, toolContext?: RemoteToolContext) =>
      queryRemoteAgent({ name, url, request: buildSpecialistRequest(request, toolContext) }),
  });
}

export function buildSpecialistRequest(request: string, toolContext?: RemoteToolContext): string {
  const original = partsToText(
    toolContext?.userContent?.parts ?? toolContext?.invocationContext?.userContent?.parts,
  ).trim();
  const trimmedRequest = request.trim();

  if (!original || trimmedRequest.includes(original)) {
    return trimmedRequest;
  }

  return [
    'Use the original user request as required context. Preserve exact ids, SKUs, product names, order ids, and customer ids.',
    `Original user request: ${original}`,
    `Specialist request: ${trimmedRequest}`,
  ].join('\n');
}

export async function queryRemoteAgent({
  name,
  url,
  request,
}: {
  name: string;
  url: string;
  request: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: `${name}-${crypto.randomUUID()}`,
        message: request,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      return { error: `${name} returned HTTP ${response.status}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';
    const errors: string[] = [];
    const toolResults: Array<{ name: string; response: unknown }> = [];

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(buffer);
      buffer = parsed.rest;

      for (const packet of parsed.packets) {
        if (packet.event === 'text' && isRecord(packet.data) && typeof packet.data.text === 'string') {
          result += packet.data.text;
        }
        if (packet.event === 'tool_result' && isRecord(packet.data)) {
          toolResults.push({
            name: typeof packet.data.name === 'string' ? packet.data.name : 'tool',
            response: packet.data.response,
          });
        }
        if (packet.event === 'error' && isRecord(packet.data) && typeof packet.data.message === 'string') {
          errors.push(packet.data.message);
        }
      }
    }

    const trimmed = result.trim();
    if (trimmed) return { result: trimmed };
    if (toolResults.length) {
      const latest = toolResults.at(-1);
      const summary = summarizeToolResult(latest?.response);
      return {
        result: summary ?? `The specialist returned ${latest?.name} data, but no final text answer.`,
        toolResult: latest,
      };
    }
    if (errors.length) return { error: errors.join('\n') };
    return { error: `${name} returned no text response.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSse(buffer: string): { packets: SsePacket[]; rest: string } {
  const packets: SsePacket[] = [];
  let rest = buffer;
  let boundary = rest.indexOf('\n\n');

  while (boundary !== -1) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const lines = raw.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
    const data = lines
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');

    if (event && data) {
      packets.push({ event, data: JSON.parse(data) });
    }

    boundary = rest.indexOf('\n\n');
  }

  return { packets, rest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function summarizeToolResult(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;

  if (typeof response.error === 'string') return response.error;

  if (Array.isArray(response.products)) {
    if (!response.products.length) return 'I found no matching products.';
    return [
      `I found ${response.products.length} matching product${response.products.length === 1 ? '' : 's'}:`,
      ...response.products.slice(0, 5).map((product) => summarizeProduct(product)),
    ].join('\n');
  }

  if (Array.isArray(response.orders)) {
    if (!response.orders.length) return 'I found no matching orders.';
    const customer = isRecord(response.customer) && typeof response.customer.name === 'string' ? ` for ${response.customer.name}` : '';
    return [
      `I found ${response.orders.length} order${response.orders.length === 1 ? '' : 's'}${customer}:`,
      ...response.orders.slice(0, 5).map((order) => summarizeOrder(order)),
    ].join('\n');
  }

  if (typeof response.sku === 'string' && typeof response.name === 'string') {
    return summarizeProduct(response);
  }

  if (typeof response.eligible === 'boolean' && typeof response.reason === 'string') {
    return response.eligible ? `Return eligible: ${response.reason}` : `Return not eligible: ${response.reason}`;
  }

  return undefined;
}

function summarizeProduct(value: unknown): string {
  if (!isRecord(value)) return `- ${JSON.stringify(value)}`;
  const name = typeof value.name === 'string' ? value.name : 'Unknown product';
  const sku = typeof value.sku === 'string' ? value.sku : undefined;
  const price = typeof value.price === 'number' ? `$${value.price.toFixed(2)}` : undefined;
  const stock = typeof value.stock === 'number' ? `${value.stock} in stock` : undefined;
  const warehouse = typeof value.warehouse === 'string' ? `warehouse ${value.warehouse}` : undefined;
  const details = [sku, price, stock, warehouse].filter(Boolean).join(', ');
  return `- ${name}${details ? ` (${details})` : ''}`;
}

function summarizeOrder(value: unknown): string {
  if (!isRecord(value)) return `- ${JSON.stringify(value)}`;
  const id = typeof value.id === 'number' ? `Order ${value.id}` : 'Order';
  const product = typeof value.productName === 'string' ? value.productName : value.sku;
  const status = typeof value.status === 'string' ? `status ${value.status}` : undefined;
  const total = typeof value.total === 'number' ? `$${value.total.toFixed(2)}` : undefined;
  const details = [product, status, total].filter(Boolean).join(', ');
  return `- ${id}${details ? `: ${details}` : ''}`;
}

function partsToText(parts: Array<{ text?: string }> | undefined): string {
  return (parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}
