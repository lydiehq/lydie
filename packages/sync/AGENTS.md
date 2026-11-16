# AGENTS.md - @lydie/sync

Cloud sync peer: session and window scope, PowerSync connector that uploads the runtime's operation
log to `/v1/sync/upload`, Hocuspocus collab pool with offline Yjs persistence, attachment upload
queue, the local → hosted hand-off, one status model, and a composition helper for the apps.
Wiring for web and desktop: `INTEGRATION.md`.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/contract` (pure helpers such as `gettingStartedId`), `@lydie/store`, `@lydie/sdk`.
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.
Contract, runtime and platform types are restated structurally in `src/types.ts`; the runtime is
built by the app and injected (`createRuntime` option).

## Rules

- Optional peer: the app must work without it (local mode).
- No SQL: talk to the database through `@lydie/store` (oplog, uploads, ports). Yjs persistence is a
  port (`YjsPersistence`): IndexedDB on the web, files on Node (`@lydie/sync/node`), memory in tests.
- The upload source is the operation log, never PowerSync's row CRUD queue. CRUD entries are only
  completed, and only after the log was seen empty (see `connector.ts`).
- Never swap a database under a window: a scope is chosen once at startup (`WindowScope`).
- Tests: `bun test` (unit, fake core in `test/fake-core.ts`, in-process Hocuspocus in
  `test/collab-server.ts`). Live: `bun run test:live` against a running hosted core (self-contained,
  skips with a message when the stack is down). Do not use `expect(promise).rejects` on store
  promises (see store/AGENTS.md).

## Public API

```ts
// Session and scope
createSession({ baseUrl, secrets, fetch?, version?, checkTimeoutMs? }): Session
  // signIn rejects with an ApiError coded TWO_FACTOR_REQUIRED when the account has two-step
  // verification; verifySignIn({ code, method: "app" | "backup" }) finishes it (the challenge from the
  // `lydie-two-factor` header, ten minutes). twoFactor.{ hasPassword(), enable(password) → { uri,
  // backupCodes }, confirm(code), disable(password), backupCodes(password) }: confirm and disable
  // take over the session the server replaced them with. setImage(image | null) sets the picture
  // (Better Auth's update-user; the core copies it to the person's memberships) and refreshes the
  // stored user.
  // load(): the stored token and user, no network (windows open from it); check(): the server's
  // answer (fresh details, or expired) within checkTimeoutMs (CHECK_TIMEOUT_MS, 10 s; offline or
  // slow keeps the session); restore() = load, then check.
  // { state: Observable<SessionState>, api: ApiClient, token(), user(), load(), check(), restore(), signIn({email,password}),
  //   signUp({email,password,name?}), socialUrl(provider, returnTo), signInWithToken(oneTimeToken),
  //   signOut(), markExpired(), workspaces(), createWorkspace({name,id?,gettingStarted?}),
  //   teamspaces(workspaceId) }
readProviderReturn(url) → { token } | { error } | null; withoutProviderReturn(url)   // ?login= / ?login_error=
SessionState = signed-out | signed-in { user, token } | expired { user }
WindowScope = { kind: "local", workspaceId | null } | { kind: "hosted", workspaceId }
formatScope, parseScope, hostedDatabaseName(userId), createScopePreference(kv).{ get, set, choose }

// Composition
createHostedBackendParts({ scope, baseUrl, version, secrets, openStore, createRuntime, blob?,
  yjs?: (user, store) => YjsPersistence /* e.g. store.yjs */, session?, fetch?, put?,
  WebSocketPolyfill? }): Promise<HostedParts<R>>   // collab is gated with whenServerHas
whenServerHas(store, docId, signal)   // resolves once the page's access row has synced down
  // { user, session, store, runtime, sync, collab, status, backendStatus, needsReopen, start(), close() }
  // throws SignInRequiredError when signed out

// Sync engine
createHostedSync({ store, api, session, blob?, put?, backoff?, powersync? }): HostedSync
  // { connector, attachments, status: Observable<SyncStatus>, rejected, warnings, dismissRejected(ids?),
  //   start(), stop(), flush() }
  // rejected changes are saved in store.meta ("sync_rejected") and come back after a restart
  // until dismissed (LYD-188)
SyncStatus { state: signed-out|auth-expired|offline|connecting|syncing|synced|error, pendingOperations,
  pendingUploads, uploading, conflicts, rejected, lastSyncedAt, error, retryAt,
  awaitingFirstSync /* signed in, not "error", and no full sync since the engine was created
    (PowerSync's lastSyncedAt is older): the window's data may not be here yet */ }
