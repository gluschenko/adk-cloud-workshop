# TechParts - ADK TypeScript Multi-Agent Workshop

TechParts is a fictional retailer demo for a Google ADK TypeScript multi-agent
system. The project contains three specialist agents, an orchestrator that talks
to them over A2A, a shared local Gemma ONNX backend, and a React SSR storefront.

The storefront renders products from the SQLite database created by
`npm run seed`, includes a browser `localStorage` cart, and exposes an AI
assistant UI backed by the same orchestrator agent as the debug console.

| Service | Port | Data / role | Demo question or action |
|---|---:|---|---|
| `shared/src/gemma-server.ts` | 8016 | Local Gemma ONNX model API | Shared LLM backend for every ADK agent |
| `agents/inventory` | 8001 | SQLite: products, stock | "Do we have noise-cancelling headphones under $300 in stock?" |
| `agents/orders` | 8002 | SQLite: customers, orders | "Can customer 1042 still return order 88231?" |
| `agents/pricing` | 8003 | SQLite + public market research | "Are we competitive on the Sony WH-1000XM5?" |
| `agents/orchestrator` | 8004 | A2A to the three worker agents | "Customer 1042 wants to return their headphones and get something similar - what can we offer?" |
| `web/storefront` | 8010 | React SSR + MUI storefront | Browse seeded products, use the local cart, ask the orchestrator assistant |

## Prerequisites

- Node.js >= 24
- Docker Desktop, only if you want the one-container run
- Enough local disk/RAM to download and run `onnx-community/gemma-4-E2B-it-ONNX`
- A Transformers.js release that exports `Gemma4ForConditionalGeneration`

## Setup

```bash
npm install
cp .env.example .env
npm run seed               # creates shared/data/techparts.db
```

The dev scripts load `.env` automatically. `npm run seed` can be re-run at any
time; it recreates the SQLite database with products, customers, and orders.

## Run Locally

Use one terminal per service:

```bash
npm run dev:gemma          # http://localhost:8016
npm run dev:inventory      # http://localhost:8001
npm run dev:orders         # http://localhost:8002
npm run dev:pricing        # http://localhost:8003
npm run dev:orchestrator   # http://localhost:8004
npm run dev:storefront     # http://localhost:8010
```

