import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSpecialistRequest, parseSse, queryRemoteAgent, summarizeToolResult } from '../src/remote-tools.ts';

const originalFetch = globalThis.fetch;

describe('orchestrator remote tools', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses text events from an agent SSE stream', () => {
    const parsed = parseSse(
      [
        'event: tool_call',
        'data: {"name":"search_products","args":{"query":"Steam Deck"}}',
        '',
        'event: text',
        'data: {"text":"Steam Deck OLED is in stock."}',
        '',
        '',
      ].join('\n'),
    );

    expect(parsed.rest).toBe('');
    expect(parsed.packets).toEqual([
      { event: 'tool_call', data: { name: 'search_products', args: { query: 'Steam Deck' } } },
      { event: 'text', data: { text: 'Steam Deck OLED is in stock.' } },
    ]);
  });

  it('keeps an incomplete event in the buffer', () => {
    const parsed = parseSse('event: text\ndata: {"text":"partial"}');

    expect(parsed.packets).toEqual([]);
    expect(parsed.rest).toBe('event: text\ndata: {"text":"partial"}');
  });

  it('adds the original user text when the model sends a vague specialist request', () => {
    expect(
      buildSpecialistRequest('Check the product catalog', {
        userContent: { parts: [{ text: 'STREAMDECK-MK2' }] },
      }),
    ).toContain('Original user request: STREAMDECK-MK2');
  });

  it('falls back to the latest worker tool result when no final text is emitted', async () => {
    const stream = [
      'event: tool_result',
      'data: {"name":"search_products","response":{"products":[{"sku":"LOGI-MXMASTER3S","price":99.99}]}}',
      '',
      'event: done',
      'data: {}',
      '',
      '',
    ].join('\n');

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: new Response(stream).body,
      status: 200,
    })) as unknown as typeof fetch;

    await expect(
      queryRemoteAgent({
        name: 'inventory_agent',
        url: 'http://inventory.test',
        request: 'Look up the price for product Logitech.',
      }),
    ).resolves.toEqual({
      result: 'I found 1 matching product:\n- Unknown product (LOGI-MXMASTER3S, $99.99)',
      toolResult: {
        name: 'search_products',
        response: { products: [{ sku: 'LOGI-MXMASTER3S', price: 99.99 }] },
      },
    });
  });

  it('summarizes product tool results as readable text', () => {
    expect(
      summarizeToolResult({
        products: [
          {
            sku: 'LOGI-MXMASTER3S',
            name: 'Logitech MX Master 3S Wireless Mouse',
            price: 99.99,
            stock: 40,
            warehouse: 'B',
          },
        ],
      }),
    ).toBe(
      'I found 1 matching product:\n- Logitech MX Master 3S Wireless Mouse (LOGI-MXMASTER3S, $99.99, 40 in stock, warehouse B)',
    );
  });
});
