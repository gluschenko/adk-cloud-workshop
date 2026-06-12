# TechParts Solution Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fully-working `solution` branch of the TechParts workshop monorepo: three ADK TypeScript worker agents (inventory, orders, pricing) each serving an A2A endpoint plus a browser debug console, and an orchestrator agent consuming them via `RemoteA2AAgent`.

**Architecture:** npm-workspaces monorepo. A `shared` package owns the SQLite database (built-in `node:sqlite`, seeded by script), and a reusable server harness: an Express app that serves a prebuilt `console.html` at `/`, a custom `/api/chat` SSE endpoint (driven by an ADK `Runner`, streaming tool calls/results/text to the console), and the A2A routes mounted by ADK's `toA2a()`. Each agent package defines its tools + `LlmAgent` and calls the harness with its port. The orchestrator has no own tools — it wraps three `RemoteA2AAgent` instances in `AgentTool`s so it can query them and compose an answer.

**Tech Stack:** `@google/adk` ^1.2.0, zod, express, `node:sqlite` (Node ≥ 24.13), tsx (run TS directly, no build step), vitest, TypeScript (typecheck only, `noEmit`).

**Verified API facts (from live docs/source, June 2026 — do not "correct" these from memory):**
- Package: `@google/adk` (official, github.com/google/adk-js). Dev CLI `@google/adk-devtools` NOT needed here.
- `new FunctionTool({name, description, parameters: z.object(...), execute})`.
- `new LlmAgent({name, model, description, instruction, tools})`. Model: `gemini-2.5-flash`.
- Built-in search: `GOOGLE_SEARCH` constant; wrap in a sub-agent + `new AgentTool({agent})` (canonical safe composition; mixing is allowed on Gemini 2.x but we teach the composition pattern).
- Expose A2A: `const app = await toA2a(agent, {app?, port})` — returns/mounts on an Express app; routes: `/.well-known/agent-card.json`, `/rest`, `/jsonrpc`. You call `app.listen()` yourself.
- Consume A2A: `new RemoteA2AAgent({name, description, agentCard: '<base url>'})` (note `A2A` capitalization); resolver fetches `<base>/.well-known/agent-card.json`. Extends `BaseAgent`, so it can be wrapped in `AgentTool`.
- Run programmatically: `new Runner({appName, agent, sessionService: new InMemorySessionService()})`; `runner.runAsync({userId, sessionId, newMessage}) → AsyncGenerator<Event>`. Event helpers are free functions: `getFunctionCalls(event)`, `getFunctionResponses(event)`, `isFinalResponse(event)`, `stringifyContent(event)`.
- Auth: `GEMINI_API_KEY` env var (TS ADK does NOT read `GOOGLE_API_KEY`).
- ESM-first: root `"type": "module"` everywhere.

**Execution notes for workers:**
- If a verified API detail above still fails to typecheck (the TS ADK moves fast), inspect `node_modules/@google/adk/dist/**/*.d.ts` for the real signature and adapt — do not guess.
- LLM-dependent behavior (agent answers) is verified manually at the end; automated tests cover only deterministic code (DB, tools, policy logic, HTTP surface that doesn't call the model).
- All commands run from repo root `D:\Work new\Workshops\Free\adk-cloud` unless stated. Branch: `solution`.

---

### Task 1: Monorepo scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Check Node version**

Run: `node --version`
Expected: v24.13.0 or newer (needed by `@google/adk` and `node:sqlite`). If older, stop and report.

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "techparts-workshop",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "agents/*"],
  "scripts": {
    "seed": "tsx shared/src/seed.ts",
    "dev:inventory": "tsx agents/inventory/src/server.ts",
    "dev:orders": "tsx agents/orders/src/server.ts",
    "dev:pricing": "tsx agents/pricing/src/server.ts",
    "dev:orchestrator": "tsx agents/orchestrator/src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=24.13.0" },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/express": "^4.17.21",
    "@types/node": "^24.0.0"
  }
}
```

- [ ] **Step 3: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["shared/src/**/*.ts", "agents/*/src/**/*.ts", "agents/*/test/**/*.ts", "shared/test/**/*.ts"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
shared/data/*.db
.env
dist/
```

- [ ] **Step 5: Create `.env.example`**

```
# Gemini API key from https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Orchestrator -> worker agent base URLs (defaults shown; override after cloud deploy)
INVENTORY_AGENT_URL=http://localhost:8001
ORDERS_AGENT_URL=http://localhost:8002
PRICING_AGENT_URL=http://localhost:8003
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: monorepo scaffolding (workspaces, tsconfig, env template)"
```

---

### Task 2: Shared package — DB helper and seed script

**Files:**
- Create: `shared/package.json`, `shared/src/db.ts`, `shared/src/seed.ts`, `shared/src/index.ts`
- Test: `shared/test/seed.test.ts`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@techparts/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "@google/adk": "^1.2.0",
    "express": "^4.22.0",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write `shared/src/db.ts`**

```typescript
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_DB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'techparts.db',
);

export function dbPath(): string {
  return process.env.TECHPARTS_DB ?? DEFAULT_DB_PATH;
}

export function openDb(): DatabaseSync {
  return new DatabaseSync(dbPath());
}
```

- [ ] **Step 3: Write the failing seed test `shared/test/seed.test.ts`**

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seed } from '../src/seed.ts';
import { openDb } from '../src/db.ts';

