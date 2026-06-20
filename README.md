# TechParts - ADK TypeScript Multi-Agent Workshop

TechParts is a fictional consumer-electronics retailer. In this workshop you build
three independent agents with [Google ADK for TypeScript](https://github.com/google/adk-js),
deploy each as its own service, then build an **orchestrator** that connects to them
over the **A2A protocol** to resolve support cases end-to-end.

| Agent | Port | Data | Demo question |
|---|---|---|---|
| `agents/inventory` | 8001 | SQLite: products, stock | "Do we have noise-cancelling headphones under $300 in stock?" |
| `agents/orders` | 8002 | SQLite: customers, orders | "Can customer 1042 still return order 88231?" |
| `agents/pricing` | 8003 | SQLite + public market research | "Are we competitive on the Sony WH-1000XM5?" |
| `agents/orchestrator` | 8004 | none - A2A to the other three | "Customer 1042 wants to return their headphones and get something similar - what can we offer?" |

## Prerequisites

- Node.js >= 24
- Python >= 3.10. If Python is not in `PATH`, set `PYTHON=C:\path\to\python.exe`.
- Enough local disk/RAM to download and run `litert-community/gemma-4-E4B-it-litert-lm`

## Setup

```bash
npm install
cp .env.example .env
npm run gemma:setup        # creates .venv and installs litert-lm
npm run gemma:download     # downloads native quantized gemma-4-E4B-it.litertlm with Onnxify CLI
npm run gemma:import       # imports the local .litertlm file as gemma4-e4b-native-q
npm run seed               # creates shared/data/techparts.db
```

The dev scripts load `.env` automatically.

## Run

One terminal per service:

```bash
npm run dev:gemma          # http://localhost:8010
npm run dev:inventory      # http://localhost:8001
npm run dev:orders         # http://localhost:8002
npm run dev:pricing        # http://localhost:8003
npm run dev:orchestrator   # http://localhost:8004
```

Open each agent's URL in a browser: every agent ships a **debug console** showing
the conversation and every tool call/result. Each agent also exposes its A2A
endpoints (`/.well-known/agent-card.json`, `/rest`, `/jsonrpc`).

All four ADK `LlmAgent`s use the local Gemma service via `GEMMA_SERVICE_URL`;
they do not call Gemini. `npm run dev:gemma` starts the official LiteRT-LM
OpenAI-compatible server on port 8010. The `gemma:import` step imports
`models/gemma4-e4b-native-q/gemma-4-E4B-it.litertlm` into the local LiteRT-LM
registry as `gemma4-e4b-native-q`; `gemma:download` gets only that native
quantized LiteRT file through Onnxify CLI. Do not use `gemma-4-E4B-it-web.litertlm`
with `litert-lm serve`; it is a Web/WebGPU-specific artifact.

The orchestrator finds the workers via env vars (`INVENTORY_AGENT_URL`,
`ORDERS_AGENT_URL`, `PRICING_AGENT_URL`), defaulting to the local ports above.
After deploying the workers, point these at the deployed URLs.

## Tests

```bash
npm test                   # deterministic tests: seed, db tools, server surface
npm run typecheck
```

No API key needed for the tests - nothing in them calls the model.

## Project layout

```text
shared/                SQLite helper, seed script, Gemma OpenAI adapter,
                       server harness (debug console + /api/chat SSE + A2A routes)
agents/inventory/      catalog search + stock tools (SQLite)
agents/orders/         order lookup + 30-day return policy (SQLite)
agents/pricing/        our price (SQLite) + market research tool
agents/orchestrator/   RemoteA2AAgent x3 wrapped as tools - no data of its own
```

## Branches

- `main` - workshop starting point: scaffolding + TODOs
- `solution` - fully implemented reference
