import { LlmAgent } from '@google/adk';
import { getStockTool, searchProductsTool } from './tools.ts';

export const rootAgent = new LlmAgent({
  name: 'inventory_agent',
  model: 'gemini-2.5-flash',
  description:
    'Answers questions about the TechParts product catalog: which products exist, their prices, current stock levels and warehouse locations.',
  instruction: `You are the inventory agent for TechParts, a consumer-electronics retailer.

You answer questions about the product catalog and stock using your tools:
- Use search_products to find products by text, category or price.
- Use get_stock to check stock level and warehouse location for a specific SKU.

Rules:
- Always base answers on tool results; never invent products, prices or stock numbers.
- When suggesting alternatives, prefer in-stock items and mention price and stock.
- Be concise: short sentences or a compact list, no fluff.`,
  tools: [searchProductsTool, getStockTool],
});
