# Lydie Integrations

This package provides integrations for syncing content between Lydie and external platforms (GitHub, Shopify, WordPress, etc.).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Organization                               │
│  ┌────────────────────┐     ┌────────────────────┐               │
│  │   Connection       │     │   Connection       │               │
│  │   (GitHub)         │     │   (WordPress)      │               │
│  │   - credentials    │     │   - credentials    │               │
│  │   - owner/repo     │     │   - site URL       │               │
│  └────────┬───────────┘     └────────┬───────────┘               │
│           │                          │                            │
│   ┌───────┴───────┐          ┌───────┴───────┐                   │
│   │               │          │               │                    │
│   ▼               ▼          ▼               ▼                    │
│ ┌─────┐       ┌─────┐    ┌─────┐       ┌─────┐                   │
│ │Link │       │Link │    │Link │       │Link │                   │
│ │/docs│       │/blog│    │Pages│       │Posts│                   │
│ └──┬──┘       └──┬──┘    └──┬──┘       └──┬──┘                   │
│    │             │          │             │                       │
│    ▼             ▼          ▼             ▼                       │
│  Folder        Folder     Folder        Folder                    │
│  └─ Doc        └─ Doc     └─ Doc        └─ Doc                   │
└──────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Connection
A **Connection** represents an authenticated link to an external platform. It stores:
- Integration type (github, shopify, wordpress)
- Credentials (access tokens, API keys)
- Platform-specific config (repo owner, site URL, etc.)

### Link
A **Link** is a sync target within a connection. One connection can have multiple links:
- GitHub: different repo paths (e.g., `/docs`, `/blog`)
- WordPress: Pages vs Posts
- Shopify: Pages vs Blog articles

Links have their own config that gets merged with connection config during sync. Documents and folders are associated with links via `integrationLinkId`.

### Default Links
Integrations can define **default links** that are auto-created when a connection is established via the `onConnect()` hook:

```typescript
class WordpressIntegration extends BaseIntegration {
    onConnect(): { links?: DefaultLink[] } {
        return {
            links: [
                { name: "Pages", config: { type: "pages" } },
                { name: "Posts", config: { type: "posts" } },
            ],
        };
    }
}
```

## Integration Interface

Every integration must implement the `Integration` interface:

```typescript
interface Integration {
    // Validate credentials work
    validateConnection(connection: IntegrationConnection): Promise<{ valid: boolean; error?: string }>;
    
    // Push document to external platform
    push(options: PushOptions): Promise<SyncResult>;
    
    // Pull documents from external platform
    pull(options: PullOptions): Promise<SyncResult[]>;
    
    // Optional: auto-create links on connection
    onConnect?(): { links?: DefaultLink[] };
}
```

**Note**: Integration metadata (name, description, icon) lives in `metadata.json` files, not in the class.

### ResourceIntegration

Integrations that support listing external resources (repos, blogs, etc.) also implement:

```typescript
interface ResourceIntegration {
    fetchResources(connection: IntegrationConnection): Promise<ExternalResource[]>;
}
```

### OAuthIntegration

OAuth-based integrations (GitHub, Shopify) also implement:

```typescript
interface OAuthIntegration {
    getOAuthCredentials(): Promise<OAuthCredentials>;
    buildAuthorizationUrl(...): string;
    handleOAuthCallback(...): Promise<Config>;
}
```

## Creating a New Integration

1. Create a new directory: `src/integrations/<name>/`
2. Add `metadata.json` with name, description, icon
3. Implement the `Integration` interface (extend `BaseIntegration`)
4. Add to registry in `packages/backend/src/api/internal/integrations.ts`
5. Export from `src/index.ts`

### Example: Non-OAuth Integration

```typescript
export class MyIntegration extends BaseIntegration implements ResourceIntegration {
    // Auto-create default links
    onConnect(): { links?: DefaultLink[] } {
        return {
            links: [{ name: "Content", config: { type: "content" } }]
        };
    }

    async validateConnection(connection: IntegrationConnection) {
        // Verify credentials by making an API call
    }

    async push(options: PushOptions): Promise<SyncResult> {
        // Convert content using serializeToHTML/serializeToMarkdown and upload
    }

    async pull(options: PullOptions): Promise<SyncResult[]> {
        // Fetch content and convert using deserializeFromHTML/deserializeFromMarkdown
    }

    async fetchResources(connection: IntegrationConnection): Promise<ExternalResource[]> {
        // List available resources
    }
}
```

## Sync Flow

### Push (Lydie → External)
1. User publishes document
2. Backend identifies linked folder's integration
3. Calls `integration.push()` with document content
4. Integration converts to external format and uploads

### Pull (External → Lydie)
1. User triggers sync on a link
2. Backend calls `integration.pull()`
3. Integration fetches content and converts to TipTap JSON
4. Backend creates documents/folders with `integrationLinkId`

## Serialization

Use `@lydie/core/serialization` directly in push/pull methods:

```typescript
import { serializeToHTML, deserializeFromHTML } from "@lydie/core/serialization";
import { serializeToMarkdown, deserializeFromMarkdown } from "@lydie/core/serialization";
```

