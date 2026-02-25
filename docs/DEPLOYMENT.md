# Deployment Guide

Lydie supports three deployment modes:

1. **Local development** — Docker Compose (dev) + Bun
2. **Self-hosting** — Docker Compose (production)
3. **AWS production** — SST + AWS

---

## 1. Local Development

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 20.10+
- [Bun](https://bun.sh) 1.3+

### Quick start

```bash
# Start Postgres + backend + zero + web with hot reload
cd docker && docker compose -f docker-compose.dev.yml up -d

# Or start only Postgres and run services natively
cd docker && docker compose -f docker-compose.dev.yml up -d postgres
bun install
bun dev  # starts SST dev environment
```

### Services

| Service  | Port | Description                 |
| -------- | ---- | --------------------------- |
| Web      | 3000 | Vite dev server (HMR)       |
| Backend  | 3001 | Hono API (bun --watch)      |
| Zero     | 4848 | rocicorp/zero sync          |
| Postgres | 5432 | pgvector/pg16 (WAL logical) |

### Configuration

Copy `.env.example` to `.env` at the project root. Minimum required:

```env
DATABASE_URL=postgres://lydie:lydie@localhost:5432/lydie
BETTER_AUTH_SECRET=change-this-to-a-secure-secret-in-production
```

The Docker Compose dev file sets most defaults automatically. Add API keys to `.env` to enable optional features (AI, Stripe, OAuth, etc.).

### Common commands

```bash
# View logs
cd docker && docker compose -f docker-compose.dev.yml logs -f

# Stop services
cd docker && docker compose -f docker-compose.dev.yml down

# Reset database (removes all data)
cd docker && docker compose -f docker-compose.dev.yml down -v

# Run migrations manually
cd docker && docker compose -f docker-compose.dev.yml up migrations

# Run E2E tests
cd docker && docker compose --profile test up e2e
```

---

## 2. Self-Hosting with Docker Compose

The production compose file (`docker/docker-compose.yml`) mirrors the AWS topology:

- **nginx** reverse-proxies all traffic through port 3000, routing to backend/zero internally
- **postgres** runs with WAL logical replication (required by Zero)
- **migrations** container runs once before zero starts
- **backend** is built from `packages/backend/Dockerfile` (includes pandoc + texlive for PDF export)

### Deploy

```bash
# Create .env with production values (see .env.example)
cp .env.example .env
# Edit .env — set real secrets, database credentials, domain, etc.

# Build and start
cd docker && docker compose up -d --build

# Run E2E tests against the stack
cd docker && docker compose --profile test up e2e
```

### Key environment variables

| Variable              | Required | Description                             |
| --------------------- | -------- | --------------------------------------- |
| `BETTER_AUTH_SECRET`  | Yes      | Auth secret (`openssl rand -base64 32`) |
| `POSTGRES_USER`       | Yes      | Database user (default: `lydie`)        |
| `POSTGRES_PASSWORD`   | Yes      | Database password (default: `lydie`)    |
| `FRONTEND_URL`        | Yes      | Public URL of the web app               |
| `ZERO_ADMIN_PASSWORD` | Yes      | Zero admin password                     |
| `OPENAI_API_KEY`      | No       | Enables AI features                     |
| `STRIPE_SECRET_KEY`   | No       | Enables billing                         |

See `.env.example` for the full list (all sections documented).

### Backing up Postgres

```bash
docker compose exec postgres pg_dump -U lydie lydie > backup.sql
```

---

## 3. AWS Production Deployment

Production runs on AWS with SST (`infra/` + `sst.config.ts`). The database can be PlanetScale or any PostgreSQL-compatible provider.

### Architecture

```
Route53 DNS
  app.lydie.co    -> CloudFront -> S3 (Vite SPA)
  api.lydie.co    -> ALB -> ECS Fargate (backend)
  zero.lydie.co   -> ALB -> ECS Fargate (zero)
  assets.lydie.co -> CloudFront -> S3 (user uploads)
  e.lydie.co      -> CloudFront -> PostHog (analytics proxy)

SES email (DKIM + SPF + DMARC via mail.lydie.co)
2 Lambda functions: onboarding scheduler, workspace export
```

### Prerequisites

- AWS CLI configured with credentials
- SST account access and CLI auth (`bunx sst auth login`)
- Docker (SST builds and publishes container images for service resources)
- Route53 hosted zone for your domain
- Production environment variables available in CI or shell

### Configuration model

SST is the IaC layer, but application configuration still uses environment variables (`.env` contract), so Docker and AWS deployments use the same runtime keys.

- Local/self-host: `.env` + Docker Compose
- AWS/SST: environment variables provided by CI or your shell during `sst deploy`

### Deploy

```bash
# Staging
bun run deploy:staging

# Production
bun run deploy:prod
```

SST deploys infrastructure and application services together (networking, ALB, ECS services, buckets/CDN, email resources, and DNS records configured in `infra/`).

### Targeted deploys

```bash
# Only web app
bun run deploy:web

# Only marketing site
bun run deploy:marketing
```

### Infrastructure modules

```
infra/
  cluster.ts            VPC + ECS cluster
  backend.ts            Backend ECS service + permissions
  zero.ts               Zero ECS service + LB routing
  web.ts                Web StaticSite + Marketing Astro site
  events.ts             PostHog proxy router
  onboarding.ts         Onboarding scheduler Lambda + IAM role
  workspace-export.ts   Workspace export Lambda + bucket
  email.ts              SES sender configuration
  secret.ts             SST secret resource definitions
```

---

## Monitoring

```bash
# Open SST console for logs and resources
bunx sst console --stage production
```

---

## Estimated AWS Costs

Typical monthly costs (us-east-1, excludes PlanetScale):

| Service               | Cost            |
| --------------------- | --------------- |
| ECS Fargate (2 tasks) | ~$75            |
| ALB                   | ~$25            |
| CloudFront (3 dists)  | ~$20            |
| NAT Gateway           | ~$35            |
| S3                    | ~$5             |
| SES + Lambda          | ~$1             |
| **Total**             | **~$160/month** |

---

## Cleanup

```bash
# Remove AWS resources for a stage
bunx sst remove --stage production

# Remove Docker Compose resources
cd docker && docker compose down -v
```
