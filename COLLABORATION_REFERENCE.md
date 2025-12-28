# Real-time Collaboration - Developer Reference

Quick reference for working with the collaborative editing system.

## Quick Commands

```bash
# Install dependencies
bun install

# Start backend (includes Yjs server on port 1234)
cd packages/backend && bun run dev

# Start frontend
cd packages/web && bun run dev

# Test Yjs connection
cd packages/backend && bun run src/test-yjs-connection.ts
```

## Key Components

### Backend

| File | Purpose | Port |
|------|---------|------|
| `packages/backend/src/yjs-server.ts` | WebSocket server for Yjs | 1234 |
| `packages/backend/src/index.ts` | Starts Yjs server with main API | 3001 |

### Frontend

| File | Purpose |
|------|---------|
| `packages/web/src/utils/collaborative-editor.ts` | Editor hook with Yjs |
| `packages/web/src/components/Editor.tsx` | Main editor component |
| `packages/web/src/components/editor/PresenceIndicators.tsx` | Shows active users |

## Environment Variables

```bash
# Frontend (.env)
VITE_YJS_SERVER_URL=ws://localhost:1234  # Development
VITE_YJS_SERVER_URL=wss://your-domain.com/yjs  # Production
```

## API Reference

### Yjs Server

**Endpoint**: `ws://localhost:1234/{documentId}?token={sessionToken}`

**Authentication**: better-auth session token from cookies

**Response Codes**:
- `4001` - Authentication required (no token)
- `4002` - Invalid authentication (bad token)
- `4003` - Access denied (not org member)
- `4004` - Authentication failed (server error)

### Collaborative Editor Hook

```typescript
import { useCollaborativeEditor } from "@/utils/collaborative-editor";

const { editor, provider, ydoc } = useCollaborativeEditor({
  initialContent: doc.json_content,
  documentId: doc.id,
  currentUser: { id: user.id, name: user.name },
  yjsServerUrl: "ws://localhost:1234",
  onUpdate: () => {},
  onSave: () => {},
  onTextSelect: (text) => {},
  onAddLink: () => {},
});
```

**Returns**:
- `editor` - TipTap editor instance
- `provider` - WebSocket provider (for presence)
- `ydoc` - Yjs document (for advanced use)

### Presence Indicators

```typescript
import { PresenceIndicators } from "./editor/PresenceIndicators";

<PresenceIndicators provider={provider} />
```

**Shows**:
- Connection status (green dot = connected)
- Active collaborators (avatars)
- "X people editing" count

## Data Flow

```
User Edit → TipTap → Yjs Doc → WebSocket → Yjs Server → Other Clients
```

**Metadata (title, etc.)**: Still goes through Zero
**Content**: Goes through Yjs for real-time sync

## Common Tasks

### Add New Collaborative Feature

1. Check if feature needs Yjs or Zero:
   - **Yjs**: Document content, selections, cursors
   - **Zero**: Metadata, permissions, folders

2. For Yjs features:
   - Update `collaborative-editor.ts`
   - Add TipTap extension if needed
   - Update presence indicators if showing state

3. For Zero features:
   - Continue using existing patterns
   - No changes to collaboration needed

### Debug Connection Issues

1. Check WebSocket in DevTools Network tab
2. Look for connection to `ws://localhost:1234`
3. Check status (green = connected)
4. View messages for sync activity

**Common Issues**:
- Red/disconnected: Backend not running
- 4001 error: Not logged in
- 4003 error: Not org member

### Monitor Performance

```typescript
// In browser console
const provider = contentEditor.provider;
console.log("Connected:", provider.wsconnected);
console.log("Synced:", provider.synced);
console.log("Active users:", provider.awareness.getStates().size);
```

### Add Logging

```typescript
// In collaborative-editor.ts
provider.on("status", ({ status }) => {
  console.log("Connection status:", status);
});

provider.on("sync", (isSynced) => {
  console.log("Sync status:", isSynced);
});

provider.awareness.on("change", () => {
  console.log("Awareness changed");
});
```

## Architecture Patterns

### When to Use Yjs
- ✅ Document content editing
- ✅ Cursor positions
- ✅ Text selections
- ✅ Inline comments (future)
- ✅ Real-time annotations (future)

### When to Use Zero
- ✅ Document title
- ✅ Folder structure
- ✅ Permissions
- ✅ Metadata
- ✅ User settings

### Hybrid Approach
- **Yjs**: Real-time content sync
- **Zero**: Metadata and permissions
- **PostgreSQL**: Periodic snapshots

## Security Checklist

- ✅ Authentication via better-auth
- ✅ Authorization checks org membership
- ✅ Session tokens from secure cookies
- ✅ WebSocket connections authenticated
- ⚠️ Add rate limiting (production)
- ⚠️ Add document-level permissions (future)

## Performance Tips

### Client-side
- Cleanup providers on unmount (already done)
- Debounce non-critical updates
- Use React.memo for presence components

### Server-side
- Monitor WebSocket connection count
- Implement connection pooling if needed
- Use Redis adapter for multi-server (production)
- Set up proper garbage collection

### Database
- Periodic snapshots (30s, already done)
- Index on document_id for fast lookups
- Consider separate table for Yjs updates

## Testing Checklist

- [ ] Two users can edit simultaneously
- [ ] Presence indicators show correctly
- [ ] Cursors are visible and accurate
- [ ] Offline editing syncs on reconnect
- [ ] Unauthorized users rejected
- [ ] Server restart preserves data
- [ ] Large documents perform well
- [ ] Rapid typing no lost characters

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Connection fails | Backend running? | Start backend |
| 4001 error | Logged in? | Log in |
| 4003 error | Org member? | Check membership |
| Changes not syncing | WebSocket connected? | Check DevTools |
| Performance slow | Too many users? | Check connection count |

## Useful Links

- [Yjs Documentation](https://docs.yjs.dev/)
- [TipTap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)
- [y-websocket GitHub](https://github.com/yjs/y-websocket)

## Quick Reference

```typescript
// Get current user count
provider.awareness.getStates().size

// Get connection status
provider.wsconnected

// Get sync status
provider.synced

// Force sync
provider.connect()

// Disconnect
provider.disconnect()

// Destroy (cleanup)
provider.destroy()
ydoc.destroy()
```

---

**Need more details?** See:
- `COLLABORATION_QUICKSTART.md` - Setup guide
- `COLLABORATION_SETUP.md` - Full documentation
- `COLLABORATION_IMPLEMENTATION_SUMMARY.md` - Implementation details

