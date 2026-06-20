import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

export interface ProductRow {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  warehouse: string;
}

export function searchProducts(input: { query?: string; category?: string; maxPrice?: number }) {
  const db = openDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (input.query) {
    for (const word of input.query.split(/\s+/).filter(Boolean)) {
      clauses.push('(name LIKE ? OR category LIKE ? OR sku LIKE ?)');
      const w = `%${word}%`;
      params.push(w, w, w);
    }
  }
  if (input.category) {
    clauses.push('category = ?');
    params.push(input.category.toLowerCase());
  }
  if (input.maxPrice !== undefined) {
    clauses.push('price <= ?');
    params.push(input.maxPrice);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const products = db
    .prepare(`SELECT * FROM products ${where} ORDER BY price ASC LIMIT 10`)
    .all(...params) as unknown as ProductRow[];
  db.close();
  return { products };
}

export function getStock(input: { sku: string }) {
  const db = openDb();
  const row = db
    .prepare('SELECT sku, name, stock, warehouse FROM products WHERE sku = ? COLLATE NOCASE')
    .get(input.sku) as unknown as Pick<ProductRow, 'sku' | 'name' | 'stock' | 'warehouse'> | undefined;
  db.close();
  if (!row) return { error: `No product found with SKU '${input.sku}'.` };
  return { ...row, inStock: row.stock > 0 };
}

export const searchProductsTool = new FunctionTool({
  name: 'search_products',
  description:
    'Search the TechParts product catalog. All filters are optional and combinable. Returns up to 10 products sorted by price.',
  parameters: z.object({
    query: z
      .string()
      .optional()
      .describe('Free-text search over product name, category and SKU, e.g. "noise cancelling headphones".'),
    category: z
      .string()
      .optional()
      .describe(
        'Exact category: headphones, earbuds, keyboards, monitors, storage, charging, computers, accessories, audio, cameras.',
      ),
    maxPrice: z.number().optional().describe('Maximum price in USD.'),
  }),
  execute: searchProducts,
});

export const getStockTool = new FunctionTool({
  name: 'get_stock',
  description: 'Get current stock level and warehouse location for a product by SKU.',
  parameters: z.object({
    sku: z.string().describe('Product SKU, e.g. SONY-WH1000XM5.'),
  }),
  execute: getStock,
});
