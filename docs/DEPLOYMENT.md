# Deployment Guide

Lydie supports three deployment modes:

1. **Local development** — Docker Compose (dev) + Bun
2. **Self-hosting** — Docker Compose (production)
3. **AWS production** — Pulumi + PlanetScale

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

Production runs on AWS with Pulumi IaC. The database is hosted on PlanetScale (external).

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
- [Pulumi CLI](https://www.pulumi.com/docs/install/) installed
- Docker (for building container images)
- A Route53 hosted zone for your domain

### Initial setup

```bash
cd infrastructure
bun install

# Login to Pulumi (use Pulumi Cloud or local backend)
pulumi login

# Create/select your stack
pulumi stack init production
# or
pulumi stack select production
```

### Configure domain

All subdomains are derived from the base domain:

```bash
pulumi config set domainName yourdomain.com
```

This auto-generates: `app.yourdomain.com`, `api.yourdomain.com`, `zero.yourdomain.com`, `assets.yourdomain.com`, `e.yourdomain.com`.

### Configure secrets

All 22 secrets are stored as Pulumi Config secrets (encrypted in `Pulumi.production.yaml`):

```bash
# Database (PlanetScale connection strings)
pulumi config set --secret secrets:databaseUrl "postgresql://user:pass@host/db?sslaccept=strict"
pulumi config set --secret secrets:databaseUrlDirect "postgresql://user:pass@host/db?sslaccept=strict"

# Auth
pulumi config set --secret secrets:betterAuthSecret "$(openssl rand -base64 32)"

# AI providers
pulumi config set --secret secrets:googleAiStudioApiKey "..."
pulumi config set --secret secrets:openAiApiKey "sk-..."

# OAuth
pulumi config set --secret secrets:googleClientId "..."
pulumi config set --secret secrets:googleClientSecret "..."

# Stripe
pulumi config set --secret secrets:stripeSecretKey "sk_live_..."
pulumi config set --secret secrets:stripeMonthlyPriceId "price_..."
pulumi config set --secret secrets:stripeYearlyPriceId "price_..."
pulumi config set --secret secrets:stripeWebhookSecret "whsec_..."

# GitHub App
pulumi config set --secret secrets:githubClientId "..."
pulumi config set --secret secrets:githubClientSecret "..."
pulumi config set --secret secrets:githubPrivateKey "$(cat private-key.pem)"
pulumi config set --secret secrets:githubAppSlug "your-app"

# Shopify
pulumi config set --secret secrets:shopifyClientId "..."
pulumi config set --secret secrets:shopifyClientSecret "..."

# Zero
pulumi config set --secret secrets:zeroAdminPassword "..."

# Analytics / Monitoring
pulumi config set --secret secrets:posthogKey "phc_..."
pulumi config set --secret secrets:sentryDsn "https://...@sentry.io/..."
pulumi config set --secret secrets:apiGatewayKey "..."

# PlanetScale (for Pulumi provider, if used)
pulumi config set --secret secrets:planetscaleServiceToken "..."
pulumi config set --secret secrets:planetscaleServiceTokenId "..."
```

### Optional: container sizing

Defaults are set in `Pulumi.yaml`. Override per-stack:

```bash
pulumi config set backendCpu 1024      # default: 512
pulumi config set backendMemory 2048   # default: 1024
pulumi config set zeroCpu 2048         # default: 1024
pulumi config set zeroMemory 4096      # default: 2048
```

### Deploy infrastructure

```bash
# Preview what will be created
pulumi preview

# Deploy
pulumi up
```

This creates: VPC (2 AZs, single NAT gateway), ACM certificate (DNS validated), ALB with TLS 1.3, ECS Fargate cluster with backend + zero services, S3 buckets + CloudFront distributions, SES email with DKIM/SPF/DMARC, 2 Lambda functions, Route53 DNS records, auto-scaling (backend scales 1-4 on CPU > 70%).

### Deploy application

#### Build and push backend image

```bash
# ECR login
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -f packages/backend/Dockerfile -t lydie-backend .
docker tag lydie-backend $(pulumi stack output backendEcrRepoUrl):latest
docker push $(pulumi stack output backendEcrRepoUrl):latest
```

#### Build and push zero image

```bash
docker build -f packages/zero/Dockerfile -t lydie-zero .
docker tag lydie-zero $(pulumi stack output zeroEcrRepoUrl):latest
docker push $(pulumi stack output zeroEcrRepoUrl):latest
```

#### Deploy web SPA

```bash
cd packages/web

VITE_API_URL=https://api.yourdomain.com \
VITE_ZERO_URL=https://zero.yourdomain.com \
VITE_YJS_SERVER_URL=wss://api.yourdomain.com/yjs \
bun run build

# Upload to S3
aws s3 sync dist/ s3://$(pulumi stack output webBucketName)/

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(pulumi stack output webDistributionId) \
  --paths "/*"
```

#### Force ECS redeployment

After pushing new container images:

```bash
aws ecs update-service \
  --cluster lydie-production \
  --service lydie-backend-production \
  --force-new-deployment

aws ecs update-service \
  --cluster lydie-production \
  --service lydie-zero-production \
  --force-new-deployment
```

### Stack outputs

```bash
pulumi stack output
```

| Output              | Description                          |
| ------------------- | ------------------------------------ |
| `appUrl`            | Web app URL                          |
| `apiUrl`            | Backend API URL                      |
| `zeroUrl`           | Zero sync URL                        |
| `assetsUrl`         | Assets CDN URL                       |
| `eventsUrl`         | PostHog proxy URL                    |
| `backendEcrRepoUrl` | ECR repo for backend images          |
| `zeroEcrRepoUrl`    | ECR repo for zero images             |
| `webBucketName`     | S3 bucket for web SPA                |
| `webDistributionId` | CloudFront ID for cache invalidation |

### Infrastructure modules

```
infrastructure/
  index.ts              Pulumi entrypoint + stack outputs
  Pulumi.yaml           Stack config defaults
  src/
    config.ts           Domain names, container sizing, stack name
    secrets.ts          22 Pulumi Config secrets
    vpc.ts              VPC with 2 AZs, single NAT gateway (awsx)
    certificate.ts      ACM cert (apex + wildcard), DNS validation
    email.ts            SES domain identity, DKIM, SPF, DMARC
    database.ts         PlanetScale connection strings
    storage.ts          S3 buckets (assets + exports) + CloudFront
    web.ts              S3 bucket + CloudFront for SPA
    events.ts           CloudFront proxy to PostHog
    lambdas.ts          Onboarding + export Lambda functions
    services.ts         ECR, ECS cluster, ALB, Fargate services (awsx)
    dns.ts              Route53 A-record aliases
```

---

## Monitoring

```bash
# Tail backend logs
aws logs tail /ecs/lydie-backend-production --follow

# Tail zero logs
aws logs tail /ecs/lydie-zero-production --follow

# Check ECS service status
aws ecs describe-services \
  --cluster lydie-production \
  --services lydie-backend-production lydie-zero-production \
  --query 'services[].{name:serviceName,status:status,running:runningCount,desired:desiredCount}'
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
# Remove all AWS resources
cd infrastructure && pulumi destroy

# Remove Docker Compose resources
cd docker && docker compose down -v
```
