# Wiring hosted mode

How `apps/web` and `apps/desktop` run a window against the hosted core with `@lydie/sync`. The
scope (local or hosted) is decided once per window at startup and never changes while it is open:
signing in, signing out, a different user signing in, or a hand-off all reopen the window.

## Web (`apps/web/src/compose.ts`)

Everything runs in the page: store (OPFS), runtime, PowerSync connector, collab pool.

```ts
import { createEventHub, createLocalBackend, markdownExtract } from "@lydie/app/backend";
import { LYDIE_VERSION } from "@lydie/contract";
import { createRuntime } from "@lydie/runtime";
import { openWebStore } from "@lydie/store/web";
import {
  createHostedBackendParts,
  createIndexedDbYjsPersistence,
  createScopePreference,
  createSession,
  hostedDatabaseName,
  SignInRequiredError,
} from "@lydie/sync";

const API_URL = import.meta.env.VITE_LYDIE_API_URL ?? "http://localhost:4100";
const session = createSession({
  baseUrl: API_URL,
  secrets: platform.secrets,
  version: LYDIE_VERSION,
});
const scopes = createScopePreference(platform.secrets); // or a localStorage-backed KeyValueStorage
const choice = await scopes.choose(await session.restore(), { kind: "local", workspaceId: null });

if (choice.scope.kind === "hosted") {
  const hub = createEventHub();
  const blob = await createBrowserBlob();
  const hosted = await createHostedBackendParts({
    scope: choice.scope,
    baseUrl: API_URL,
    version: LYDIE_VERSION,
    secrets: platform.secrets,
    session,
    openStore: ({ dbFilename, mode }) => openWebStore({ dbFilename, mode }),
    createRuntime: ({ store, actor }) =>
      createRuntime<Operations>({
        ...store.ports,
        registry: handledOperations(),
        blob,
        events: hub.port,
        extract: markdownExtract,
        actor,
      }),
    blob,
    // Offline body edits in the same database (or createIndexedDbYjsPersistence(name)).
    yjs: (_user, store) => store.yjs,
  });
  const backend = createLocalBackend({
    store: hosted.store,
    runtime: hosted.runtime,
    blob,
    events: hub,
    info: { mode: "synced", workspaceId: hosted.workspaceId, workspaceName, persistent: true },
    status: hosted.backendStatus, // needs the createLocalBackend option, see below
  });
  await hosted.start();
  hosted.needsReopen.subscribe((reopen) => reopen && location.reload());
  // The editor binds to hosted.collab.open(docId): { ydoc, awareness, state, loaded, release }.
}
// choice.reason === "needs-sign-in": show sign-in (session.signIn / signUp), then
// `await scopes.set(choice.wanted); location.reload()`.
```

### "Copy to cloud" from the no-login web app

```ts
import { planHandoff, runHandoff } from "@lydie/sync";

await session.signIn({ email, password }); // or signUp
const ws = await session.createWorkspace({ name: "My notes" }); // or pick from session.workspaces()
const general = (await session.teamspaces(ws.id)).find((t) => t.isDefault)!;
const target = {
  api: session.api,
  userId: session.user()!.id,
  workspaceId: ws.id,
  teamspaceId: general.id,
  version: LYDIE_VERSION,
};
const plan = await planHandoff({ store, workspaceId: workspace.id, blob }, target);
// Show plan.summary (counts, existingInTarget, conflicts, missingBytes, warnings); on confirm:
const result = await runHandoff(plan, { bodies: { toYjs }, storage: localStorageKv, onProgress });
if (result.ok) {
  await scopes.set(result.scope);
  location.reload(); // the window reopens in hosted scope; the local database is left untouched
}
```

`toYjs(markdown)` converts a body into the editor's Yjs document (`@lydie/markdown` → ProseMirror
JSON with the editor schema → `prosemirrorJSONToYDoc(schema, json, "default")` from
`@tiptap/y-tiptap`). Without it the server builds bodies from the Markdown sent with each
`doc.create` (once its codec is deployed); the run skips any body the server already has.
Re-running after a failure or a closed tab is safe: every operation id is derived from the
target and the document, so the server answers `duplicate`.

## Desktop (Electron)

Wired in `apps/desktop/src/main/hosted.ts` and `apps/web/src/desktop.ts`:

- The main process owns the session (`createSession` with the platform's keychain-backed secret
  store) and makes its HTTP calls with `node:http(s)`: Electron's `fetch` adds `Sec-Fetch-*` headers,
  and the auth endpoints then refuse a request without an Origin.
- Each window's scope is decided once (`HostedManager.scopeFor`): a folder window shows its folder;
  a window without one opens the remembered hosted workspace when signed in, else a start screen.
  `setScope` applies on the window's next load.
- Per hosted workspace main runs `createHostedBackendParts` (no `yjs`) + `createLocalBackend`, served
  over the existing backend service (`registerVaultServices(..., hostedBackendFor)`).
- The account service (`accountService` here) gives the renderer sign-in, workspaces, any hosted API
  request, collab tokens and the sync status stream.
- The renderer runs collab: `createCollab({ token: () => account.collabToken, persistence:
  createIndexedDbYjsPersistence(hostedDatabaseName(userId)), gate })`, with the gate waiting for the
  `doc.access` live query of the remote backend.

## What the UI shows

- `hosted.status` (`SyncStatus`): `state` is one of `signed-out`, `auth-expired`, `offline`,
  `connecting`, `syncing`, `synced`, `error`, with `pendingOperations`, `pendingUploads`,
  `uploading` (bytes per attachment), `rejected`, `lastSyncedAt`, `error`, `retryAt`.
  `hosted.backendStatus` is the same folded into the plugin API's `BackendStatus`
  (`auth-expired`/`signed-out` become `sync: "error"` with `error` set to the phase).
- `hosted.sync.rejected`: changes the server refused (`operation`, `input`, `reason.code`,
  `reason.message`). Show them ("Your rename of X could not be saved: no edit access"), then
  `hosted.sync.dismissRejected()`. The rows already show the server's state again.
- Per document: `collab.open(id).state` (`loading`, `offline`, `connecting`, `syncing`, `synced`,
  `unavailable` with `reason`, `auth-expired`; plus `readOnly` and `level`). Make the editor
  read-only when `readOnly`; replace it with an "access removed" view when `unavailable`.

## Teamspaces

New top-level pages go to the workspace's default teamspace, which every member shares, unless
`doc.create` says otherwise: pass `teamspaceId` (another teamspace, or null for the creator's
private section) in its input. The runtime records the
input as given and the upload sends it unchanged; a child always inherits its parent's space, and
local mode ignores the field.
