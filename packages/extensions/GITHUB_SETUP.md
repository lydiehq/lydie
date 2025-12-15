# GitHub OAuth App Setup Guide

This guide walks you through setting up GitHub OAuth for the extensions sync feature.

## Overview

The GitHub extension uses OAuth 2.0 to securely connect to users' GitHub accounts and sync documents as Markdown files to their repositories.

## Setup Steps

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: `Lydie Document Sync` (or your preferred name)
   - **Homepage URL**:
     - Development: `http://localhost:3000`
     - Production: `https://cloud.lydie.co`
   - **Application description**: `Sync documents from Lydie to GitHub repositories`
   - **Authorization callback URL**:
     - Development: `http://localhost:3001/internal/extensions/github/oauth/callback`
     - Production: `https://api.lydie.co/internal/extensions/github/oauth/callback`
4. Click **"Register application"**

### 2. Get Your Client ID and Secret

After creating the app:

1. Copy the **Client ID**
2. Click **"Generate a new client secret"**
3. Copy the **Client secret** (you won't be able to see it again!)

### 3. Configure SST Secrets

Set the secrets using SST CLI:

```bash
# Development
sst secret set GitHubClientId "your_client_id_here"
sst secret set GitHubClientSecret "your_client_secret_here"

# Production
sst secret set GitHubClientId "your_client_id_here" --stage production
sst secret set GitHubClientSecret "your_client_secret_here" --stage production
```

### 4. Local Development (Alternative)

For local development, you can also use environment variables in a `.env` file:

```bash
# packages/backend/.env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

## OAuth Flow

### User Experience

1. User navigates to **Settings > Extensions**
2. Clicks **"Add Connection"** → **"GitHub"**
3. Clicks **"Connect with GitHub"** button
4. Redirected to GitHub authorization page
5. User authorizes access to their repositories
6. Redirected back to Lydie with connection established
7. User selects which repository to sync to (optional second step)

### Technical Flow

```
┌─────────┐         ┌─────────┐         ┌─────────┐         ┌─────────┐
│ Frontend│         │ Backend │         │ GitHub  │         │Database │
└────┬────┘         └────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │                   │
     │ 1. POST /oauth/   │                   │                   │
     │    authorize      │                   │                   │
     ├──────────────────>│                   │                   │
     │                   │                   │                   │
     │ 2. Return auth URL│                   │                   │
     │   + state token   │                   │                   │
     │<──────────────────┤                   │                   │
     │                   │                   │                   │
     │ 3. Redirect to    │                   │                   │
     │    GitHub OAuth   │                   │                   │
     ├───────────────────────────────────────>│                   │
     │                   │                   │                   │
     │                   │  4. User authorizes                   │
     │                   │                   │                   │
     │                   │ 5. Callback with  │                   │
     │                   │    code + state   │                   │
     │                   │<──────────────────┤                   │
     │                   │                   │                   │
     │                   │ 6. Exchange code  │                   │
     │                   │    for token      │                   │
     │                   ├──────────────────>│                   │
     │                   │                   │                   │
     │                   │ 7. Return access  │                   │
     │                   │    token          │                   │
     │                   │<──────────────────┤                   │
     │                   │                   │                   │
     │                   │ 8. Fetch user info│                   │
     │                   ├──────────────────>│                   │
     │                   │<──────────────────┤                   │
     │                   │                   │                   │
     │                   │                   │  9. Create        │
     │                   │                   │     connection    │
     │                   ├───────────────────────────────────────>│
     │                   │                   │                   │
     │ 10. Redirect to   │                   │                   │
     │     frontend      │                   │                   │
     │<──────────────────┤                   │                   │
```

## API Endpoints

### `POST /internal/extensions/github/oauth/authorize`

Initiates the OAuth flow. Returns the GitHub authorization URL.

**Request:**

```json
{
  "redirectUrl": "/settings/extensions"
}
```

**Response:**

```json
{
  "authUrl": "https://github.com/login/oauth/authorize?...",
  "state": "encoded_state_token"
}
```

### `GET /internal/extensions/github/oauth/callback`

OAuth callback endpoint. GitHub redirects here after authorization.

**Query Parameters:**

- `code`: Authorization code from GitHub
- `state`: State token for CSRF protection

**Redirects to:**

- Success: `{redirectUrl}?success=true&connectionId={id}`
- Error: `{redirectUrl}?error={message}`

### `GET /internal/extensions/:connectionId/repositories`

Fetches available repositories for a connected GitHub account.

**Response:**

```json
{
  "repositories": [
    {
      "name": "my-docs",
      "full_name": "username/my-docs",
      "default_branch": "main"
    }
  ]
}
```

### `PATCH /internal/extensions/:connectionId/config`

Updates connection configuration (e.g., select repository after OAuth).

**Request:**

```json
{
  "config": {
    "repo": "my-docs",
    "branch": "main",
    "basePath": "docs"
  }
}
```

## Security Considerations

1. **State Token**: Random state token prevents CSRF attacks
2. **Token Expiration**: State tokens expire after 5 minutes
3. **Secure Storage**: Access tokens stored encrypted in database
4. **Scopes**: Only request `repo` scope (minimal permissions)
5. **HTTPS Only**: OAuth callbacks must use HTTPS in production

## Scopes Requested

- `repo`: Full control of private repositories
  - Needed to read/write files in repositories
  - Includes: `repo:status`, `repo_deployment`, `public_repo`, etc.

## Testing

### Local Testing

1. Set up ngrok or similar tunnel:

   ```bash
   ngrok http 3001
   ```

2. Update GitHub OAuth App callback URL to ngrok URL:

   ```
   https://your-ngrok-url.ngrok.io/internal/extensions/github/oauth/callback
   ```

3. Test the OAuth flow end-to-end

### Production Testing

1. Ensure secrets are set in production
2. Test with a real GitHub account
3. Verify tokens are stored securely
4. Test repository syncing functionality

## Troubleshooting

### "OAuth credentials not configured"

- Ensure `GitHubClientId` and `GitHubClientSecret` secrets are set
- Check the backend has access to these secrets
- Verify the secrets match your GitHub OAuth app

### "Invalid redirect_uri"

- Ensure the callback URL in GitHub matches exactly
- Check for trailing slashes
- Verify HTTP vs HTTPS

### "Bad verification code"

- State token may have expired (>5 minutes)
- Try initiating OAuth flow again
- Check server time synchronization

## Future Enhancements

1. **GitHub App**: Migrate from OAuth App to GitHub App

   - Better permission model
   - Installation-level tokens
   - Webhook support for bidirectional sync

2. **Token Refresh**: Implement automatic token refresh

   - GitHub OAuth tokens don't expire but can be revoked
   - Add refresh logic for revoked tokens

3. **Repository Selection**: Enhanced UI for selecting repositories
   - Search and filter
   - Organization repositories
   - Repository permissions display

