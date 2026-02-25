# Docker Setup

This directory contains Docker configurations for local development and production-like environments.

## Overview

### Production-like (`docker-compose.yml`)

- Builds static web assets and serves via nginx reverse proxy
- nginx proxies `/internal/*` → backend, `/yjs` → backend (WebSocket), `/sync/*` → zero
- Browser only talks to `localhost:3000` — no cross-origin issues
- Mirrors the production ALB + CloudFront topology
- Includes an e2e test runner via `--profile test`

### Development (`docker-compose.dev.yml`)

- Vite dev server with HMR (Hot Module Replacement)
- Backend auto-restarts on file changes (`bun --watch`)
- Volume-mounted source code for real-time updates
- Browser talks directly to backend (`:3001`) and zero (`:4848`)

## Quick Start

### Development (with HMR)

```bash
# Start all services with hot reload
bun run docker:dev

# View logs
bun run docker:dev:logs

# Stop services
bun run docker:dev:down
```

### Production-like

```bash
# Start production-like environment (detached)
bun run docker:prod

# View logs
bun run docker:prod:logs

# Stop and clean up
bun run docker:prod:down
```

### E2E Tests

```bash
# Run e2e tests in Docker (builds, runs tests, tears down)
bun run docker:e2e
```

This is the same flow CI uses. It:
1. Builds and starts the production-like stack
2. Runs the Playwright e2e test container (`--profile test`)
3. Tears everything down

## Scripts

| Command | Description |
|---|---|
| `bun run docker:dev` | Start dev environment with HMR |
| `bun run docker:dev:down` | Stop dev environment |
| `bun run docker:dev:logs` | View dev environment logs |
| `bun run docker:prod` | Start production-like environment |
| `bun run docker:prod:down` | Stop and clean up production environment |
| `bun run docker:prod:logs` | View production environment logs |
| `bun run docker:e2e` | Build, run e2e tests in Docker, tear down |

## Architecture

### Production-like (nginx reverse proxy)

```
Browser → localhost:3000 (nginx)
  ├── /internal/*   → backend:3001  (API)
  ├── /yjs          → backend:3001  (WebSocket)
  ├── /sync/*       → zero:4848     (WebSocket)
  ├── /keepalive    → zero:4848
  └── /*            → static SPA files
```

### Development (direct access)

```
Browser → localhost:3000 (Vite dev server, HMR)
Browser → localhost:3001 (backend API)
Browser → localhost:4848 (zero sync)
```

## How It Works

### Backend Hot Reload (dev only)

- Uses `bun run --watch` to auto-restart on file changes
- Source code is volume-mounted from your local filesystem
- Changes to `packages/backend/src`, `packages/core/src`, etc. trigger restarts

### Web HMR (dev only)

- Runs Vite dev server instead of nginx
- React component changes update instantly without page refresh
- File watching uses polling (more reliable in Docker)
- WebSocket connection on port 24678 for HMR updates

### Migrations

Both compose files run migrations automatically before starting the zero service. No manual migration step needed.

## Port Mapping

| Service | Port | Dev | Prod |
|---|---|---|---|
| Web / nginx | 3000 | Vite dev server | nginx reverse proxy |
| Web HMR | 24678 | HMR WebSocket | — |
| Backend API | 3001 | Direct access | Proxied via nginx |
| Zero Sync | 4848 | Direct access | Proxied via nginx |
| PostgreSQL | 5432 | Database | Database |

## Troubleshooting

### Changes not reflecting (dev)

1. Make sure you're using `docker:dev` (the dev setup)
2. Check that volumes are mounted: `docker inspect lydie-web-dev`
3. Restart a specific service: `docker compose -f docker/docker-compose.dev.yml restart web`

### HMR not working (dev)

1. Ensure port 24678 is not blocked by firewall
2. Check browser console for WebSocket errors
3. Try a hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)

### Package installation issues

After modifying `package.json` or `bun.lock`, rebuild:

```bash
docker compose -f docker/docker-compose.dev.yml build --no-cache
```

### E2E tests failing locally

1. Make sure no other services are using ports 3000, 3001, 4848, or 5432
2. Check that Docker has enough resources (memory, CPU)
3. Run `bun run docker:prod` first and verify the app works at `http://localhost:3000`
