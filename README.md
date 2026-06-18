# TechParts — ADK TypeScript Multi-Agent Workshop

TechParts is a fictional consumer-electronics retailer. In this workshop you build
three independent agents with [Google ADK for TypeScript](https://github.com/google/adk-js),
deploy each as its own service, then build an **orchestrator** that connects to them
over the **A2A protocol** to resolve support cases end-to-end.

| Agent | Port | Data | Demo question |
|---|---|---|---|
| `agents/inventory` | 8001 | SQLite: products, stock | "Do we have noise-cancelling headphones under $300 in stock?" |
| `agents/orders` | 8002 | SQLite: customers, orders | "Can customer 1042 still return order 88231?" |
| `agents/pricing` | 8003 | SQLite + Google Search | "Are we competitive on the Sony WH-1000XM5?" |
| `agents/orchestrator` | 8004 | none — A2A to the other three | "Customer 1042 wants to return their headphones and get something similar — what can we offer?" |

## Prerequisites

- Node.js >= 24
- A Gemini API key (free): https://aistudio.google.com/apikey

## Setup

```bash
npm install
cp .env.example .env       # then paste your GEMINI_API_KEY
npm run seed               # creates shared/data/techparts.db
```

The dev scripts load `.env` automatically.

## Run

One terminal per agent:

```bash
npm run dev:inventory      # http://localhost:8001
npm run dev:orders         # http://localhost:8002
npm run dev:pricing        # http://localhost:8003
npm run dev:orchestrator   # http://localhost:8004
```

Open each agent's URL in a browser: every agent ships a **debug console** showing
the conversation and every tool call/result. Each agent also exposes its A2A
endpoints (`/.well-known/agent-card.json`, `/rest`, `/jsonrpc`).

The orchestrator finds the workers via env vars (`INVENTORY_AGENT_URL`,
`ORDERS_AGENT_URL`, `PRICING_AGENT_URL`), defaulting to the local ports above —
after deploying the workers, point these at the deployed URLs.

## Tests

```bash
npm test                   # deterministic tests: seed, db tools, server surface
npm run typecheck
```

No API key needed for the tests — nothing in them calls the model.

## Project layout

```
shared/                with the SQLite helper, seed script and the agent
                       server harness (debug console + /api/chat SSE + A2A routes)
agents/inventory/      catalog search + stock tools (SQLite)
agents/orders/         order lookup + 30-day return policy (SQLite)
agents/pricing/        our price (SQLite) + market research sub-agent (Google Search)
agents/orchestrator/   RemoteA2AAgent x3 wrapped as tools — no data of its own
```

## Branches
- `main` — workshop starting point: scaffolding + TODOs
- `solution` — fully implemented reference
