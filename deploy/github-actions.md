# GitHub Actions CI/CD

This repository includes a GitHub Actions pipeline at:

```text
.github/workflows/deploy.yaml
```

It runs typecheck and tests, builds the root `Dockerfile`, pushes the image to
Artifact Registry, and deploys one Cloud Run service containing the storefront
and all TypeScript agents.

## GitHub configuration

Create these repository variables:

| Name | Example | Required |
|---|---|---|
| `GCP_PROJECT_ID` | `my-gcp-project` | yes |
| `GCP_REGION` | `us-central1` | no, defaults to `us-central1` |
| `ARTIFACT_REPOSITORY` | `techparts` | no, defaults to `techparts` |
| `CLOUD_RUN_SERVICE` | `techparts-workshop` | no, defaults to `techparts-workshop` |

Create one of these repository secret sets.

Recommended, keyless Workload Identity Federation:

| Name | Example |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123456789/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@my-gcp-project.iam.gserviceaccount.com` |

Quick service account key option:

| Name | Example |
|---|---|
| `GCP_CREDENTIALS_JSON` | Full JSON key for the deployer service account |

Do not set both `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_CREDENTIALS_JSON`.
The workflow intentionally fails if both are present or if neither auth option
is configured.

## Required Google Cloud permissions

The service account used by GitHub Actions needs enough permissions to create or
use the Artifact Registry repository, push images, and deploy Cloud Run:

```bash
PROJECT_ID="my-gcp-project"
SA_EMAIL="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

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

Run `deploy/setup.sh` once before the first deployment to enable required APIs.

## Deployment behavior

The Cloud Run service is deployed publicly with `--allow-unauthenticated` for the
workshop flow. The container listens on port `8080` in Cloud Run, while local
runs still default to port `8010`.
