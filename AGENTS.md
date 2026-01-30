# AGENTS.md - Agentic Coding Guidelines for Lydie

This document provides guidelines for AI coding agents working in the Lydie repository.

## Build/Lint/Test Commands

```bash
# Development
bun dev                              # Start SST dev environment

# Linting & Formatting
bun run lint                         # Run oxlint (type-aware)
bun run lint:fix                     # Run oxlint with auto-fix
bun run fmt                          # Run oxfmt formatter
bun run fmt:check                    # Check formatting without writing

# Unit Tests (Vitest)
bun test                             # Run all tests
bun --filter=@lydie/web test         # Run web package tests
bun test -- --reporter=verbose       # Verbose output
bun test -- --testNamePattern="..."  # Run single test by name
bun test:watch                       # Watch mode
bun test:ui                          # UI mode

# E2E Tests (Playwright)
bun test:e2e                         # Run all e2e tests
bun test:e2e -- tests/e2e/auth.spec.ts    # Run specific e2e file
bun test:e2e -- --grep "should"     # Run tests matching pattern
bun test:e2e:ui                      # Playwright UI mode
bun test:e2e:debug                   # Debug mode

# Database
bun run db:push                      # Push schema changes
bun run db:studio                    # Open Drizzle Studio
bun run db:sync                      # Sync Zero publication

# Deployment
bun run deploy:prod                  # Deploy to production
```

## Code Style Guidelines

### TypeScript & Types
- **Target:** ES2022, strict mode enabled
- **Import style:** `import type { X }` for type-only imports
- **Indexed access:** Enable `noUncheckedIndexedAccess` where possible
- **No emit:** All packages use `noEmit: true` with bundler module resolution

### Import Ordering
Imports are grouped with newlines between (configured in `.oxfmtrc.json`):
1. External dependencies (React, etc.)
2. Workspace packages (`@lydie/*`)
3. Internal aliases (`@/*`)
4. Relative imports
5. Type imports

Example:
```typescript
import type { ReactNode } from "react";

import { createId } from "@lydie/core/id";
import { db } from "@lydie/database";

import { ErrorPage } from "@/components/layout/ErrorPage";
import { reportWebVitals } from "./reportWebVitals";
```

### Naming Conventions
- **Components:** PascalCase (e.g., `LinkPopover.tsx`)
- **Utilities:** camelCase (e.g., `slugify.ts`, `formatDate.ts`)
- **Test files:** Co-located `.test.tsx` for unit, `tests/e2e/*.spec.ts` for e2e
- **Fixtures:** `*.fixture.ts` (e.g., `auth.fixture.ts`)
- **Types/Interfaces:** PascalCase, prefer `type` over `interface`

### React Components
- Use React 19 with React Compiler (`babel-plugin-react-compiler`)
- Use `react-jsx` transform (no `React` import needed)
- Prefer function declarations for components
- Use `type` for props: `type Props = { ... }`

### Error Handling
- Use standard try/catch with typed errors
- Always cleanup in tests (use `afterEach`)
- Playwright fixtures handle auth state automatically

### Testing Patterns

**Unit Tests (Vitest):**
```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestEditor, destroyEditor } from "@/test-utils";

describe("Component", () => {
  afterEach(() => {
    // Cleanup
  });

  it("should do something", () => {
    // Test
  });
});
```

**E2E Tests (Playwright):**
```typescript
import { test, testUnauthenticated } from "./fixtures/auth.fixture";

test("authenticated test", async ({ page, user, organization }) => {
  // Test with auth fixtures
});

testUnauthenticated("public page", async ({ page }) => {
  // Test without auth
});
```

### File Organization
```
packages/web/src/
  components/           # React components
    Component.tsx
    Component.test.tsx  # Co-located test
  test-utils/           # Test utilities
  utils/                # Helper functions
  lib/                  # Library code
  styles/               # CSS/Tailwind

tests/e2e/              # Playwright tests
  *.spec.ts
  fixtures/             # Test fixtures
  utils/                # E2E utilities
```

### Path Aliases
- `@/*` → `packages/web/src/*` (web app)
- `@lydie/*` → Other workspace packages
- `@lydie/ui/*` → UI components

### Workspace Structure
- `@lydie/core` - Shared logic, AI utilities
- `@lydie/database` - Drizzle ORM schema
- `@lydie/backend` - Hono API
- `@lydie/web` - Vite React app
- `@lydie/ui` - Shared UI components
- `@lydie/editor` - TipTap editor extensions
- `@lydie/zero` - Zero sync configuration
- `@lydie/sdk` - Client SDK
- `@lydie/marketing` - Astro marketing site

### Secrets & Environment
- Use SST Secrets (access via `Resource.SecretName.value`)
- Never commit secrets or `.env` files
- Use `sst-env.d.ts` for type-safe resource access

### Database
- Use Drizzle ORM with explicit schema
- Prefer pooled connection for serverless
- Run `db:push` after schema changes
- E2E tests create/destroy test data via factories

### Editor Extensions
TipTap extensions live in `packages/editor/extensions/`:
- Each extension in its own file
- Export from `packages/editor/extensions/index.ts`

## AI SDK Usage
- Use Vercel AI SDK with Google/OpenAI providers
- Streaming responses with `streamText()`
- AI features in `packages/core/src/ai/`
