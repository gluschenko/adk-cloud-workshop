import express from 'express';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../../shared/src/db.ts';
import { App } from './App.tsx';
import type { StoreProduct } from './catalog.ts';

const PORT = Number(process.env.STOREFRONT_PORT ?? process.env.PORT ?? 8010);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:8004';

const app = express();
app.use(express.json());
app.use('/static', express.static(fileURLToPath(new URL('.', import.meta.url))));

function getProducts(): StoreProduct[] {
  const db = openDb();
  try {
    return db
      .prepare('SELECT sku, name, category, price, stock, warehouse FROM products ORDER BY category, name')
      .all() as unknown as StoreProduct[];
  } finally {
    db.close();
  }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

app.get('/api/products', (_req, res) => {
  try {
    res.json({ products: getProducts() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/assistant', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  try {
    const upstream = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok || !upstream.body) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: `Orchestrator returned HTTP ${upstream.status}` })}\n\n`);
      res.write('event: done\ndata: {}\n\n');
      return;
    }

    for await (const chunk of upstream.body) {
      res.write(Buffer.from(chunk));
    }
  } catch (error) {
    res.write(
      `event: error\ndata: ${JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      })}\n\n`,
    );
    res.write('event: done\ndata: {}\n\n');
  } finally {
    res.end();
  }
});

app.get('/', (_req, res) => {
  let products: StoreProduct[];
  let loadError = '';
  try {
    products = getProducts();
  } catch (error) {
    products = [];
    loadError = error instanceof Error ? error.message : String(error);
  }

  const appHtml = renderToString(<App products={products} />);
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="TechParts Market: SSR storefront backed by the seeded SQLite catalog with an AI orchestrator assistant." />
    <title>TechParts Market</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; overflow: hidden; }
      .chat-message {
        max-width: 92%;
        padding: 10px 12px;
        border-radius: 8px;
        white-space: pre-wrap;
        line-height: 1.45;
        font: 14px/1.45 Roboto, Arial, sans-serif;
      }
      .chat-message.assistant { align-self: flex-start; background: #122429; color: #f3fbfb; border: 1px solid #2a484f; }
      .chat-message.user { align-self: flex-end; background: #17656c; color: #fff; }
      .chat-tool {
        align-self: flex-start;
        max-width: 92%;
        border: 1px dashed #2a484f;
        border-radius: 8px;
        padding: 7px 12px;
        color: #9fb6bb;
        font: 13px/1.45 Roboto, Arial, sans-serif;
      }
      .chat-tool summary { cursor: pointer; user-select: none; }
      .chat-tool .tool-name { color: #f0b85a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      .chat-tool .tool-agent { color: #9fb6bb; font-size: 11px; }
      .chat-tool.result .tool-name { color: #4dd2d8; }
      .chat-tool pre {
        margin: 8px 0 4px;
        padding: 10px;
        background: #122429;
        border-radius: 8px;
        overflow-x: auto;
        color: #f3fbfb;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .chat-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
      .chat-action, .cart-row button {
        border: 1px solid #2a484f;
        background: #0d1b1f;
        border-radius: 8px;
        padding: 7px 10px;
        color: #4dd2d8;
        cursor: pointer;
        font: 700 13px Roboto, Arial, sans-serif;
      }
      .cart-row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 10px 0;
        border-top: 1px solid #22383d;
      }
      .cart-row:first-child { border-top: 0; }
      .cart-meta { color: #9fb6bb; font-size: 13px; }
    </style>
  </head>
  <body>
    <div id="root">${appHtml}</div>
    <script id="product-data" type="application/json">${safeJson({ products, loadError })}</script>
    <script type="module" src="/static/client.js"></script>
  </body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`[storefront] SSR UI: http://localhost:${PORT}/`);
  console.log(`[storefront] assistant proxy: ${ORCHESTRATOR_URL}/api/chat`);
});
