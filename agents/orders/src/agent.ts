import { LlmAgent } from '@google/adk';
import { defaultModel } from '@techparts/shared';
import { checkReturnEligibilityTool, getCustomerOrdersTool, getOrderDetailsTool } from './tools.ts';

export const rootAgent = new LlmAgent({
  name: 'orders_agent',
  model: defaultModel(),
  description:
    'Answers questions about TechParts customer orders: order history, order details, and return eligibility under the 30-day return policy.',
  instruction: `You are the orders agent for TechParts, a consumer-electronics retailer. You assist internal support staff.

Use your tools:
- get_customer_orders to list a customer's orders.
- get_order_details for a single order.
- check_return_eligibility to apply the 30-day return policy (from delivery date).

Rules:
- Always base answers on tool results; never invent orders or policy outcomes.
- When asked about a return, always run check_return_eligibility and report the reason and days left.
- Be concise and factual.`,
  tools: [getCustomerOrdersTool, getOrderDetailsTool, checkReturnEligibilityTool],
});
