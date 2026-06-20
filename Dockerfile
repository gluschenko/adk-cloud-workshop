FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development \
    GEMMA_DEVICE=cpu \
    GEMMA_DTYPE=q4 \
    GEMMA_API_URL=http://localhost:8016 \
    GEMMA_API_HOST=127.0.0.1 \
    GEMMA_API_PORT=8016 \
    INVENTORY_AGENT_URL=http://localhost:8001 \
    ORDERS_AGENT_URL=http://localhost:8002 \
    PRICING_AGENT_URL=http://localhost:8003 \
    ORCHESTRATOR_URL=http://localhost:8004 \
    STOREFRONT_PORT=8010 \
    TRANSFORMERS_CACHE_DIR=/app/models/transformers-cache

COPY package.json package-lock.json tsconfig.json ./
COPY shared/package.json shared/package.json
COPY agents/inventory/package.json agents/inventory/package.json
COPY agents/orders/package.json agents/orders/package.json
COPY agents/pricing/package.json agents/pricing/package.json
COPY agents/orchestrator/package.json agents/orchestrator/package.json
COPY web/storefront/package.json web/storefront/package.json

RUN npm ci

COPY . .
RUN chmod +x docker/start-all.sh

EXPOSE 8001 8002 8003 8004 8010 8016

CMD ["docker/start-all.sh"]
