# Real-time Collaboration Setup Guide

This document describes the real-time collaborative editing implementation using Yjs (CRDTs) and TipTap.

## Architecture Overview

The collaboration system uses:
- **Yjs** - CRDT library for conflict-free collaborative editing
- **y-websocket** - WebSocket provider for real-time sync
- **TipTap Collaboration Extensions** - Integration between TipTap and Yjs
- **Zero** - Continues to handle metadata (title, folders, permissions)

## Components

### Backend

1. **Yjs WebSocket Server** (`packages/backend/src/yjs-server.ts`)
   - Runs on port 1234
   - Handles WebSocket connections for document rooms
   - Implements authentication via better-auth session tokens
   - Verifies user has organization membership for document access
   - Periodic persistence to PostgreSQL (every 30 seconds)

2. **Authentication Flow**
   - Client passes `better-auth.session_token` cookie as query parameter
   - Server verifies session with better-auth
   - Server checks user is member of document's organization
   - Connection rejected if authentication fails

### Frontend

1. **Collaborative Editor Hook** (`packages/web/src/utils/collaborative-editor.ts`)
   - Creates Yjs document and WebSocket provider
   - Configures TipTap with Collaboration and CollaborationCursor extensions
   - Generates consistent colors for users
   - Handles cleanup on unmount

2. **Editor Component** (`packages/web/src/components/Editor.tsx`)
   - Uses collaborative editor hook instead of regular editor
   - Removes auto-save for content (Yjs handles sync)
   - Keeps title auto-save through Zero
   - Displays presence indicators

3. **Presence Indicators** (`packages/web/src/components/editor/PresenceIndicators.tsx`)
   - Shows connection status
   - Displays active collaborators with avatars
   - Shows "X people editing" count

## Installation

Dependencies have been added to:
- `packages/web/package.json`: yjs, y-websocket, @tiptap/extension-collaboration, @tiptap/extension-collaboration-cursor
- `packages/backend/package.json`: yjs, y-websocket

Run:
```bash
bun install
```

## Running the System

1. **Start the backend** (includes Yjs server):
   ```bash
   cd packages/backend
   bun run dev
   ```
   This starts both the main API server (port 3001) and Yjs server (port 1234)

2. **Start the frontend**:
   ```bash
   cd packages/web
   bun run dev
   ```

3. **Environment Variables**:
   Add to your `.env` file:
   ```bash
   VITE_YJS_SERVER_URL=ws://localhost:1234
   ```

## Testing Scenarios

### Test 1: Two Users Editing Simultaneously

1. Open the app in two different browsers (e.g., Chrome and Firefox)
2. Log in with different accounts in each browser
3. Navigate to the same document in both browsers
4. Start typing in both editors simultaneously
5. ✅ **Expected**: Changes from both users appear in real-time without conflicts

### Test 2: Presence Indicators

1. Open the same document in two browsers
2. ✅ **Expected**: 
   - Connection status shows "Connected" with green dot
   - Presence indicators show "1 person editing"
   - Avatar with user's initial and color appears

### Test 3: Cursor Positions

1. Open the same document in two browsers
2. Click in different positions in each editor
3. ✅ **Expected**: 
   - Each user's cursor position is visible to the other
   - Cursor shows user's name and color
   - Cursor moves as user types

### Test 4: Offline Editing and Sync

1. Open a document
2. Disconnect from network (or close WebSocket in DevTools)
3. Make edits while offline
4. Reconnect to network
5. ✅ **Expected**: 
   - Connection status shows "Connecting..." while offline
   - Edits are queued locally
   - When reconnected, changes sync automatically
   - No data loss

### Test 5: Authentication

1. Try to connect without being logged in
2. ✅ **Expected**: Connection rejected, WebSocket closes

### Test 6: Authorization

1. Log in as user A
2. Try to access a document in organization B (where user A is not a member)
3. ✅ **Expected**: Connection rejected with "Access denied"

### Test 7: Server Restart

1. Open a document with multiple users
2. Restart the backend server
3. ✅ **Expected**: 
   - Clients automatically reconnect
   - Document state is preserved
   - Collaboration continues seamlessly

### Test 8: Large Documents

1. Create a document with 1000+ lines of text
2. Have 3+ users editing simultaneously
3. ✅ **Expected**: 
   - No lag or performance issues
   - All changes sync in real-time
   - Cursor positions remain accurate

### Test 9: Rapid Typing

1. Two users type rapidly in the same paragraph
2. ✅ **Expected**: 
   - No characters lost
   - No duplicate characters
   - Text merges correctly without conflicts

### Test 10: Title Editing

1. Edit the document title
2. ✅ **Expected**: 
   - Title updates through Zero (not Yjs)
   - Title change visible to all users
   - No conflicts with content editing

## Troubleshooting

### WebSocket Connection Fails

- Check that backend is running on port 1234
- Verify `VITE_YJS_SERVER_URL` is set correctly
- Check browser console for WebSocket errors
- Verify session token is being passed correctly

### Authentication Errors

- Check that user is logged in
- Verify session token cookie exists
- Check backend logs for authentication errors
- Ensure user is member of document's organization

### Changes Not Syncing

- Check connection status indicator
- Verify WebSocket is connected in DevTools Network tab
- Check for JavaScript errors in console
- Restart both frontend and backend

### Performance Issues

- Check number of active connections in backend logs
- Monitor memory usage of Yjs server
- Consider implementing garbage collection for old documents
- Check network latency

## Production Considerations

### Security

- ✅ Authentication implemented via better-auth
- ✅ Authorization checks organization membership
- ⚠️ Consider adding rate limiting for WebSocket connections
- ⚠️ Consider adding document-level permissions (read/write)

### Scalability

- Current implementation: Single Yjs server
- For production: Consider Redis adapter for multi-server setup
- Monitor WebSocket connection count
- Implement connection pooling if needed

### Persistence

- Current: Periodic snapshots every 30 seconds
- Consider: Save on document close or idle timeout
- Consider: Implement proper Yjs state serialization to PostgreSQL
- Consider: Store Yjs updates in separate table for history

### Monitoring

- Add metrics for:
  - Active WebSocket connections
  - Documents with active collaborators
  - Sync latency
  - Authentication failures
  - Memory usage

## Future Enhancements

1. **Commenting System**: Add collaborative comments using Yjs
2. **Version History**: Store Yjs updates for time-travel debugging
3. **Conflict Resolution UI**: Show conflicts if they occur (rare with CRDTs)
4. **Offline Mode**: Better offline editing with IndexedDB persistence
5. **Performance**: Implement document sharding for very large documents
6. **Analytics**: Track collaboration patterns and usage

## References

- [Yjs Documentation](https://docs.yjs.dev/)
- [TipTap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)
- [y-websocket](https://github.com/yjs/y-websocket)

