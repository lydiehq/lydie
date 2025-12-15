# Two-Phase Extension Connection Setup

This document explains the two-phase connection setup for extensions in Lydie, specifically implemented for GitHub (but designed to be extensible to other platforms).

## Overview

The extension connection process is split into two phases:

1. **Phase 1: OAuth Authentication** - User authenticates with the external platform (e.g., GitHub)
2. **Phase 2: Configuration Wizard** - User configures specific settings (e.g., repository selection, path configuration)

## Architecture

### Backend (`packages/backend/src/api/internal/extensions.ts`)

The backend provides the following endpoints:

#### Phase 1: OAuth Authentication

1. **POST `/internal/extensions/:type/oauth/authorize`**
   - Initiates OAuth flow
   - Generates authorization URL
   - Returns auth URL to frontend
   - **Authentication**: Requires authenticated user with organization access

2. **GET `/internal/extensions/:type/oauth/callback`**
   - OAuth callback handler (public endpoint)
   - Validates state token (CSRF protection)
   - Exchanges code for access token
   - Creates initial connection in database
   - Redirects to frontend with connection ID
   - **Security**: State token validation, expiration check (5 minutes), organization access verification

#### Phase 2: Configuration

3. **GET `/internal/extensions/:connectionId/repositories`**
   - Fetches available repositories for GitHub connections
   - Returns list of repositories with metadata
   - **Authentication**: Requires authenticated user with organization access

4. **PATCH `/internal/extensions/:connectionId/config`**
   - Updates connection configuration
   - Merges new config with existing config
   - **Authentication**: Requires authenticated user with organization access

#### Sync

5. **POST `/internal/extensions/:connectionId/sync`**
   - Pulls documents from external platform
   - Creates documents in the organization
   - Returns sync results (imported/failed counts)
   - **Authentication**: Requires authenticated user with organization access

### Frontend (`packages/web/src/routes/__auth/w/$organizationId/settings/extensions.tsx`)

The frontend implements two dialogs:

#### Phase 1: Connection Dialog (`ConnectionDialog` + `GitHubConfigForm`)

- User clicks "Add Connection"
- Selects extension type (GitHub, Shopify, WordPress, etc.)
- For GitHub:
  - Displays OAuth information
  - Initiates OAuth flow via backend
  - Redirects to GitHub for authorization

#### Phase 2: Configuration Dialog (`ConfigureConnectionDialog`)

