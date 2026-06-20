import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

interface PriceRow {
  sku: string;
  name: string;
  price: number;
}

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
