import { describe, expect, it } from 'vitest';
import { buildSpecialistRequest, parseSse } from '../src/remote-tools.ts';

describe('orchestrator remote tools', () => {
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
});