- Automatically opens after successful OAuth callback
- Fetches available repositories from GitHub
- User selects:
  - Repository (required)
  - Branch (defaults to repository's default branch)
  - Base path (optional, for organizing documents in subdirectories)
- Saves configuration and triggers initial sync
- **Note**: Configuration is locked after initial setup (user must disconnect and reconnect to change)

### Extension Implementation (`packages/extensions/src/extensions/github/index.ts`)

The GitHub extension implements:

#### OAuth Methods
- `getOAuthConfig()` - Returns OAuth configuration
- `getOAuthCredentials()` - Returns client ID and secret from SST resources
- `buildAuthorizationUrl()` - Builds GitHub OAuth URL
- `exchangeCodeForToken()` - Exchanges authorization code for access token
- `transformOAuthResponse()` - Transforms OAuth response into extension config

#### Sync Methods
- `validateConnection()` - Validates connection configuration
- `push()` - Pushes document to GitHub (not yet implemented)
- `pull()` - Pulls documents from GitHub repository
- `fetchRepositories()` - Fetches available repositories for authenticated user

#### Conversion Methods
- `convertToExternalFormat()` - Converts TipTap JSON to Markdown (TODO)
- `convertFromExternalFormat()` - Converts Markdown to TipTap JSON (basic implementation)

## Flow Diagram

```
User                  Frontend                Backend                GitHub
  |                      |                       |                      |
  | 1. Click "Connect"   |                       |                      |
  |--------------------->|                       |                      |
  |                      | 2. POST /authorize    |                      |
  |                      |---------------------->|                      |
  |                      |                       | 3. Generate auth URL |
  |                      |<----------------------|                      |
  |                      | 4. Redirect to GitHub |                      |
  |                      |-------------------------------------->|      |
  |                      |                       |                      |
  | 5. Authorize app     |                       |                      |
  |---------------------------------------------------------------->|   |
  |                      |                       | 6. OAuth callback    |
  |                      |                       |<---------------------|
  |                      |                       | 7. Create connection |
  |                      | 8. Redirect with ID   |                      |
  |                      |<----------------------|                      |
  |                      |                       |                      |
  | 9. Config wizard     |                       |                      |
  |<---------------------|                       |                      |
  |                      | 10. GET /repositories |                      |
  |                      |---------------------->|                      |
  |                      |                       | 11. Fetch repos      |
  |                      |                       |--------------------->|
  |                      |<----------------------|                      |
  |                      |                       |                      |
  | 12. Select repo      |                       |                      |
  |--------------------->|                       |                      |
  |                      | 13. PATCH /config     |                      |
  |                      |---------------------->|                      |
  |                      |                       | 14. Update config    |
  |                      |<----------------------|                      |
  |                      |                       |                      |
  |                      | 15. POST /sync        |                      |
  |                      |---------------------->|                      |
  |                      |                       | 16. Pull documents   |
  |                      |                       |--------------------->|
  |                      |                       | 17. Create docs      |
  |                      |<----------------------|                      |
  |                      |                       |                      |
```

## Security Considerations

1. **State Token Protection**
   - CSRF protection via state token
   - State token includes: extension type, organization ID, user ID, nonce, timestamp
   - 5-minute expiration window
   - Validation on callback

2. **Organization Access Control**
   - All authenticated endpoints verify organization membership
   - State token includes organization ID for callback validation

3. **Credentials Management**
   - OAuth credentials stored in SST secrets
   - Access tokens stored encrypted in database (JSONB column)

## Database Schema

### Extension Connections Table
```sql
CREATE TABLE extension_connections (
  id TEXT PRIMARY KEY,
  extension_type TEXT NOT NULL,  -- 'github', 'shopify', 'wordpress'
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config JSONB NOT NULL,         -- Platform-specific config
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

### Sync Metadata Table
```sql
CREATE TABLE sync_metadata (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES extension_connections(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,     -- Path/ID in external system
  last_synced_at TIMESTAMP,
  last_synced_hash TEXT,         -- Content hash for change detection
  sync_status TEXT NOT NULL DEFAULT 'pending',
  sync_error TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(document_id, connection_id)
);
```

## GitHub-Specific Configuration

The GitHub extension stores the following in the `config` field:

```typescript
interface GitHubConfig {
  accessToken: string;           // OAuth access token
  owner: string;                 // Repository owner (user or org)
  repo: string;                  // Repository name
  branch: string;                // Branch to sync (default: "main")
  basePath?: string;             // Optional subdirectory path
  installationId?: string;       // GitHub App installation ID (future)
}
```

## Adding New Extensions

To add a new extension (e.g., Shopify, WordPress):

1. **Create Extension Class** (`packages/extensions/src/extensions/{name}/index.ts`)
   - Extend `BaseSyncExtension`
   - Implement required methods
   - Implement OAuth methods if needed

2. **Register Extension** (`packages/backend/src/api/internal/extensions.ts`)
   ```typescript
   const extensionRegistry = new Map([
     ["github", new GitHubExtension()],
     ["shopify", new ShopifyExtension()],  // Add here
   ]);
   ```

3. **Frontend UI** (`packages/web/src/routes/__auth/w/$organizationId/settings/extensions.tsx`)
   - Add to extensions list
   - Create configuration form component
   - Handle extension-specific configuration

4. **Export Extension** (`packages/extensions/src/index.ts`)
   ```typescript
   export * from "./extensions/shopify";
   ```

## Testing

### Manual Testing Flow

1. Start the backend and frontend
2. Navigate to Settings > Extensions
3. Click "Add Connection"
4. Select "GitHub"
5. Click "Connect with GitHub"
6. Authorize on GitHub (redirects back)
7. See configuration wizard
8. Select repository, branch, and path
9. Click "Save & Sync"
10. Verify documents are imported

### Backend Testing

```bash
# Test OAuth authorization
curl -X POST http://localhost:3000/internal/extensions/github/oauth/authorize \
  -H "Content-Type: application/json" \
  -H "X-Organization-Id: org_xxx" \
  -d '{"redirectUrl": "/settings/extensions"}'

# Test repository fetching
curl http://localhost:3000/internal/extensions/conn_xxx/repositories \
  -H "X-Organization-Id: org_xxx"

# Test configuration update
curl -X PATCH http://localhost:3000/internal/extensions/conn_xxx/config \
  -H "Content-Type: application/json" \
  -H "X-Organization-Id: org_xxx" \
  -d '{"config": {"repo": "my-repo", "branch": "main"}}'

# Test sync
curl -X POST http://localhost:3000/internal/extensions/conn_xxx/sync \
  -H "X-Organization-Id: org_xxx"
```

## Future Enhancements

1. **Bi-directional Sync**
   - Implement push to GitHub on document publish
   - Webhook support for external changes
   - Conflict resolution UI

2. **GitHub App Support**
   - Support GitHub App installations (more secure)
   - Organization-wide installations
   - Fine-grained permissions

3. **Configuration Updates**
   - Allow users to update configuration after initial setup
   - Migration path for changing repositories

4. **Sync Status**
   - Real-time sync status updates
   - Sync history and logs
   - Error recovery flows

5. **Content Conversion**
   - Proper Markdown to TipTap conversion
   - Frontmatter support
   - Asset handling (images, etc.)

## Troubleshooting

### OAuth callback fails
- Check that callback URL matches exactly (including protocol, domain, path)
- Verify state token hasn't expired
- Check organization membership

### Repository list is empty
- Verify GitHub token has correct scopes (`repo`)
- Check that user has access to repositories
- Verify API call is successful (check network tab)

### Sync fails
- Verify repository configuration is correct
- Check that files exist in the specified path
- Verify access token is valid
- Check backend logs for detailed error messages

### Configuration cannot be saved
- Verify connection exists and belongs to organization
- Check that user has organization access
- Verify required fields are provided (repo is required)

