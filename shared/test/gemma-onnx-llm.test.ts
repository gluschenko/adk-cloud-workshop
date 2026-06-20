import { describe, expect, it } from 'vitest';
import { parseToolCalls } from '../src/gemma-onnx-llm.ts';

describe('Gemma ONNX tool call parsing', () => {
  it('parses JSON tool calls', () => {
    expect(
      parseToolCalls('{"tool_calls":[{"name":"search_products","arguments":{"query":"Steam Deck"}}]}'),
    ).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'search_products',
          arguments: '{"query":"Steam Deck"}',
        },
      },
    ]);
  });

  it('parses local inline call syntax with loose arguments', () => {
    expect(parseToolCalls('call:search_products{query:Steam Deck}')).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'search_products',
          arguments: '{"query":"Steam Deck"}',
        },
      },
    ]);
  });
});
