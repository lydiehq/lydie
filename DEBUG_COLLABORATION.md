# Debugging Collaboration Issues

## Debug Logs Added

I've added comprehensive logging to help diagnose collaboration issues. Here's what to look for in the console:

### Backend Logs (Terminal)

**Connection & Authentication:**
```
[Hocuspocus] 🔐 Authenticating connection for document: <doc-id>
[Hocuspocus] 👤 User: <name> (<user-id>)
[Hocuspocus] ✅ Authentication successful for <name>
[Hocuspocus] 🔌 Client connected to document: <doc-id> (socket: <socket-id>)
```

**Loading State from Database:**
```
[Hocuspocus] 📖 Fetching document: <doc-id>
[Hocuspocus] ✅ Loaded document <doc-id> (12345 bytes)
```
OR
```
[Hocuspocus] ⚠️  No state found for document: <doc-id>
```

**Saving State to Database:**
```
[Hocuspocus] 📝 Document changed: <doc-id> (will save in 25000ms)
[Hocuspocus] 💾 Storing document: <doc-id> (12345 bytes)
[Hocuspocus] ✅ Saved document: <doc-id>
```

**Disconnection:**
```
[Hocuspocus] 🔌 Client disconnected from document: <doc-id> (socket: <socket-id>)
```

### Frontend Logs (Browser Console)

**WebSocket Connection:**
```
[SharedWebSocket] 🌐 Creating new shared WebSocket connection to: ws://localhost:3001/yjs
[SharedWebSocket] ✅ WebSocket connected
```
OR
```
[SharedWebSocket] ♻️  Reusing existing shared WebSocket connection
```

**Document Initialization:**
```
[DocumentEditor] 📄 Initializing document: <doc-id>
[DocumentEditor] 📥 Applying initial Yjs state (12345 bytes)
[DocumentEditor] ✅ Initial state applied
[DocumentEditor] 🔌 Connecting to WebSocket: ws://localhost:3001/yjs
[DocumentEditor] 🔗 Provider attached for document: <doc-id>
```

**Provider Status:**
```
[DocumentEditor] 👂 Listening for provider events on document: <doc-id>
[DocumentEditor] 📡 Provider status changed: connected (doc: <doc-id>)
[DocumentEditor] ✅ Provider synced: true (doc: <doc-id>)
[DocumentEditor] 🔌 Provider connected (doc: <doc-id>)
```

**Cleanup:**
```
[DocumentEditor] 🧹 Cleaning up document: <doc-id>
```

## Debugging Workflow

### 1. Check Initial Load

When you open a document, you should see:

**Browser:**
```
[DocumentEditor] 📄 Initializing document: abc-123
[DocumentEditor] 📥 Applying initial Yjs state (5432 bytes)  ← Should have bytes!
[DocumentEditor] ✅ Initial state applied
[SharedWebSocket] ♻️  Reusing existing shared WebSocket connection
[DocumentEditor] 🔗 Provider attached for document: abc-123
[DocumentEditor] 📡 Provider status changed: connected
[DocumentEditor] ✅ Provider synced: true
```

**Backend:**
```
[Hocuspocus] 🔐 Authenticating connection for document: abc-123
[Hocuspocus] ✅ Authentication successful
[Hocuspocus] 📖 Fetching document: abc-123
[Hocuspocus] ✅ Loaded document abc-123 (5432 bytes)  ← Should match frontend!
[Hocuspocus] 🔌 Client connected to document: abc-123
```

### 2. Check Changes are Being Saved

When you edit a document:

**Backend (after 25 seconds):**
```
[Hocuspocus] 📝 Document changed: abc-123 (will save in 25000ms)
[Hocuspocus] 💾 Storing document: abc-123 (5678 bytes)  ← Bytes should increase!
[Hocuspocus] ✅ Saved document: abc-123
```

### 3. Check Refresh Loads Latest State

When you refresh the page:

**Browser:**
```
[DocumentEditor] 📥 Applying initial Yjs state (5678 bytes)  ← Should match saved bytes!
```

## Common Issues & Solutions

### Issue: "No initial Yjs state found in document"

```
[DocumentEditor] ⚠️  No initial Yjs state found in document
```

