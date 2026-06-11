# TechParts — ADK TypeScript Multi-Agent Project (Design)

Workshop companion project. Four Google ADK (TypeScript) agents for a fictional
consumer-electronics retailer ("TechParts"): three worker agents deployed
independently, one orchestrator that connects to them via the A2A protocol.

Two branches:

- `solution` — fully implemented (built first, reviewed by Armen).
- `main` — same scaffolding with tool implementations and agent definitions
  replaced by TODO stubs (derived from `solution` after review).

Deployment target is TBD (handled by a colleague); everything must run locally
and be deploy-agnostic: agents are plain HTTP servers, peer URLs come from env
vars.

## Repo layout

npm-workspaces monorepo:

```
agents/inventory      # DB agent
agents/orders         # DB agent
agents/pricing        # DB + Google Search agent
agents/orchestrator   # A2A client agent, no own tools
shared/               # SQLite helper, seed script, seed data, console.html
```

Each agent package:

- serves its A2A endpoint (ADK A2A server) on its own port (8001–8004)
- serves a static prebuilt `console.html` at `/` — a chat page that streams
  agent responses and renders tool calls/results as collapsible entries.
  Attendees only open it in a browser; they never edit it.
- `npm run dev` starts the agent; SQLite DB file is copied into the package at
  build/seed time so each deployable unit is self-contained.

## Agents and tools

**Inventory** (port 8001)
- `searchProducts({ query?, category?, maxPrice? })` → SQLite
- `getStock(sku)` → SQLite
- Standalone demo: "Do we have noise-cancelling headphones under $300 in stock?"

**Orders** (port 8002)
- `getCustomerOrders(customerId)`, `getOrderDetails(orderId)`,
  `checkReturnEligibility(orderId)` (30-day policy applied in code) → SQLite
- Standalone demo: "Can customer #1042 still return order #88231?"

**Pricing** (port 8003)
- `getOurPrice(sku)` → SQLite
- `marketResearch` — a sub-agent using ADK's built-in `googleSearch`, wrapped
  in `AgentTool` (built-in tools cannot be mixed with function tools on the
  same agent — deliberate teaching point about agent composition)
- Standalone demo: "Are we competitive on the Sony WH-1000XM5?"

**Orchestrator** (port 8004)
- No own tools. Three `RemoteA2aAgent` references; URLs from env vars
  (`INVENTORY_AGENT_URL`, `ORDERS_AGENT_URL`, `PRICING_AGENT_URL`), defaulting
  to the local ports.
- Flagship demo: "Customer #1042 wants to return their headphones and get
  something similar — what can we offer?" → orders verifies purchase and
  return eligibility, inventory finds in-stock alternatives, pricing confirms
  competitiveness.

## Data

Single seeded SQLite database (file shipped via seed script in `shared/`):

- ~20 products — real, searchable consumer-electronics SKUs (e.g. Sony
  WH-1000XM5) with category, price, stock, warehouse location
- ~10 customers
- ~30 orders; customer #1042 has a headphones order placed ~3 weeks before a
  fixed "today" reference so return eligibility is just barely satisfied

## Tech notes / risks

- Use Google's **official ADK for TypeScript** package; exact package name,
  A2A server/client API, and `googleSearch` + `AgentTool` support must be
  verified against current docs during planning (the TS ADK is new; API may
  differ from Python ADK).
- Model: current Gemini Flash via `GOOGLE_API_KEY` (AI Studio) so attendees
  don't need a GCP project for the agent-building part.
- SQLite driver: `better-sqlite3` (sync, simple) unless ADK constraints say
  otherwise.

## Verification

- Each agent answers its standalone demo query via its HTML console, with
  visible tool calls.
- Orchestrator answers the flagship query end-to-end against the three
  locally running agents over A2A.
