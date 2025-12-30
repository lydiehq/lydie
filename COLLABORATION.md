# Real-Time Collaboration with Hocuspocus

Lydie's document editor features real-time collaborative editing powered by Hocuspocus, TipTap, and Yjs CRDTs.

## Architecture

```
Client (Browser)                Backend (Bun)                 Data Layer
┌────────────────┐             ┌──────────────┐             ┌─────────────┐
│ TipTap Editor  │◄───────────►│  Hocuspocus  │             │ PostgreSQL  │
│                │   WebSocket  │   Server     │             │             │
│ Collaboration  │             │              │             │  Zero Sync  │
│  Extensions    │             │ • Auth       │             │   Engine    │
│                │             │ • Access     │             │             │
└────────────────┘             └──────────────┘             └─────────────┘
        │                              │                            │
        │                              │                            │
        └──────── Yjs CRDT ────────────┴────────── Metadata ───────┘
```

## Components

### Backend (`packages/backend/src/hocuspocus-server.ts`)

**Hocuspocus Server**: WebSocket server built on Yjs

- **Authentication**: Integrates with better-auth session tokens
- **Authorization**: Verifies organization membership before allowing access
- **Bun WebSocket Adapter**: Bridges Hocuspocus with Bun's native WebSocket API
- **Persistence**: Client-side sync to Zero for TipTap JSON storage

**Key Features**:

- Document-level access control
- Real-time synchronization with automatic conflict resolution
- Debounced persistence (30 seconds)
- User presence and awareness

### Frontend (`packages/web/src/utils/collaborative-editor.ts`)

**HocuspocusProvider**: Manages real-time collaboration

- Connects to Hocuspocus server via WebSocket
- Handles user presence and cursor positions
- Integrates with TipTap Collaboration extensions

**Key Features**:

- Collaborative cursors with user names and colors
- Presence indicators showing active editors
- Offline editing with automatic sync on reconnect
- Graceful cleanup on unmount

### Integration Points

1. **Content Sync**: Yjs handles real-time document content through CRDTs
2. **Metadata Sync**: Zero handles titles, folders, permissions via PostgreSQL
3. **Persistence**: Client periodically syncs TipTap JSON to Zero for embeddings and integrations

## Authentication Flow

```
1. User opens document
   ↓
2. WebSocket connection to /yjs/{documentId}
   ↓
3. Browser automatically sends session cookie with upgrade request
   ↓
4. Server verifies session with better-auth using cookie
   ↓
5. Server checks organization membership
   ↓
6. Connection accepted or rejected
   ↓
7. Real-time collaboration begins
```

## Production Deployment

- **Endpoint**: `wss://api.lydie.co/yjs/{documentId}`
- **Authentication**: HttpOnly session cookies (automatically sent by browser)
- **Port**: WebSocket integrated with main Bun server (port 3001)
- **Scaling**: Can add Redis adapter for multi-server deployment

## Testing

Run the test script:

```bash
cd packages/backend
bun run src/test-hocuspocus-connection.ts
```

## Dependencies

**Backend**:

- `@hocuspocus/server` - WebSocket collaboration server
- `@hocuspocus/extension-logger` - Development logging
- `yjs` - CRDT library

**Frontend**:

- `@hocuspocus/provider` - WebSocket client
- `@tiptap/extension-collaboration` - TipTap + Yjs integration
- `@tiptap/extension-collaboration-caret` - Collaborative cursors
- `yjs` - CRDT library

## Zero Integration

Hocuspocus handles real-time content synchronization, while Zero manages:

- Document metadata (title, slug, custom fields)
- Folder structure
- User permissions
- Embedding generation triggers
- Integration syncs

This hybrid approach provides:

- Low-latency real-time editing via Yjs/Hocuspocus
- Robust metadata management via Zero
- Automatic embedding generation via PostgreSQL change streams

## Future Enhancements

- Redis adapter for horizontal scaling
- Version history using Yjs updates
- Inline comments and annotations
- Document-level read/write permissions
- Yjs binary state storage for faster loading
