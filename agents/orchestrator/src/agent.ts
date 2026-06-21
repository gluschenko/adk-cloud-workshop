import { LlmAgent } from '@google/adk';
import { defaultModel } from '@techparts/shared';
import { createRemoteAgentTool } from './remote-tools.ts';

const INVENTORY_URL = process.env.INVENTORY_AGENT_URL ?? 'http://localhost:8001';
const ORDERS_URL = process.env.ORDERS_AGENT_URL ?? 'http://localhost:8002';
const PRICING_URL = process.env.PRICING_AGENT_URL ?? 'http://localhost:8003';

const inventoryAgentTool = createRemoteAgentTool({
  name: 'inventory_agent',
  description:
    'Use for product lookup, SKU lookup, stock, warehouse, price, and alternatives. Copy exact SKUs and product names into the request.',
  url: INVENTORY_URL,
});

const ordersAgentTool = createRemoteAgentTool({
  name: 'orders_agent',
  description:
    'Use for customer order history, order details, return eligibility, delivery dates, and return policy checks. Copy exact customer ids and order ids into the request.',
  url: ORDERS_URL,
});

const pricingAgentTool = createRemoteAgentTool({
  name: 'pricing_agent',
  description:
    'Use for price competitiveness and market comparison. Copy exact SKUs and product names into the request.',
  url: PRICING_URL,
});

export const rootAgent = new LlmAgent({
  name: 'ops_orchestrator',
  model: defaultModel(),
  description:
    'TechParts operations assistant for support staff. Coordinates the inventory, orders and pricing agents to resolve customer cases end-to-end.',
  instruction: `You are the TechParts operations assistant used by internal support staff.

You have no data of your own. Three specialist agents do the work. Call them as tools with clear, self-contained natural-language requests.

IMPORTANT TOOL ARGUMENT RULES:
- Never send vague requests like "Check the product catalog", "Find product details", or "Look up the order".
- Always copy exact identifiers from the user into the tool request: SKUs, product names, order ids, customer ids, email addresses, and dates.
- If the user message is only a SKU or product name, call inventory_agent with that exact text.
- If the user asks to add/check/buy a SKU, call inventory_agent with that exact SKU first.
- If a specialist result contains a SKU/order/customer id needed by the next specialist, copy it exactly into the next tool request.
- Do not paraphrase identifiers. Do not drop hyphens. Do not replace an identifier with a generic phrase.

Examples:
- User: STREAMDECK-MK2
  Call inventory_agent with request: "Look up product details, price, stock, and warehouse for SKU STREAMDECK-MK2."
- User: Sony WF-1000XM5
  Call inventory_agent with request: "Look up product details, price, stock, and warehouse for product Sony WF-1000XM5."
- User: customer 1042 wants a return alternative
  Call orders_agent with request: "List recent orders and return eligibility context for customer id 1042."
- User: order 88231 return?
  Call orders_agent with request: "Check return eligibility and order details for order id 88231."

Specialists:
- orders_agent: customer order history, order details, return eligibility (30-day policy).
- inventory_agent: product catalog, prices, stock, alternatives.
- pricing_agent: whether our price for a product is competitive vs the market.

How to work a case:
1. Break the request into sub-questions and send each to the right specialist. Include all context the specialist needs (ids, SKUs, product names) because they do not see this conversation.
2. Use earlier answers to inform later calls (e.g. first find what the customer bought, then ask inventory for in-stock alternatives to that product).
3. Synthesize one clear recommendation for the support employee: what to tell the customer and what actions to take.

Rules:
- Never invent data; everything must come from the specialists.
- If a specialist reports a blocker (e.g. return window expired), say so and propose the best alternative.
- Answer as a short action plan with the key facts (order, eligibility, suggested replacement with stock/price, price competitiveness).`,
  tools: [ordersAgentTool, inventoryAgentTool, pricingAgentTool],
});
