# Lydie

Lydie is an AI-powered document editor designed for modern workflows. It integrates advanced AI capabilities with a seamless, real-time editing experience.

![Screenshot](./screenshot.png)

## Tech Stack

- **Monorepo Manager:** [Bun](https://bun.sh) workspaces
- **Infrastructure:** [SST](https://sst.dev) on AWS
- **Frontend:** React, Vite (Web App), Astro (Marketing Site)
- **Backend:** Hono, Better Auth
- **Database & Sync:** Postgres, Drizzle ORM, [Zero](https://zero.rocicorp.dev)
- **AI:** Vercel AI SDK (OpenAI, Google)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3.3+)
- AWS Credentials (configured for SST)

### Installation

Install dependencies from the root directory:

```bash
bun install
```

### Development

Start the development environment (infrastructure and applications):

```bash
bun dev
```

This command runs `sst dev`, which orchestrates the local development environment.

## Project Structure

The project is organized as a monorepo:

- **`packages/web`**: The main web application (React/Vite).
- **`packages/marketing`**: The marketing website (Astro).
- **`packages/backend`**: API services and backend logic.
- **`packages/core`**: Shared core logic, AI utilities, and types.
- **`packages/database`**: Database schema, migrations, and configuration.
- **`packages/zero`**: Real-time sync configuration (Zero).
- **`packages/sdk`**: Lydie Client SDK.
- **`infra/`**: SST infrastructure definitions.

## Roadmap

Key planned features include:

- Real-time collaboration
- Native desktop application
- Cross-platform publishing
- Advanced AI features (LLM selection, web search, cross-document referencing)

For the full roadmap, see [https://lydie.co/roadmap](https://lydie.co/roadmap).
