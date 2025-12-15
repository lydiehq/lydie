# @lydie/extensions

A package for managing document sync extensions to external platforms.

## Creating a New Extension

Extend `BaseSyncExtension` and implement the required methods:

```typescript
import { BaseSyncExtension } from "@lydie/extensions";
import type {
  ExtensionConnection,
  PushOptions,
  SyncResult,
} from "@lydie/extensions";

export class MyExtension extends BaseSyncExtension {
  readonly type = "my-platform";
  readonly name = "My Platform";
  readonly description = "Sync documents to My Platform";

  async validateConnection(connection: ExtensionConnection): Promise<{
    valid: boolean;
    error?: string;
  }> {
    // Validate the connection configuration
    return { valid: true };
  }

  async push(options: PushOptions): Promise<SyncResult> {
    const { document, connection } = options;
    // Push document to external platform
    return this.createSuccessResult(document.id);
  }

  async convertToExternalFormat(content: any): Promise<string> {
    // Convert TipTap JSON to platform-specific format
    return "";
  }
}
```

## Registering an Extension

```typescript
import { extensionRegistry } from "@lydie/extensions";
import { MyExtension } from "./extensions/my-platform";

const myExtension = new MyExtension();
extensionRegistry.register(myExtension);
```

## Optional Methods

Extensions can optionally implement:

- `pull(options: PullOptions)`: Pull documents from the external platform
- `checkConflicts(document, connection)`: Detect conflicts before pushing
- `getSyncMetadata(documentId, connection)`: Get sync status information
- `convertFromExternalFormat(content)`: Convert from external format back to TipTap JSON

For OAuth-based authentication, implement the `OAuthExtension` interface methods.
