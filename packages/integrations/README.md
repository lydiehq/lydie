# @lydie/integrations

A package for managing document sync integrations to external platforms.

## Creating a New Integration

Extend `BaseIntegration` and implement the required methods:

```typescript
import { BaseIntegration } from "@lydie/integrations";
import type {
  IntegrationConnection,
  PushOptions,
  SyncResult,
} from "@lydie/integrations";

export class MyIntegration extends BaseIntegration {
  readonly type = "my-platform";
  readonly name = "My Platform";
  readonly description = "Sync documents to My Platform";

  async validateConnection(connection: IntegrationConnection): Promise<{
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

## Registering an Integration

```typescript
import { integrationRegistry } from "@lydie/integrations";
import { MyIntegration } from "./integrations/my-platform";

const myIntegration = new MyIntegration();
integrationRegistry.register(myIntegration);
```

## Optional Methods

Integrations can optionally implement:

- `pull(options: PullOptions)`: Pull documents from the external platform
- `checkConflicts(document, connection)`: Detect conflicts before pushing
- `getSyncMetadata(documentId, connection)`: Get sync status information
- `convertFromExternalFormat(content)`: Convert from external format back to TipTap JSON

For OAuth-based authentication, implement the `OAuthIntegration` interface methods.
