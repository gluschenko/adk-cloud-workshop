import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seed } from '@techparts/shared';
import { searchProducts, getStock } from '../src/tools.ts';

beforeAll(() => {
  process.env.TECHPARTS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'techparts-')), 'test.db');
  seed();
});

describe('searchProducts', () => {
  it('finds noise-cancelling headphones under $300', () => {
    const result = searchProducts({ category: 'headphones', maxPrice: 300 });
    expect(result.products.length).toBeGreaterThanOrEqual(2);
    expect(result.products.every((p) => p.price <= 300)).toBe(true);
    expect(result.products.map((p) => p.sku)).toContain('SONY-WH1000XM4');
  });

  it('matches free-text query against product names', () => {
    const result = searchProducts({ query: 'sony headphones' });
    expect(result.products.map((p) => p.sku)).toContain('SONY-WH1000XM5');
  });

  it('returns empty list, not an error, for no matches', () => {
    const result = searchProducts({ query: 'flux capacitor' });
    expect(result.products).toEqual([]);
  });
});

describe('getStock', () => {
  it('returns stock and warehouse for a known sku', () => {
    const result = getStock({ sku: 'SONY-WH1000XM5' });
    expect(result).toMatchObject({ sku: 'SONY-WH1000XM5', stock: 12, warehouse: 'A' });
  });

  it('is case-insensitive on sku', () => {
    const result = getStock({ sku: 'sony-wh1000xm5' });
    expect(result).toMatchObject({ stock: 12 });
  });

  it('reports unknown skus clearly', () => {
    const result = getStock({ sku: 'NOPE-123' });
    expect(result).toHaveProperty('error');
  });
});
