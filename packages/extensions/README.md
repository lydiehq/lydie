# @lydie/extensions

A package for managing document sync extensions to external platforms like GitHub, Shopify, WordPress, etc.

## Architecture

This package provides a common interface for implementing sync extensions that allow documents to be pushed to external platforms when published.

### Core Concepts

- **SyncExtension**: The base interface that all extensions must implement
- **OAuthExtension**: Interface for OAuth-based authentication
- **ExtensionRegistry**: Manages available extensions
- **SyncDocument**: The document format that extensions work with
- **ExtensionConnection**: Configuration for connecting to external platforms

### Key Features

- **OAuth 2.0 Support**: Generic OAuth implementation works across multiple providers
- **Push on Publish**: Documents are synced when the "publish" feature is triggered (not automatic)
- **Conflict Detection**: Extensions can detect and report conflicts before pushing
- **Format Conversion**: Extensions handle converting TipTap JSON to platform-specific formats (e.g., Markdown for GitHub)
- **Extensible**: New platforms can be added by implementing the `SyncExtension` interface

## Setup

### GitHub OAuth App

See [GITHUB_SETUP.md](./GITHUB_SETUP.md) for detailed setup instructions.

Quick start:

```bash
# Set GitHub OAuth credentials
sst secret set GitHubClientId "your_client_id"
sst secret set GitHubClientSecret "your_client_secret"
```

## Usage

### Implementing a New Extension

```typescript
import { BaseSyncExtension } from "@lydie/extensions";

export class MyExtension extends BaseSyncExtension {
  readonly type = "my-platform";
  readonly name = "My Platform";
  readonly description = "Sync documents to My Platform";

  async validateConnection(connection) {
    // Validate the connection config
  }

  async push(options) {
    // Push document to external platform
  }

  async convertToExternalFormat(content) {
    // Convert TipTap JSON to platform format
  }
}
```

### Registering an Extension

```typescript
import { extensionRegistry } from "@lydie/extensions";
import { MyExtension } from "./extensions/my-platform";

const myExtension = new MyExtension();
extensionRegistry.register(myExtension);
```

## Current Extensions

- **GitHub**: Sync documents as Markdown files to a GitHub repository (in progress)

## Future Extensions

- Shopify Blog
- WordPress
- Notion
- Confluence
- And more...

## Development Status

🚧 This package is currently in early development. The core interface is established, but implementations are still being built out.
