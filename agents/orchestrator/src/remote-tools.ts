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
        if (packet.event === 'error' && isRecord(packet.data) && typeof packet.data.message === 'string') {
          errors.push(packet.data.message);
        }
      }
    }

    const trimmed = result.trim();
    if (trimmed) return { result: trimmed };
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

function partsToText(parts: Array<{ text?: string }> | undefined): string {
  return (parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}
