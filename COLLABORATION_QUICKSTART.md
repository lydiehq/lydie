# Real-time Collaboration - Quick Start Guide

## What Was Implemented

✅ **Real-time collaborative editing** using Yjs (CRDTs) and TipTap  
✅ **Presence indicators** showing who's editing  
✅ **Collaborative cursors** with user names and colors  
✅ **Authentication & authorization** via better-auth  
✅ **Automatic conflict resolution** via CRDTs  
✅ **Offline editing support** with automatic sync when reconnected  

## Quick Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Start the Backend

The backend now includes the Yjs WebSocket server (port 1234):

```bash
cd packages/backend
bun run dev
```

You should see:
```
Yjs WebSocket server running on ws://localhost:1234
```

### 3. Start the Frontend

```bash
cd packages/web
bun run dev
```

### 4. Test It Out

1. Open the app in **two different browsers** (e.g., Chrome and Firefox)
2. Log in with different user accounts
3. Open the **same document** in both browsers
4. Start typing in both editors

**You should see:**
- ✅ Changes appear in real-time in both browsers
- ✅ Presence indicator shows "1 person editing"
- ✅ Colored cursor with the other user's name
- ✅ No conflicts, even when typing in the same location

## Environment Variables

Add to your `.env` file (optional, defaults to localhost):

```bash
VITE_YJS_SERVER_URL=ws://localhost:1234
```

For production:
```bash
VITE_YJS_SERVER_URL=wss://your-domain.com/yjs
```

## Testing the Connection

Run the test script to verify the Yjs server is working:

```bash
cd packages/backend
bun run src/test-yjs-connection.ts
```

Expected output:
```
✅ PASS: Connection rejected (code 4001: Authentication required)
✅ PASS: Connection rejected (code 4002: Invalid authentication)
✅ PASS: Yjs WebSocket server is running and accepting connections
```

## Key Features

### 1. Real-time Sync
- Changes sync instantly between all connected users
- No manual save needed for content (Yjs handles it)
- Title still saves through Zero

### 2. Presence Awareness
- See who's currently editing
- Connection status indicator (green = connected)
- User avatars with initials and colors

### 3. Collaborative Cursors
- See where other users are typing
- Cursors show user names and colors
- Follows user as they type

### 4. Conflict-Free Editing
- CRDTs automatically resolve conflicts
- Multiple users can type in the same paragraph
- No lost characters or duplicate text

### 5. Offline Support
- Edit while offline
- Changes queue locally
- Auto-sync when reconnected

## Architecture

```
┌─────────────┐         ┌──────────────┐
│   Browser 1 │◄───────►│              │
│  (TipTap +  │  WebSocket  Yjs Server  │
│    Yjs)     │         │  (Port 1234) │
└─────────────┘         │              │
                        │   + Auth     │
┌─────────────┐         │   + Persist  │
│   Browser 2 │◄───────►│              │
│  (TipTap +  │         └──────────────┘
│    Yjs)     │                │
└─────────────┘                │
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        │  (Snapshots) │
                        └──────────────┘
```

## Files Changed/Created

### Backend
- ✅ `packages/backend/src/yjs-server.ts` - WebSocket server
- ✅ `packages/backend/src/index.ts` - Start Yjs server
- ✅ `packages/backend/package.json` - Added dependencies

### Frontend
- ✅ `packages/web/src/utils/collaborative-editor.ts` - Collaborative editor hook
- ✅ `packages/web/src/components/Editor.tsx` - Updated to use collaboration
- ✅ `packages/web/src/components/editor/PresenceIndicators.tsx` - Presence UI
- ✅ `packages/web/package.json` - Added dependencies

### Documentation
- ✅ `COLLABORATION_SETUP.md` - Detailed setup guide
- ✅ `COLLABORATION_QUICKSTART.md` - This file

## Troubleshooting

### "Connection rejected" or "Connecting..." forever

**Solution:**
1. Make sure backend is running: `bun run dev` in `packages/backend`
2. Check that port 1234 is not blocked
3. Verify you're logged in with a valid session

### Changes not syncing between browsers

**Solution:**
1. Open browser DevTools → Network tab
2. Look for WebSocket connection to `ws://localhost:1234`
3. Check if it's connected (green indicator)
4. Check browser console for errors

### "Access denied" error

**Solution:**
- Verify both users are members of the same organization
- Check that the document belongs to that organization
- Ensure user has proper permissions

## Next Steps

See `COLLABORATION_SETUP.md` for:
- Detailed testing scenarios
- Production deployment considerations
- Security best practices
- Performance optimization tips
- Future enhancement ideas

## Support

If you encounter issues:
1. Check backend logs for authentication errors
2. Check browser console for WebSocket errors
3. Run the test script: `bun run src/test-yjs-connection.ts`
4. Review `COLLABORATION_SETUP.md` for detailed troubleshooting

---

**🎉 You now have real-time collaborative editing!**

Try opening the same document in multiple browsers and watch the magic happen! ✨

