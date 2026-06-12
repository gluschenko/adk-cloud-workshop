import { AgentTool, GOOGLE_SEARCH, LlmAgent } from '@google/adk';
import { getOurPriceTool } from './tools.ts';

// Built-in tools like GOOGLE_SEARCH live on their own agent; we expose that agent
// to the root agent as a tool (AgentTool). This is ADK's composition pattern for
// combining built-in tools with custom function tools.
const marketResearchAgent = new LlmAgent({
  name: 'market_research',
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  description:
    'Searches the public web for current competitor prices and availability of consumer-electronics products.',
  instruction: `You research current market prices for consumer-electronics products using Google Search.
Given a product, search for its current price at major retailers (Amazon, Best Buy, the manufacturer's store).
Report the retailer names and prices you found, with a one-line summary of the typical street price.
Report only what the search results support; if results are unclear, say so.`,
  tools: [GOOGLE_SEARCH],
});

export const rootAgent = new LlmAgent({
  name: 'pricing_agent',
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  description:
    'Compares TechParts prices against the current market: looks up our price and researches competitor prices on the web.',
  instruction: `You are the pricing agent for TechParts, a consumer-electronics retailer. You assist internal staff with pricing decisions.

Use your tools:
- get_our_price for TechParts' own price of a product.
- market_research to find current competitor prices on the web.

When asked whether a price is competitive, ALWAYS do both: fetch our price AND run market research, then compare.
Conclude clearly: are we cheaper, in line, or more expensive — and by roughly how much.
Be concise; cite the retailer prices market_research found.`,
  tools: [getOurPriceTool, new AgentTool({ agent: marketResearchAgent })],
});