**Cause:** The document doesn't have any Yjs state in the database yet.

**Solution:** This is normal for brand new documents. Once you type something and wait 25 seconds, it should save.

### Issue: "No state found for document"

```
[Hocuspocus] ⚠️  No state found for document: abc-123
```

**Cause:** Document doesn't exist in the database, or `yjs_state` field is NULL.

**Solution:** Check that the document ID is correct and exists in the database.

### Issue: Provider never syncs

```
[DocumentEditor] 📡 Provider status changed: connecting
[DocumentEditor] 📡 Provider status changed: connecting
[DocumentEditor] 📡 Provider status changed: connecting
```

**Cause:** WebSocket not connecting properly.

**Solutions:**
1. Check backend is running on port 3001
2. Check `/yjs` endpoint exists (try: `curl http://localhost:3001/`)
3. Check for CORS issues
4. Look for authentication errors in backend logs

### Issue: Authentication failed

```
[Hocuspocus] ❌ Authentication failed
[DocumentEditor] ❌ Authentication failed (doc: abc-123): <reason>
```

**Cause:** Session invalid or user doesn't have access.

**Solutions:**
1. Make sure you're logged in
2. Check that you're a member of the organization
3. Verify the session cookie is being sent

### Issue: State not persisting after refresh

**Expected flow:**
1. Edit document → see changes
2. Wait 25 seconds → see save log: `[Hocuspocus] ✅ Saved document`
3. Refresh page → see load log: `[Hocuspocus] ✅ Loaded document (X bytes)`
4. Changes should appear

**If not working:**

Check these in order:
1. ✅ Is the save log appearing after 25 seconds?
2. ✅ Are the saved bytes > 0?
3. ✅ Does the load log show the same number of bytes?
4. ✅ Is the frontend applying the initial state?

### Issue: Multiple WebSocket connections

**Check:** Open DevTools → Network → WS filter

**Expected:** ONE connection to `ws://localhost:3001/yjs`

**If multiple connections:**
- Something is wrong with the shared WebSocket implementation
- Check for: `[SharedWebSocket] ♻️  Reusing existing shared WebSocket connection`
- Should see this for tabs 2+

## Testing Checklist

### Test 1: Basic Persistence
- [ ] Open document
- [ ] Type "Hello World"
- [ ] Wait 30 seconds
- [ ] See: `[Hocuspocus] ✅ Saved document`
- [ ] Refresh page
- [ ] "Hello World" should still be there

### Test 2: Real-time Collaboration
- [ ] Open document in two browser tabs (Tab A, Tab B)
- [ ] Type "Tab A" in Tab A
- [ ] See text appear in Tab B immediately
- [ ] Type "Tab B" in Tab B
- [ ] See text appear in Tab A immediately

### Test 3: Multiplexing
- [ ] Open 3 documents in 3 tabs
- [ ] Check DevTools → Network → WS
- [ ] Should see ONLY ONE WebSocket connection
- [ ] All 3 documents should sync properly

### Test 4: Persistence After Multiplexing
- [ ] Open document in Tab 1
- [ ] Edit in Tab 1
- [ ] Wait 30 seconds
- [ ] Open same document in Tab 2 (without refreshing Tab 1)
- [ ] Both tabs should show same content
- [ ] Edit in Tab 2
- [ ] Changes should appear in Tab 1

## Useful Browser Commands

Open browser console and run these to see current state:

```javascript
// Check if shared WebSocket exists
console.log("SharedWebSocket exists:", !!window.__sharedSocket);

// Check provider status
// (You'll need to access this from the component)
```

## Backend Database Check

Check if state is being saved to database:

```sql
-- Check if document has Yjs state
SELECT 
  id, 
  title, 
  LENGTH(yjs_state) as state_size_bytes,
  updated_at
FROM documents 
WHERE id = 'your-document-id';
```

Should return:
- `state_size_bytes` > 0 (not NULL)
- `updated_at` should update when you edit

## Next Steps

1. **Restart your dev server** to load the new logging code
2. **Open browser console** (F12)
3. **Open a document** and watch the logs
4. **Make an edit** and wait 30 seconds
5. **Refresh the page** and check if changes persist

Report back with the console logs if something's not working!