Open the storefront at [http://localhost:8010](http://localhost:8010).

Each agent URL also serves a debug console showing the conversation and every
tool call/result. Agents expose A2A endpoints at `/.well-known/agent-card.json`,
`/rest`, and `/jsonrpc`.

## Storefront

The storefront is a separate workspace under `web/storefront` built with:

- React SSR
- MUI
- Google Fonts
- Express

Server-side rendering reads the `products` table from `shared/data/techparts.db`.
The browser stores cart state in `localStorage` under
`techparts-storefront-cart`.

Cart behavior:

- Product cards can add in-stock SKUs to the cart.
- The cart shows quantity, subtotal, total, remove, and clear actions.
- The assistant UI accepts local cart commands such as
  `add SONY-WH1000XM5 to cart`.
- If the orchestrator response mentions known SKUs, the UI renders quick
  `Add SKU` buttons under the assistant response.

## Local Gemma Backend

All four ADK `LlmAgent`s call the shared local Gemma service via
`GEMMA_API_URL`; they do not call Gemini. `npm run dev:gemma` loads
`onnx-community/gemma-4-E2B-it-ONNX` once through Transformers.js and exposes an
ADK-friendly `/v1/adk/generate` API.

Useful environment variables:

```bash
GEMMA_MODEL=onnx-community/gemma-4-E2B-it-ONNX
GEMMA_DEVICE=dml                 # Windows default; use cpu in Docker/Linux
GEMMA_DTYPE=q4
GEMMA_API_URL=http://localhost:8016
GEMMA_API_HOST=127.0.0.1
GEMMA_API_PORT=8016
TRANSFORMERS_CACHE_DIR=models/transformers-cache
TRANSFORMERS_OFFLINE=false       # set true only after the cache is complete
HF_ENDPOINT=                     # optional Hugging Face-compatible mirror
INVENTORY_AGENT_URL=http://localhost:8001
ORDERS_AGENT_URL=http://localhost:8002
PRICING_AGENT_URL=http://localhost:8003
ORCHESTRATOR_URL=http://localhost:8004
STOREFRONT_PORT=8010
```

On Windows the default Gemma device is `dml` for DirectML. In Docker/Linux the
Dockerfile sets `GEMMA_DEVICE=cpu`.

The first `npm run dev:gemma` downloads the model into
`TRANSFORMERS_CACHE_DIR`. If the download times out, rerun the command; partial
`.tmp...` files in the cache mean the download did not finish yet. Once the
cache is complete, set `TRANSFORMERS_OFFLINE=true` to force local-only startup.
If Hugging Face is blocked or slow on your network, set `HF_ENDPOINT` to a
reachable Hugging Face-compatible mirror before retrying.

## Docker

The repository includes a single-container setup that runs the storefront,
Gemma backend, all three worker agents, and the orchestrator in one container.
Inside the container the services continue to communicate via the same
`localhost:<port>` URLs.

Build:

```bash
docker build -t techparts-storefront-all .
```

Run:

```bash
docker run --rm \
  -p 8010:8010 \
  -p 8004:8004 \
  -p 8001:8001 \
  -p 8002:8002 \
  -p 8003:8003 \
  -p 8016:8016 \
  techparts-storefront-all
```

On Windows PowerShell:

```powershell
docker run --rm `
  -p 8010:8010 `
  -p 8004:8004 `
  -p 8001:8001 `
  -p 8002:8002 `
  -p 8003:8003 `
  -p 8016:8016 `
  techparts-storefront-all
```

The container entrypoint runs `npm run seed` first, then starts:

- Gemma backend on `8016`
- Inventory agent on `8001`
- Orders agent on `8002`
- Pricing agent on `8003`
- Orchestrator on `8004`
- Storefront on `8010`

## Deploy with GitHub Actions

The repository has a CI/CD workflow at
`.github/workflows/deploy.yaml`. On every push to `main`, it runs
typecheck and tests, builds the root Docker image, pushes it to Google Artifact
Registry, and deploys one Cloud Run service containing the storefront, Gemma
backend, orchestrator, and all worker agents.

Run the one-time GCP setup first:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud config set compute/region us-central1
bash deploy/setup.sh
```

Then configure the GitHub repository:

1. Open `Settings -> Secrets and variables -> Actions`.
2. Add repository variables under the `Variables` tab.
3. Add repository secrets under the `Secrets` tab.

Repository variables:

| Name | Example | Required | Notes |
|---|---|---:|---|
| `GCP_PROJECT_ID` | `my-gcp-project` | yes | Google Cloud project ID |
| `GCP_REGION` | `us-central1` | no | Defaults to `us-central1` |
| `ARTIFACT_REPOSITORY` | `techparts` | no | Artifact Registry Docker repository |
| `CLOUD_RUN_SERVICE` | `techparts-workshop` | no | Cloud Run service name |

Repository secrets:

| Name | Example | Notes |
|---|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123456789/locations/global/workloadIdentityPools/github/providers/github` | Full Workload Identity Provider resource name |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@my-gcp-project.iam.gserviceaccount.com` | Service account GitHub Actions will impersonate |

Create the deployer service account if you do not already have one:

```bash
PROJECT_ID="my-gcp-project"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Cloud Run deployer"
```

Grant it permissions to push images and deploy Cloud Run:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

For authentication, prefer Workload Identity Federation instead of a downloaded
JSON key. The secret `GCP_WORKLOAD_IDENTITY_PROVIDER` should contain the full
provider resource name, and `GCP_SERVICE_ACCOUNT` should contain the service
account email above. After those values are set, push to `main` or run the
workflow manually from the GitHub Actions tab.

The Cloud Run deployment exposes the service publicly with
`--allow-unauthenticated` for workshop use. In Cloud Run the container listens on
port `8080`; local Docker runs still use `8010`.

## Tests

```bash
npm test
npm run typecheck
```

No API key is needed for the tests.

## Project Layout

```text
shared/                SQLite helper, seed script, Gemma ONNX adapter,
                       Gemma API server, agent server harness
agents/inventory/      catalog search + stock tools (SQLite)
agents/orders/         order lookup + 30-day return policy (SQLite)
agents/pricing/        our price (SQLite) + market research tool
agents/orchestrator/   RemoteA2AAgent x3 wrapped as tools - no data of its own
web/storefront/        React SSR + MUI storefront and localStorage cart
docker/start-all.sh    one-container process launcher
Dockerfile             installs workspaces and runs all services together
```

## Branches

- `main` - workshop starting point: scaffolding + TODOs
- `solution` - fully implemented reference