beforeAll(() => {
  process.env.TECHPARTS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'techparts-')), 'test.db');
  seed();
});

describe('seed', () => {
  it('creates at least 20 products with stock and prices', () => {
    const db = openDb();
    const rows = db.prepare('SELECT * FROM products').all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.price > 0)).toBe(true);
  });

  it('seeds the flagship demo order: #88231, customer 1042, Sony WH-1000XM5, delivered 21 days ago', () => {
    const db = openDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = 88231').get() as any;
    expect(order.customer_id).toBe(1042);
    expect(order.sku).toBe('SONY-WH1000XM5');
    expect(order.status).toBe('delivered');
    const ageDays = (Date.now() - Date.parse(order.delivered_date)) / 86_400_000;
    expect(ageDays).toBeGreaterThan(20);
    expect(ageDays).toBeLessThan(30); // still return-eligible
  });

  it('is idempotent', () => {
    seed();
    seed();
    const db = openDb();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM customers').get() as any;
    expect(n).toBeLessThan(30);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm install` (first time) then `npx vitest run shared/test/seed.test.ts`
Expected: FAIL — cannot resolve `../src/seed.ts`.

- [ ] **Step 5: Write `shared/src/seed.ts`**

Dates are relative to seed time so the demo order is always "just barely eligible"; re-running `npm run seed` refreshes them.

```typescript
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './db.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// [sku, name, category, price, stock, warehouse]
const PRODUCTS: [string, string, string, number, number, string][] = [
  ['SONY-WH1000XM5', 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', 'headphones', 349.99, 12, 'A'],
  ['SONY-WH1000XM4', 'Sony WH-1000XM4 Wireless Noise Cancelling Headphones', 'headphones', 279.99, 5, 'A'],
  ['BOSE-QC-ULTRA', 'Bose QuietComfort Ultra Headphones', 'headphones', 379.99, 8, 'B'],
  ['JBL-TUNE770NC', 'JBL Tune 770NC Wireless Headphones', 'headphones', 99.99, 30, 'B'],
  ['APPLE-AIRPODSPRO2', 'Apple AirPods Pro 2 (USB-C)', 'earbuds', 229.99, 25, 'A'],
  ['SONY-WF1000XM5', 'Sony WF-1000XM5 Wireless Earbuds', 'earbuds', 299.99, 0, 'A'],
  ['LOGI-MXMASTER3S', 'Logitech MX Master 3S Wireless Mouse', 'accessories', 99.99, 40, 'B'],
  ['LOGI-MXKEYS-S', 'Logitech MX Keys S Wireless Keyboard', 'keyboards', 109.99, 18, 'B'],
  ['KEYCHRON-K8PRO', 'Keychron K8 Pro Mechanical Keyboard', 'keyboards', 99.99, 7, 'A'],
  ['DELL-U2723QE', 'Dell UltraSharp U2723QE 27" 4K Monitor', 'monitors', 619.99, 4, 'B'],
  ['LG-27UP850N', 'LG 27UP850N 27" 4K UHD Monitor', 'monitors', 449.99, 9, 'B'],
  ['SAMSUNG-T7-1TB', 'Samsung T7 Portable SSD 1TB', 'storage', 109.99, 50, 'A'],
  ['SANDISK-EXT-2TB', 'SanDisk Extreme Portable SSD 2TB', 'storage', 159.99, 22, 'A'],
  ['ANKER-737-PB', 'Anker 737 Power Bank 24,000mAh', 'charging', 109.99, 35, 'B'],
  ['ANKER-NANO-65W', 'Anker Nano II 65W USB-C Charger', 'charging', 35.99, 60, 'B'],
  ['RPI-5-8GB', 'Raspberry Pi 5 8GB', 'computers', 79.99, 15, 'A'],
  ['STREAMDECK-MK2', 'Elgato Stream Deck MK.2', 'accessories', 149.99, 11, 'A'],
  ['SHURE-MV7PLUS', 'Shure MV7+ USB/XLR Podcast Microphone', 'audio', 279.99, 6, 'B'],
  ['BLUE-YETI', 'Logitech Blue Yeti USB Microphone', 'audio', 129.99, 14, 'B'],
  ['SONY-ZVE10II', 'Sony ZV-E10 II Vlog Camera (Body)', 'cameras', 998.0, 2, 'A'],
];

// [id, name, email]
const CUSTOMERS: [number, string, string][] = [
  [1001, 'Maria Petrosyan', 'maria.petrosyan@example.com'],
  [1002, 'David Chen', 'david.chen@example.com'],
  [1003, 'Anna Kovacs', 'anna.kovacs@example.com'],
  [1004, 'Tigran Sargsyan', 'tigran.sargsyan@example.com'],
  [1005, 'Sophie Laurent', 'sophie.laurent@example.com'],
  [1006, 'James Okafor', 'james.okafor@example.com'],
  [1007, 'Lena Fischer', 'lena.fischer@example.com'],
  [1008, 'Omar Haddad', 'omar.haddad@example.com'],
  [1009, 'Priya Sharma', 'priya.sharma@example.com'],
  [1042, 'Alex Morgan', 'alex.morgan@example.com'],
];

// [id, customer_id, sku, quantity, status, ordered_days_ago, delivered_days_ago | null]
const ORDERS: [number, number, string, number, string, number, number | null][] = [
  // Flagship demo order: just barely return-eligible (30-day policy, delivered 21 days ago)
  [88231, 1042, 'SONY-WH1000XM5', 1, 'delivered', 24, 21],
  [88102, 1042, 'ANKER-NANO-65W', 2, 'delivered', 60, 56],
  [88240, 1042, 'SAMSUNG-T7-1TB', 1, 'shipped', 3, null],
  [88105, 1001, 'DELL-U2723QE', 1, 'delivered', 45, 41],
  [88110, 1001, 'LOGI-MXMASTER3S', 1, 'delivered', 44, 41],
  [88133, 1002, 'KEYCHRON-K8PRO', 1, 'delivered', 35, 31], // just past the 30-day window
  [88150, 1002, 'BLUE-YETI', 1, 'returned', 50, 47],
  [88161, 1003, 'APPLE-AIRPODSPRO2', 1, 'delivered', 28, 25],
  [88170, 1003, 'ANKER-737-PB', 1, 'processing', 1, null],
  [88180, 1004, 'RPI-5-8GB', 3, 'delivered', 18, 14],
  [88188, 1004, 'SANDISK-EXT-2TB', 1, 'delivered', 18, 14],
  [88195, 1005, 'BOSE-QC-ULTRA', 1, 'delivered', 10, 6],
  [88201, 1005, 'STREAMDECK-MK2', 1, 'cancelled', 9, null],
  [88210, 1006, 'SONY-ZVE10II', 1, 'delivered', 90, 85],
  [88215, 1006, 'SHURE-MV7PLUS', 1, 'delivered', 12, 8],
  [88220, 1007, 'LG-27UP850N', 2, 'delivered', 22, 17],
  [88225, 1007, 'LOGI-MXKEYS-S', 1, 'shipped', 2, null],
  [88228, 1008, 'JBL-TUNE770NC', 1, 'delivered', 7, 4],
  [88233, 1009, 'SONY-WH1000XM4', 1, 'delivered', 65, 61],
  [88236, 1009, 'SAMSUNG-T7-1TB', 2, 'processing', 1, null],
];

export function seed(): void {
  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS products;
    CREATE TABLE products (
      sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price REAL NOT NULL, stock INTEGER NOT NULL, warehouse TEXT NOT NULL
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sku TEXT NOT NULL REFERENCES products(sku),
      quantity INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing','shipped','delivered','returned','cancelled')),
      order_date TEXT NOT NULL,
      delivered_date TEXT
    );
  `);

  const insProduct = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)');
  for (const p of PRODUCTS) insProduct.run(...p);

  const insCustomer = db.prepare('INSERT INTO customers VALUES (?, ?, ?)');
  for (const c of CUSTOMERS) insCustomer.run(...c);

  const priceOf = new Map(PRODUCTS.map((p) => [p[0], p[3]]));
  const insOrder = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [id, customerId, sku, qty, status, orderedDaysAgo, deliveredDaysAgo] of ORDERS) {
    insOrder.run(
      id, customerId, sku, qty,
      Math.round(priceOf.get(sku)! * qty * 100) / 100,
      status, daysAgo(orderedDaysAgo),
      deliveredDaysAgo === null ? null : daysAgo(deliveredDaysAgo),
    );
  }
  db.close();
  console.log(`Seeded ${PRODUCTS.length} products, ${CUSTOMERS.length} customers, ${ORDERS.length} orders -> ${file}`);
}

// Run directly: `npm run seed`
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  seed();
}
```

Note: the `import.meta.url` guard is Windows-fiddly; if it misbehaves, simply always call `seed()` when the module is the entrypoint via `process.argv[1]?.endsWith('seed.ts')` instead. The test imports `seed` explicitly, so accidental double-seeding is harmless (idempotent).

- [ ] **Step 6: Write `shared/src/index.ts`**

```typescript
export { openDb, dbPath } from './db.ts';
export { seed } from './seed.ts';
export { startAgentServer } from './server.ts';
```

(`server.ts` arrives in Task 3 — leave that export line commented out until then if it breaks the test run: vitest only loads imported files, so it's fine to keep it only if the file exists. Create `server.ts` as an empty placeholder export if needed: `export {}`. Simpler: write `index.ts` WITHOUT the server export now, add it in Task 3.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run shared/test/seed.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 8: Seed the real DB and commit**

Run: `npm run seed`
Expected: `Seeded 20 products, 10 customers, 20 orders -> ...shared\data\techparts.db`

```bash
git add -A && git commit -m "feat: shared package with sqlite db helper and seed script"
```

---

### Task 3: Shared server harness + browser console

**Files:**
- Create: `shared/src/server.ts`, `shared/src/console.html`
- Modify: `shared/src/index.ts` (add `startAgentServer` export)
- Test: `shared/test/server.test.ts`

- [ ] **Step 1: Write the failing server test `shared/test/server.test.ts`**

Tests the HTTP surface that doesn't need the LLM: console page served at `/`, A2A agent card at the well-known path.

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmAgent } from '@google/adk';
import type { Server } from 'node:http';
import { startAgentServer } from '../src/server.ts';

let server: Server;
const PORT = 8941;

beforeAll(async () => {
  const agent = new LlmAgent({
    name: 'test_agent',
    model: 'gemini-2.5-flash',
    description: 'Test agent for the harness.',
    instruction: 'You are a test agent.',
  });
  server = await startAgentServer({ agent, port: PORT, title: 'Test Agent' });
});

afterAll(() => server?.close());

describe('startAgentServer', () => {
  it('serves the debug console at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>Test Agent</title>');
    expect(html).toContain('/api/chat');
  });

  it('serves the A2A agent card at the well-known path', async () => {
    const res = await fetch(`http://localhost:${PORT}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe('test_agent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/test/server.test.ts`
Expected: FAIL — `startAgentServer` not found.

- [ ] **Step 3: Write `shared/src/server.ts`**

```typescript
import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import {
  type BaseAgent,
  InMemorySessionService,
  Runner,
  getFunctionCalls,
  getFunctionResponses,
  isFinalResponse,
  stringifyContent,
  toA2a,
} from '@google/adk';

const CONSOLE_HTML = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'console.html'),
  'utf8',
);

export interface AgentServerOptions {
  agent: BaseAgent;
  port: number;
  title: string;
}

/**
 * Starts an Express server that hosts:
 *  - GET  /                 the debug console (prebuilt HTML chat UI)
 *  - POST /api/chat         SSE stream of agent events for the console
 *  - A2A routes mounted by ADK's toA2a(): /.well-known/agent-card.json, /rest, /jsonrpc
 */
export async function startAgentServer({ agent, port, title }: AgentServerOptions): Promise<Server> {
  const app = express();
  app.use(express.json());

  const sessionService = new InMemorySessionService();
  const runner = new Runner({ appName: agent.name, agent, sessionService });

  app.get('/', (_req, res) => {
    res.type('html').send(CONSOLE_HTML.replaceAll('{{TITLE}}', title));
  });

  app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body as { sessionId: string; message: string };
    if (!sessionId || !message) {
      res.status(400).json({ error: 'sessionId and message are required' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const existing = await sessionService.getSession({ appName: agent.name, userId: 'console', sessionId });
      if (!existing) {
        await sessionService.createSession({ appName: agent.name, userId: 'console', sessionId });
      }
      for await (const event of runner.runAsync({
        userId: 'console',
        sessionId,
        newMessage: { role: 'user', parts: [{ text: message }] },
      })) {
        for (const call of getFunctionCalls(event)) {
          send('tool_call', { agent: event.author, name: call.name, args: call.args });
        }
        for (const result of getFunctionResponses(event)) {
          send('tool_result', { agent: event.author, name: result.name, response: result.response });
        }
        if (isFinalResponse(event)) {
          const text = stringifyContent(event);
          if (text) send('text', { agent: event.author, text });
        }
      }
      send('done', {});
    } catch (err) {
      send('error', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  });

  await toA2a(agent, { app, port });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[${agent.name}] console:  http://localhost:${port}/`);
      console.log(`[${agent.name}] A2A card: http://localhost:${port}/.well-known/agent-card.json`);
      resolve(server);
    });
  });
}
```

API-drift fallbacks (check `.d.ts` if compilation fails): `sessionService.getSession`/`createSession` argument shapes; some versions expose `getOrCreateSession` — prefer that if present. If `toA2a` does not accept an `app` option in the installed version, call `const a2aApp = await toA2a(agent, {port})` and mount our routes onto the returned app instead (`a2aApp.get('/', ...)` etc. — register `/` and `/api/chat` BEFORE any catch-all the A2A handler may add, or use `app.use`).

- [ ] **Step 4: Write `shared/src/console.html`**

Self-contained, zero dependencies, dark theme. Talks to `/api/chat`, renders text bubbles and collapsible tool call/result entries.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{TITLE}}</title>
<style>
  :root { --bg:#0f1117; --panel:#181b24; --border:#2a2f3d; --text:#e6e8ee; --muted:#8b91a3;
          --accent:#4f8cff; --tool:#c79a4b; --ok:#4bc78a; --err:#e05c5c; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--text);
         display:flex; flex-direction:column; height:100vh; }
  header { padding:14px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
  header h1 { font-size:16px; margin:0; font-weight:600; }
  header .dot { width:9px; height:9px; border-radius:50%; background:var(--ok); }
  header .sub { color:var(--muted); font-size:12px; margin-left:auto; }
  #log { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:10px; }
  .msg { max-width:75%; padding:10px 14px; border-radius:12px; white-space:pre-wrap; word-wrap:break-word; }
  .user { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .agent { align-self:flex-start; background:var(--panel); border:1px solid var(--border); border-bottom-left-radius:4px; }
  details.tool { align-self:flex-start; max-width:75%; background:transparent; border:1px dashed var(--border);
                 border-radius:10px; padding:6px 12px; font-size:13px; color:var(--muted); }
  details.tool summary { cursor:pointer; user-select:none; }
  details.tool summary .name { color:var(--tool); font-family:ui-monospace, monospace; }
  details.tool summary .who { color:var(--muted); font-size:11px; }
  details.tool pre { margin:8px 0 4px; padding:10px; background:var(--panel); border-radius:8px;
                     overflow-x:auto; font-size:12px; color:var(--text); }
  .result summary .name { color:var(--ok); }
  .error { align-self:center; color:var(--err); font-size:13px; }
  .thinking { align-self:flex-start; color:var(--muted); font-size:13px; padding:4px 14px; }
  .thinking::after { content:'…'; animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity:.3; } }
  form { display:flex; gap:10px; padding:14px 20px; border-top:1px solid var(--border); }
  input { flex:1; padding:11px 14px; border-radius:10px; border:1px solid var(--border);
          background:var(--panel); color:var(--text); font-size:15px; outline:none; }
  input:focus { border-color:var(--accent); }
  button { padding:11px 20px; border-radius:10px; border:none; background:var(--accent);
           color:#fff; font-size:15px; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
</style>
</head>
<body>
<header>
  <span class="dot"></span>
  <h1>{{TITLE}}</h1>
  <span class="sub">TechParts agent debug console</span>
</header>
<div id="log"></div>
<form id="form">
  <input id="input" placeholder="Ask the agent…" autocomplete="off" autofocus />
  <button id="send" type="submit">Send</button>
</form>
<script>
  const log = document.getElementById('log');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const sessionId = crypto.randomUUID();

  const scroll = () => log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });

  function addMsg(cls, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + cls;
    el.textContent = text;
    log.appendChild(el); scroll();
    return el;
  }

  function addTool(kind, data) {
    const el = document.createElement('details');
    el.className = 'tool' + (kind === 'result' ? ' result' : '');
    const icon = kind === 'result' ? '✓' : '⚙';
    const body = kind === 'result' ? data.response : data.args;
    el.innerHTML = '<summary>' + icon + ' <span class="name"></span> <span class="who"></span></summary><pre></pre>';
    el.querySelector('.name').textContent = data.name + (kind === 'result' ? ' → result' : '()');
    el.querySelector('.who').textContent = 'by ' + data.agent;
    el.querySelector('pre').textContent = JSON.stringify(body, null, 2);
    log.appendChild(el); scroll();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    sendBtn.disabled = true;
    addMsg('user', message);
    const thinking = document.createElement('div');
    thinking.className = 'thinking';
    thinking.textContent = 'thinking';
    log.appendChild(thinking); scroll();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop();
        for (const chunk of chunks) {
          let event = 'message', data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7);
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!data) continue;
          const payload = JSON.parse(data);
          if (event === 'tool_call') addTool('call', payload);
          else if (event === 'tool_result') addTool('result', payload);
          else if (event === 'text') addMsg('agent', payload.text);
          else if (event === 'error') addMsg('error', '⚠ ' + payload.message);
        }
      }
    } catch (err) {
      addMsg('error', '⚠ ' + err.message);
    } finally {
      thinking.remove();
      sendBtn.disabled = false;
      input.focus();
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 5: Add the export to `shared/src/index.ts`**

Final content:

```typescript
export { openDb, dbPath } from './db.ts';
export { seed } from './seed.ts';
export { startAgentServer } from './server.ts';
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run shared/test/server.test.ts && npm run typecheck`
Expected: 2 tests PASS, no type errors. (No `GEMINI_API_KEY` needed — nothing calls the model.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: shared agent server harness with A2A endpoint and browser debug console"
```

---

### Task 4: Inventory agent

**Files:**
- Create: `agents/inventory/package.json`, `agents/inventory/src/tools.ts`, `agents/inventory/src/agent.ts`, `agents/inventory/src/server.ts`
- Test: `agents/inventory/test/tools.test.ts`

- [ ] **Step 1: Create `agents/inventory/package.json`**

```json
{
  "name": "@techparts/agent-inventory",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@google/adk": "^1.2.0",
    "@techparts/shared": "*",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write the failing tool tests `agents/inventory/test/tools.test.ts`**

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm install` (links new workspace) then `npx vitest run agents/inventory/test/tools.test.ts`
Expected: FAIL — `../src/tools.ts` missing.

- [ ] **Step 4: Write `agents/inventory/src/tools.ts`**

Pure functions first (testable), `FunctionTool` wrappers below.

```typescript
import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

export interface ProductRow {
  sku: string; name: string; category: string; price: number; stock: number; warehouse: string;
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
    query: z.string().optional().describe('Free-text search over product name, category and SKU, e.g. "noise cancelling headphones".'),
    category: z.string().optional().describe('Exact category: headphones, earbuds, keyboards, monitors, storage, charging, computers, accessories, audio, cameras.'),
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run agents/inventory/test/tools.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Write `agents/inventory/src/agent.ts`**

```typescript
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
```

- [ ] **Step 7: Write `agents/inventory/src/server.ts`**

```typescript
import { startAgentServer } from '@techparts/shared';
import { rootAgent } from './agent.ts';

await startAgentServer({
  agent: rootAgent,
  port: Number(process.env.PORT ?? 8001),
  title: 'TechParts — Inventory Agent',
});
```

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A && git commit -m "feat: inventory agent (catalog search + stock tools)"
```

---

### Task 5: Orders agent

**Files:**
- Create: `agents/orders/package.json`, `agents/orders/src/tools.ts`, `agents/orders/src/agent.ts`, `agents/orders/src/server.ts`
- Test: `agents/orders/test/tools.test.ts`

- [ ] **Step 1: Create `agents/orders/package.json`**

Same as inventory's with name `@techparts/agent-orders`:

```json
{
  "name": "@techparts/agent-orders",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@google/adk": "^1.2.0",
    "@techparts/shared": "*",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write the failing tool tests `agents/orders/test/tools.test.ts`**

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seed } from '@techparts/shared';
import { getCustomerOrders, getOrderDetails, checkReturnEligibility } from '../src/tools.ts';

beforeAll(() => {
  process.env.TECHPARTS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'techparts-')), 'test.db');
  seed();
});

describe('getCustomerOrders', () => {
  it('lists all orders for customer 1042 with product names', () => {
    const result = getCustomerOrders({ customerId: 1042 });
    expect(result.customer?.name).toBe('Alex Morgan');
    expect(result.orders.length).toBe(3);
    expect(result.orders.find((o) => o.id === 88231)?.productName).toContain('WH-1000XM5');
  });

  it('reports unknown customers clearly', () => {
    expect(getCustomerOrders({ customerId: 9999 })).toHaveProperty('error');
  });
});

describe('getOrderDetails', () => {
  it('returns full details for an order', () => {
    const result = getOrderDetails({ orderId: 88231 });
    expect(result).toMatchObject({ id: 88231, customerId: 1042, sku: 'SONY-WH1000XM5', status: 'delivered' });
  });

  it('reports unknown orders clearly', () => {
    expect(getOrderDetails({ orderId: 1 })).toHaveProperty('error');
  });
});

describe('checkReturnEligibility (30-day policy from delivery date)', () => {
  it('order 88231 (delivered 21 days ago) is eligible with ~9 days left', () => {
    const result = checkReturnEligibility({ orderId: 88231 });
    expect(result.eligible).toBe(true);
    expect(result.daysLeft).toBeGreaterThanOrEqual(8);
    expect(result.daysLeft).toBeLessThanOrEqual(9);
  });

  it('order 88133 (delivered 31 days ago) is past the window', () => {
    const result = checkReturnEligibility({ orderId: 88133 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/window|30/i);
  });

  it('undelivered orders are not eligible', () => {
    const result = checkReturnEligibility({ orderId: 88240 }); // status: shipped
    expect(result.eligible).toBe(false);
  });

  it('already-returned orders are not eligible', () => {
    const result = checkReturnEligibility({ orderId: 88150 });
    expect(result.eligible).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm install && npx vitest run agents/orders/test/tools.test.ts`
Expected: FAIL — `../src/tools.ts` missing.

- [ ] **Step 4: Write `agents/orders/src/tools.ts`**

```typescript
import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

const RETURN_WINDOW_DAYS = 30;

interface OrderRow {
  id: number; customer_id: number; sku: string; quantity: number; total: number;
  status: string; order_date: string; delivered_date: string | null; product_name?: string;
}

export function getCustomerOrders(input: { customerId: number }) {
  const db = openDb();
  const customer = db.prepare('SELECT id, name, email FROM customers WHERE id = ?').get(input.customerId) as
    | { id: number; name: string; email: string }
    | undefined;
  if (!customer) {
    db.close();
    return { error: `No customer found with id ${input.customerId}.`, orders: [] };
  }
  const rows = db
    .prepare(
      `SELECT o.*, p.name AS product_name FROM orders o
       JOIN products p ON p.sku = o.sku
       WHERE o.customer_id = ? ORDER BY o.order_date DESC`,
    )
    .all(input.customerId) as unknown as OrderRow[];
  db.close();
  return {
    customer,
    orders: rows.map((r) => ({
      id: r.id, sku: r.sku, productName: r.product_name, quantity: r.quantity,
      total: r.total, status: r.status, orderDate: r.order_date, deliveredDate: r.delivered_date,
    })),
  };
}

export function getOrderDetails(input: { orderId: number }) {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT o.*, p.name AS product_name, c.name AS customer_name FROM orders o
       JOIN products p ON p.sku = o.sku
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
    )
    .get(input.orderId) as unknown as (OrderRow & { customer_name: string }) | undefined;
  db.close();
  if (!row) return { error: `No order found with id ${input.orderId}.` };
  return {
    id: row.id, customerId: row.customer_id, customerName: row.customer_name,
    sku: row.sku, productName: row.product_name, quantity: row.quantity, total: row.total,
    status: row.status, orderDate: row.order_date, deliveredDate: row.delivered_date,
  };
}

export function checkReturnEligibility(input: { orderId: number }) {
  const details = getOrderDetails(input);
  if ('error' in details) return { eligible: false, reason: details.error };
  if (details.status === 'returned') {
    return { eligible: false, reason: `Order ${details.id} has already been returned.` };
  }
  if (details.status !== 'delivered' || !details.deliveredDate) {
    return {
      eligible: false,
      reason: `Order ${details.id} has status '${details.status}' — only delivered orders can be returned.`,
    };
  }
  const daysSinceDelivery = Math.floor((Date.now() - Date.parse(details.deliveredDate)) / 86_400_000);
  const daysLeft = RETURN_WINDOW_DAYS - daysSinceDelivery;
  if (daysLeft < 0) {
    return {
      eligible: false,
      reason: `Delivered ${daysSinceDelivery} days ago — outside the ${RETURN_WINDOW_DAYS}-day return window.`,
    };
  }
  return {
    eligible: true,
    daysLeft,
    reason: `Delivered ${daysSinceDelivery} days ago; within the ${RETURN_WINDOW_DAYS}-day return window (${daysLeft} days left).`,
    order: { id: details.id, sku: details.sku, productName: details.productName, total: details.total },
  };
}

export const getCustomerOrdersTool = new FunctionTool({
  name: 'get_customer_orders',
  description: 'List all orders of a customer (most recent first), including product names and statuses.',
  parameters: z.object({ customerId: z.number().describe('Customer id, e.g. 1042.') }),
  execute: getCustomerOrders,
});

export const getOrderDetailsTool = new FunctionTool({
  name: 'get_order_details',
  description: 'Get full details of a single order by order id.',
  parameters: z.object({ orderId: z.number().describe('Order id, e.g. 88231.') }),
  execute: getOrderDetails,
});

export const checkReturnEligibilityTool = new FunctionTool({
  name: 'check_return_eligibility',
  description:
    'Check whether an order can still be returned under the TechParts 30-day return policy (counted from delivery date).',
  parameters: z.object({ orderId: z.number().describe('Order id, e.g. 88231.') }),
  execute: checkReturnEligibility,
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run agents/orders/test/tools.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 6: Write `agents/orders/src/agent.ts`**

```typescript
import { LlmAgent } from '@google/adk';
import { checkReturnEligibilityTool, getCustomerOrdersTool, getOrderDetailsTool } from './tools.ts';

export const rootAgent = new LlmAgent({
  name: 'orders_agent',
  model: 'gemini-2.5-flash',
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
```

- [ ] **Step 7: Write `agents/orders/src/server.ts`**

```typescript
import { startAgentServer } from '@techparts/shared';
import { rootAgent } from './agent.ts';

await startAgentServer({
  agent: rootAgent,
  port: Number(process.env.PORT ?? 8002),
  title: 'TechParts — Orders Agent',
});
```

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A && git commit -m "feat: orders agent (order lookup + 30-day return policy)"
```

---

### Task 6: Pricing agent (DB tool + Google Search sub-agent)

**Files:**
- Create: `agents/pricing/package.json`, `agents/pricing/src/tools.ts`, `agents/pricing/src/agent.ts`, `agents/pricing/src/server.ts`
- Test: `agents/pricing/test/tools.test.ts`

- [ ] **Step 1: Create `agents/pricing/package.json`**

```json
{
  "name": "@techparts/agent-pricing",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@google/adk": "^1.2.0",
    "@techparts/shared": "*",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write the failing tool test `agents/pricing/test/tools.test.ts`**

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seed } from '@techparts/shared';
import { getOurPrice } from '../src/tools.ts';

beforeAll(() => {
  process.env.TECHPARTS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'techparts-')), 'test.db');
  seed();
});

describe('getOurPrice', () => {
  it('returns our price and name by exact SKU', () => {
    const result = getOurPrice({ skuOrName: 'SONY-WH1000XM5' });
    expect(result).toMatchObject({ sku: 'SONY-WH1000XM5', ourPrice: 349.99 });
  });

  it('falls back to name search when no SKU matches', () => {
    const result = getOurPrice({ skuOrName: 'WH-1000XM5' });
    expect(result).toMatchObject({ sku: 'SONY-WH1000XM5' });
  });

  it('reports unknown products clearly', () => {
    expect(getOurPrice({ skuOrName: 'flux capacitor' })).toHaveProperty('error');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npx vitest run agents/pricing/test/tools.test.ts`
Expected: FAIL — `../src/tools.ts` missing.

- [ ] **Step 4: Write `agents/pricing/src/tools.ts`**

```typescript
import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

interface PriceRow { sku: string; name: string; price: number; }

export function getOurPrice(input: { skuOrName: string }) {
  const db = openDb();
  let row = db
    .prepare('SELECT sku, name, price FROM products WHERE sku = ? COLLATE NOCASE')
    .get(input.skuOrName) as unknown as PriceRow | undefined;
  if (!row) {
    row = db
      .prepare('SELECT sku, name, price FROM products WHERE name LIKE ? ORDER BY price DESC LIMIT 1')
      .get(`%${input.skuOrName}%`) as unknown as PriceRow | undefined;
  }
  db.close();
  if (!row) return { error: `No product found matching '${input.skuOrName}'.` };
  return { sku: row.sku, name: row.name, ourPrice: row.price };
}

export const getOurPriceTool = new FunctionTool({
  name: 'get_our_price',
  description: "Look up TechParts' own selling price for a product, by SKU or (partial) product name.",
  parameters: z.object({
    skuOrName: z.string().describe('Product SKU (e.g. SONY-WH1000XM5) or part of the product name (e.g. "WH-1000XM5").'),
  }),
  execute: getOurPrice,
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run agents/pricing/test/tools.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Write `agents/pricing/src/agent.ts`** (the AgentTool composition)

```typescript
import { AgentTool, GOOGLE_SEARCH, LlmAgent } from '@google/adk';
import { getOurPriceTool } from './tools.ts';

// Built-in tools like GOOGLE_SEARCH live on their own agent; we expose that agent
// to the root agent as a tool (AgentTool). This is ADK's composition pattern for
// combining built-in tools with custom function tools.
const marketResearchAgent = new LlmAgent({
  name: 'market_research',
  model: 'gemini-2.5-flash',
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
  model: 'gemini-2.5-flash',
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
```

- [ ] **Step 7: Write `agents/pricing/src/server.ts`**

```typescript
import { startAgentServer } from '@techparts/shared';
import { rootAgent } from './agent.ts';

await startAgentServer({
  agent: rootAgent,
  port: Number(process.env.PORT ?? 8003),
  title: 'TechParts — Pricing Agent',
});
```

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A && git commit -m "feat: pricing agent (own-price tool + google-search sub-agent via AgentTool)"
```

---

### Task 7: Orchestrator agent (A2A client)

**Files:**
- Create: `agents/orchestrator/package.json`, `agents/orchestrator/src/agent.ts`, `agents/orchestrator/src/server.ts`

No unit tests here — the agent is pure wiring (remote refs + instruction); behavior is verified end-to-end in Task 8.

- [ ] **Step 1: Create `agents/orchestrator/package.json`**

```json
{
  "name": "@techparts/agent-orchestrator",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@google/adk": "^1.2.0",
    "@techparts/shared": "*"
  }
}
```

- [ ] **Step 2: Write `agents/orchestrator/src/agent.ts`**

```typescript
import { AgentTool, LlmAgent, RemoteA2AAgent } from '@google/adk';

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
  model: 'gemini-2.5-flash',
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
```

API-drift fallback: if `AgentTool` rejects a `RemoteA2AAgent` (it shouldn't — both are `BaseAgent`s), use `subAgents: [ordersAgent, inventoryAgent, pricingAgent]` on the root agent instead and adjust the instruction to delegate rather than call tools — but prefer AgentTool (keeps the orchestrator in control of composition).

- [ ] **Step 3: Write `agents/orchestrator/src/server.ts`**

```typescript
import { startAgentServer } from '@techparts/shared';
import { rootAgent } from './agent.ts';

await startAgentServer({
  agent: rootAgent,
  port: Number(process.env.PORT ?? 8004),
  title: 'TechParts — Ops Orchestrator',
});
```

- [ ] **Step 4: Install, typecheck, commit**

Run: `npm install && npm run typecheck`
Expected: no errors.

```bash
git add -A && git commit -m "feat: orchestrator agent connecting workers via A2A (RemoteA2AAgent + AgentTool)"
```

---

### Task 8: README + end-to-end verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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

- Node.js >= 24.13
- A Gemini API key (free): https://aistudio.google.com/apikey

## Setup

```bash
npm install
cp .env.example .env       # then paste your GEMINI_API_KEY
npm run seed               # creates shared/data/techparts.db
```

Note: `tsx` loads `.env` automatically? It does not — export the key in your shell,
or prefix commands, e.g. PowerShell: `$env:GEMINI_API_KEY="..."`, bash: `export GEMINI_API_KEY=...`.

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

## Branches

- `main` — workshop starting point: scaffolding + TODOs
- `solution` — fully implemented reference
```

(Resolve the `.env` note before committing: check whether `tsx` auto-loads `.env` — it does NOT by default. Either keep the shell-export instruction, or add `--env-file=.env` to the dev scripts in root `package.json`, e.g. `"dev:inventory": "tsx --env-file-if-exists=.env agents/inventory/src/server.ts"` — Node 24 supports `--env-file-if-exists`; verify tsx passes it through. Pick whichever works and make the README match reality.)

- [ ] **Step 2: Run the full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (seed 3, server 2, inventory 6, orders 8, pricing 3 = 22), no type errors.

- [ ] **Step 3: End-to-end smoke test (requires `GEMINI_API_KEY`)**

Requires the key in `.env`/environment. Start all four agents (background processes), then verify:

1. `GET http://localhost:8001/.well-known/agent-card.json` → card with `"name": "inventory_agent"` (same for 8002/8003/8004).
2. POST to each worker's `/api/chat` with its demo question; assert the SSE stream contains `tool_call` events and a final `text`:
   - inventory: "Do we have noise-cancelling headphones under $300 in stock?" → expect `search_products` call, answer mentions WH-1000XM4 or JBL.
   - orders: "Can customer 1042 still return order 88231?" → expect `check_return_eligibility` call, answer says yes / ~9 days left.
   - pricing: "Are we competitive on the Sony WH-1000XM5?" → expect `get_our_price` + `market_research` calls.
3. Flagship: POST to `http://localhost:8004/api/chat` with "Customer 1042 wants to return their headphones (order 88231) and get something similar — what can we offer?" → expect tool calls to `orders_agent`, `inventory_agent` (and ideally `pricing_agent`), and a final recommendation naming an in-stock alternative (e.g. Bose QC Ultra or WH-1000XM4).

A simple way to drive this from the shell:

```bash
curl -N -X POST http://localhost:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"smoke-1","message":"Do we have noise-cancelling headphones under $300 in stock?"}'
```

Watch the SSE output for `event: tool_call` and `event: text`. Then stop all agents.

If anything fails here, debug it (this is the core deliverable) — typical suspects: session-service call shapes, `toA2a` option drift, `RemoteA2AAgent` agentCard URL needing an explicit `/.well-known/agent-card.json` suffix or a trailing slash.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: README with setup, run and demo instructions"
```

---

## Self-review checklist (done at planning time)

- Spec coverage: agents/tools (Tasks 4–6), A2A expose (Task 3 harness) + consume (Task 7), seeded SQLite incl. demo order (Task 2), HTML console (Task 3), env-var URLs (Task 7), README (Task 8), demo queries verified (Task 8). `main` branch derivation is intentionally out of scope (separate effort after Armen's review).
- Types consistent across tasks: `startAgentServer({agent, port, title})`, tool function names match between tools/tests/instructions.
- Known uncertainty is flagged inline as "API-drift fallback" notes rather than placeholders.
```
