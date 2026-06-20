import { AgentTool, LlmAgent, RemoteA2AAgent } from '@google/adk';
import { defaultModel } from '@techparts/shared';

const INVENTORY_URL = process.env.INVENTORY_AGENT_URL ?? 'http://localhost:8001';
const ORDERS_URL = process.env.ORDERS_AGENT_URL ?? 'http://localhost:8002';
const PRICING_URL = process.env.PRICING_AGENT_URL ?? 'http://localhost:8003';

// Each worker runs as its own service; we connect to it over the A2A protocol.
// RemoteA2AAgent fetches <base url>/.well-known/agent-card.json to discover the agent,
// and AgentTool exposes it to the orchestrator as a callable tool.
const inventoryAgent = new RemoteA2AAgent({
  name: 'inventory_agent',
  description:
    'Knows the TechParts product catalog: products, prices, stock levels and warehouse locations. Ask it to find products or check stock.',
  agentCard: INVENTORY_URL,
});

const ordersAgent = new RemoteA2AAgent({
  name: 'orders_agent',
  description:
    'Knows TechParts customer orders: order history, order details, and return eligibility under the 30-day policy. Ask it about customers and orders.',
  agentCard: ORDERS_URL,
});

const pricingAgent = new RemoteA2AAgent({
  name: 'pricing_agent',
  description:
    'Compares TechParts prices with the market: our price for a product plus live competitor prices from the web.',
  agentCard: PRICING_URL,
});

export const rootAgent = new LlmAgent({
  name: 'ops_orchestrator',
  model: defaultModel(),
  description:
    'TechParts operations assistant for support staff. Coordinates the inventory, orders and pricing agents to resolve customer cases end-to-end.',
  instruction: `You are the TechParts operations assistant used by internal support staff.

You have no data of your own. Three specialist agents do the work; call them as tools and pass them clear, self-contained natural-language requests:
- orders_agent: customer order history, order details, return eligibility (30-day policy).
- inventory_agent: product catalog, prices, stock, alternatives.
- pricing_agent: whether our price for a product is competitive vs the market.

How to work a case:
1. Break the request into sub-questions and send each to the right specialist. Include all context the specialist needs (ids, SKUs, product names) — they do not see this conversation.
2. Use earlier answers to inform later calls (e.g. first find what the customer bought, then ask inventory for in-stock alternatives to that product).
3. Synthesize one clear recommendation for the support employee: what to tell the customer and what actions to take.

Rules:
- Never invent data; everything must come from the specialists.
- If a specialist reports a blocker (e.g. return window expired), say so and propose the best alternative.
- Answer as a short action plan with the key facts (order, eligibility, suggested replacement with stock/price, price competitiveness).`,
  tools: [
    new AgentTool({ agent: ordersAgent }),
    new AgentTool({ agent: inventoryAgent }),
    new AgentTool({ agent: pricingAgent }),
  ],
});
