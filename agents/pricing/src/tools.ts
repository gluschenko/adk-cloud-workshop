import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

interface PriceRow {
  sku: string;
  name: string;
  price: number;
}

type DuckTopic = { Text?: string; FirstURL?: string };

export function getOurPrice(input: { skuOrName: string }) {
  const db = openDb();
  let row = db
    .prepare('SELECT sku, name, price FROM products WHERE sku = ? COLLATE NOCASE')
    .get(input.skuOrName) as unknown as PriceRow | undefined;
  if (!row) {
    row = db
      .prepare('SELECT sku, name, price FROM products WHERE name LIKE ? ORDER BY price DESC LIMIT 1')
      .get(`%${input.skuOrName}%`) as unknown as PriceRow | undefined;
  }
  db.close();
  if (!row) return { error: `No product found matching '${input.skuOrName}'.` };
  return { sku: row.sku, name: row.name, ourPrice: row.price };
}

export async function marketResearch(input: { product: string }) {
  const query = `${input.product} current price Amazon Best Buy manufacturer store`;
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    return { error: `Market research failed: ${response.status} ${response.statusText}` };
  }

  const data = (await response.json()) as {
    AbstractText?: string;
    Answer?: string;
    RelatedTopics?: Array<DuckTopic | { Topics?: DuckTopic[] }>;
  };
  const relatedTopics: DuckTopic[] = (data.RelatedTopics ?? []).flatMap((topic) =>
    isNestedDuckTopic(topic) ? topic.Topics ?? [] : [topic],
  );
  const results = [
    data.Answer ? { title: 'DuckDuckGo answer', snippet: data.Answer } : undefined,
    data.AbstractText ? { title: 'DuckDuckGo abstract', snippet: data.AbstractText } : undefined,
    ...relatedTopics
      .filter((topic) => topic.Text)
      .slice(0, 5)
      .map((topic) => ({ title: topic.Text?.split(' - ')[0], snippet: topic.Text, url: topic.FirstURL })),
  ].filter(Boolean);

  return {
    query,
    results,
    note:
      results.length === 0
        ? 'No supported public search summary was returned; say that competitor prices are unclear.'
        : 'Use only these public search snippets; do not invent retailer prices.',
  };
}

function isNestedDuckTopic(topic: DuckTopic | { Topics?: DuckTopic[] }): topic is { Topics?: DuckTopic[] } {
  return 'Topics' in topic;
}

export const getOurPriceTool = new FunctionTool({
  name: 'get_our_price',
  description: "Look up TechParts' own selling price for a product, by SKU or (partial) product name.",
  parameters: z.object({
    skuOrName: z
      .string()
      .describe('Product SKU (e.g. SONY-WH1000XM5) or part of the product name (e.g. "WH-1000XM5").'),
  }),
  execute: getOurPrice,
});

export const marketResearchTool = new FunctionTool({
  name: 'market_research',
  description:
    'Search public web summaries for current competitor prices and availability. Returns snippets that may mention retailers and prices.',
  parameters: z.object({
    product: z.string().describe('Product name or SKU to research, e.g. "Sony WH-1000XM5".'),
  }),
  execute: marketResearch,
});