toBackendStatus(status) -> plugin-api BackendStatus shape; deriveStatus(facts)
createConnector({ api, uploader, oplog, mutex? }) -> PowerSyncBackendConnector & { drain() }
createUploader({ api, oplog, batchSize? (≤500), batchBytes? (MAX_BATCH_BYTES, 4 MB of entry JSON;
  a larger entry goes alone), onRejected?, onWarnings?, onResults?, retries?, backoff? })
  .{ send(entries), drain() }; settle(entries, results), bySize(entries, maxBytes)
OplogPort { list({ limit? }), remove(ids), isEmpty?() }   // isEmpty: the connector's check
  // between CRUD batches without reading an entry (falls back to list({ limit: 1 }))
RejectedChange { operationId, operation, input, workspaceId, createdAt, reason, rejectedAt }

// Collab
createCollab({ api | token, persistence, url?, user?, reconnect?, compactEvery?, flushMs? (500),
  idleDisconnectMs?, gate?: (docId, signal) => Promise<void>, WebSocketPolyfill? }): Collab
  // updates are stored merged (Y.mergeUpdates), one append per document at most every flushMs,
  // and at once when the document is released, before whenSynced resolves, on close, and on
  // pagehide or when the page is hidden; compactEvery counts those appends
  // gate: a document is edited and persisted locally at once and connects only after its gate
  // (the server has it); so pages created offline or a moment ago are never refused or lost
  // { open(docId): CollabDocument, status, setUser(user), pushPending(timeoutMs?), close() }
CollabDocument { id, ydoc, awareness, state: Observable<CollabDocState>, loaded, whenSynced(ms?), release() }
CollabDocState { status: loading|offline|connecting|syncing|synced|unavailable|auth-expired, readOnly,
  level, unsyncedChanges, reason, lastSyncedAt }
YjsPersistence { load, append, replace, clear, setDirty, dirty }
createMemoryYjsPersistence(), createIndexedDbYjsPersistence(name); "@lydie/sync/node": createFileYjsPersistence(dir)

// Attachments
createAttachmentSync({ api, store, blob, put?, fetch? }).{ progress, run(), downloadUrl(id), download(id) }

// Hand-off
planHandoff(source { store, workspaceId, blob? }, target { api, userId, workspaceId, teamspaceId, version },
  { bodies? }): HandoffPlan (summary: counts incl. databases, existingInTarget, conflicts, missingBytes,
  warnings)
runHandoff(plan, { bodies?: { toYjs, collab? }, storage?, put?, onProgress?, signal? }): HandoffResult
  // Order: documents (rows without their relation values), databases (database.create on the
  // document with the source's title property and first view, database.setDefinition with every
  // live property, option, view and setting, then relation values as database.setValues
  // { exact } so the core indexes them as links; LYD-342), bodies, attachments, trash (doc.delete,
  // database.delete for databases turned back into pages, attachment.delete). Database steps report
  // progress as "documents" but have their own checkpoint. Trashed properties and views go in
  // database.setDefinition rounds (with the title; one per slot a key deleted twice needs) just
  // before the live definition, which moves them to the trash, ready to restore (LYD-351).
  // Person values holding the local user ("local", the "Me" of a local workspace) become
  // `target.userId` (LYD-350).
  // Ids are kept, except the Getting started page's (`plan.gettingStarted`, LYD-325): it takes
  // `gettingStartedId(target)`, so Home finds it, and its children and attachments follow. Its create
  // goes alone once its parents exist; a target with its own page refuses it and it keeps its id
  // (the server's first outcome per operation id makes a resumed run decide the same).
  // `result.renamed` lists the ids that changed (source → target), for the app's per-device
  // settings (LYD-349).
deterministicUuid(key, time)

// Desktop account service (main process ⇄ renderer; types + name + toWire)
accountService, AccountServiceContract { state, scope, setScope, signIn, signUp, signOut, workspaces,
  createWorkspace, request, collabToken, sync, retrySync; streams state, sync }, toWire(run) → Wire<T>

// HTTP
createApiClient({ baseUrl, token, fetch?, version?, onUnauthorized? }), ApiError (kind: network | server
  | auth | client; retryable; code from `{ error: { code } }` or Better Auth's `{ code }`),
  request options keepSessionOn401 (a 401 refusing the request, not the session) and timeoutMs
  (gives up with a "network" error, as if offline; for requests something waits on), backoffDelay, sleep,
  createMutex
```
