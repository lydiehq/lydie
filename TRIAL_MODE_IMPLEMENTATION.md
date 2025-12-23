# Trial Mode Implementation Summary

## Overview
Implemented a complete trial/unauthenticated mode where users can try the app locally without signing up, with limited features. Upon signup, users can transfer their trial documents to their new organization.

## Key Changes

### 1. Authentication & Context (`packages/zero/src/auth.ts`)
- Added `isTrial` field to `Context` type
- Created `isTrialMode()` helper function
- Created `isAuthenticatedOrTrial()` helper for trial-compatible operations
- Updated `hasOrganizationAccess()` to automatically allow trial mode operations

### 2. Zero Initialization (`packages/web/src/components/zero/ZeroInit.tsx`)
- Set `cacheURL` to `null` for unauthenticated users (enables client-only mode)
- Generate persistent trial user ID stored in localStorage (`lydie:trial-user-id`)
- Add `isTrial: true` flag to context for trial users

### 3. Mutators (`packages/zero/src/mutators.ts`)
- Added trial mode checks to restrict features:
  - ✅ Allowed: document CRUD, folder CRUD
  - ❌ Blocked: document.publish, integrations.*, apiKey.*, assistantConversation.*
- Trial-restricted mutators throw helpful error messages

### 4. Feature Gates
- Created `useIsTrial()` hook (`packages/web/src/hooks/useIsTrial.ts`)
- Updated UI components to hide trial-restricted features:
  - **Sidebar**: Hide Assistant link
  - **DocumentSettingsDialog**: Hide publishing section
  - **CommandMenu**: Hide publish, assistant, integrations, import options
  - **Settings Navigation**: Hide AI Settings, Billing, Integrations, Import routes

### 5. Data Transfer System
- **Transfer Utilities** (`packages/web/src/utils/trial-transfer.ts`):
  - `getTrialData()` - Reads documents and folders from trial instance
  - `transferTrialData()` - Copies data to authenticated organization
  - `clearTrialData()` - Removes trial data after transfer
  - `hasTrialData()` - Checks if trial data exists
  - Smart folder hierarchy sorting to handle parent/child relationships

- **Transfer Modal** (`packages/web/src/components/trial/TransferModal.tsx`):
  - Shows summary of trial documents and folders
  - "Transfer Data" and "Start Fresh" options
  - Loading, success, and error states
  - Cannot be dismissed during transfer

### 6. Onboarding Integration (`packages/web/src/routes/__auth/onboarding/index.tsx`)
- Checks for trial data on component mount
- Caches trial data before organization creation
- Shows TransferModal after organization creation if trial data exists
- Navigates to new workspace after transfer completes

## User Flow

### Trial Mode
1. User opens app without authentication
2. Zero initializes with `cacheURL=null` (client-only mode)
3. Persistent trial user ID generated and stored
4. User can create/edit/delete documents and folders locally
5. Trial-restricted features are hidden (AI, integrations, publishing)

### Signup & Transfer
1. User signs up for an account
2. Onboarding page detects existing trial data
3. User creates their first organization
4. TransferModal appears showing trial data summary
5. User chooses to:
   - **Transfer Data**: Documents and folders copied to new organization
   - **Start Fresh**: Trial data is discarded
6. Trial user ID cleared from localStorage
7. User navigated to their new workspace

## Technical Details

### Trial Data Storage
- All trial data stored in IndexedDB via Zero's client-side storage
- No server synchronization (cacheURL=null)
- Persists across page refreshes
- Cleared after transfer or when starting fresh

### Organization Handling
- Trial mode bypasses organization validation in mutators
- Documents/folders created without `organization_id` checks
- On transfer, all content gets proper `organization_id`

### ID Generation
- Trial users get persistent ID: `trial-{uuid}` stored in localStorage
- New IDs generated for all transferred documents/folders
- Folder hierarchy preserved during transfer

### Error Handling
- Graceful error messages for trial-restricted features
- Transfer failures show retry option
- Clearing trial data failures don't block user flow

## Testing Checklist

- [x] Trial user can create/edit/delete documents locally
- [x] Trial user can create/move folders
- [x] Trial user cannot access integrations/AI/publishing
- [x] Trial data persists across page refreshes
- [x] Transfer modal appears after signup
- [x] Data transfers correctly to new organization
- [x] Trial data is cleared after transfer
- [x] Starting fresh discards trial data properly
- [x] Authenticated users don't see trial-restricted UI

## Future Improvements

1. Add trial mode banner/indicator in UI
2. Add trial data size limits
3. Add trial session expiration
4. Add analytics for trial conversion rates
5. Add onboarding tooltips for trial users
6. Consider trial mode for specific organizations (e.g., demo workspaces)

