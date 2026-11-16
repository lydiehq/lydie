# AGENTS.md - @lydie/runtime

Runs the contract's operations in-process over ports (`Db`, `Search`, `Blob`, `Events`, `Clock`, `Ids`,
plus the acting `Actor`). Validates input and output with the contract schemas, checks scopes
(advisory locally; the core re-checks), runs each mutation (or transaction) in one `Db.write`
transaction, appends it to the upload queue and the history journal in that same transaction, records
how to undo it, and publishes its events after commit. Also: undo/redo stacks, link resolution, the
default body extractor, and the workspace layout model (`./layout`).

Licence: AGPL-3.0-only.

## May depend on

`@lydie/contract`. `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Depends on ports, never on concrete adapters. No SQL here; ports are domain-level.
- Handlers are pure logic over ports. One timestamp (`ctx.now`) per transaction.
- Handlers validate before they write (throw `LydieError` first), so a failed step of a session undo
  rolls back cleanly to its savepoint.
- Values the client decides (minted ids, sort keys) are recorded with `ctx.pin()` so the logged input
  replays to the same result on the server.
- Every mutation declared `undo: "inverse"` records, with `ctx.inverse(op, input)`, operations that
  restore exactly what it changed (the previous value, not a recomputation). `undo.test.ts` has one
  round-trip scenario per such operation and fails when one is missing.
- New port members are optional (`?`), with a fallback or an `internal` "not supported by this backend"
  error, so the core's Postgres ports keep compiling.
- Tests: `bun test` (`bun --filter=@lydie/runtime run test`).

## Public API

```ts
// src/index.ts
createRuntime<R = Operations>(config: {
  db: Db; search: Search; actor: Actor;
  scopes?: Scope[] | "*";            // default "*"
  blob?: Blob; events?: Events; clock?: Clock; ids?: Ids;
  versions?: Versions;               // version history of bodies (see "Version history")
  registry?: R; handlers?: Handlers<R>;  // merged over coreHandlers; every op must have one
  extract?: Extract;                 // body analysis; pass @lydie/markdown's. Default: regex fallback
  extractLinks?: (md) => ExtractedLink[];   // deprecated, links only
  onEventError?, historyLimit? (200 steps per scope), coalesceMs? (1500)
}): Runtime<R>

runtime.ops.doc.move({ id, parentId, afterId? })    // typed, one function per operation id
runtime.execute(id, input, options?: ExecuteOptions)
  // ExecuteOptions: { actor?, scopes?, sessionId?, scope? (undo stack, default "default"),
  //                   history?: boolean (false: not on an undo stack),
  //                   activity?: boolean (false: nothing in the activity log), coalesce?: string, label? }
runtime.as(actor, scopes?, { sessionId?, scope?, ... }?)  // e.g. an MCP session; own undo scope
runtime.transaction(label, async (ops) => { ... }, options?)  // one DB transaction, one undo step
runtime.reindexBodies(workspaceId, { batchSize? (100) }?) → { documents }
  // re-extracts stored bodies (links, `^id` blocks) with this runtime's extractor through the same
  // `indexBody` as doc.updateBody; derived rows only (no log, journal, events). Bodies are parsed
  // between write transactions; one saved meanwhile is skipped (its save indexed it). LYD-208.
runtime.history: {
  undo(scope?), redo(scope?): Promise<boolean>;     // run inverses as ordinary operations
  canUndo(scope?), canRedo(scope?), state(scope?): { canUndo, canRedo, undoLabel, redoLabel };
  subscribe(listener: (scope) => void); clear(scope?); record(step) /* internal */
}
// Errors are LydieError: invalid_input | not_found | conflict | forbidden | unknown_operation | internal
// undo/redo that no longer applies throws "conflict" and drops the step.

coreHandlers                         // handlers for every operation in the contract registry
// Activity log (src/activity.ts, see "Activity")
ACTIVITY_WINDOW_MS (10 min), ACTIVITY_KEYS_LIMIT (50), coalesceActivity(previous, draft, newId)
  → { kind: "insert", row } | { kind: "update", id, patch }, mergeActivityData(type, prev, next),
activityData(event, hint?), activityTarget(event), activityKeyOf(draft),
recordActivity(tx, event, hint, newId), activityDrafts(tx, [{ event, hint }]) (titles read in one
  round trip), writeActivity(tx, drafts, newId) (coalesces in order, batched through the port),
encodeActivityCursor, decodeActivityCursor
type ActivityHint { title?, keys?, quiet? }, ActivityDraft, ActivityDecision
addAttachment(runtime, blob, { workspaceId, documentId?, filename, contentType, data }, options?)
createGettingStarted(ops /* doc + database */, { workspaceId, mode, mcpUrl?, today? }) → { id } | null
  // the contract's Getting started page through doc.create, database.*, doc.updateBody; null when
  // the page (derived id) already exists, live or trashed. Locally run it in
  // runtime.transaction(…, { history: false, activity: false }); the core runs it op by op
  // (LYD-313), each with activity: false
sha256Hex(bytes)                     // attachment bytes are stored under their SHA-256
exportWorkspace({ read, blob? }, workspaceId, { attachmentsFolder?, onEntry?, rewriteLinks? }?)
  → AsyncGenerator<ExportEntry { path, data: string | Uint8Array, modified? }>
  // the workspace in the folder format (@lydie/contract planFolder): metadata in one read, then
  // one body or attachment at a time (each `read` may be its own transaction). The hosted core runs
  // it over its Postgres ports, so it exports exactly what the caller can read. `rewriteLinks`
  // (@lydie/markdown's, passed in: the runtime does not depend on it) turns links to files by id
  // (`attachment:<id>`, API URLs; the core passes it) into the files' paths in the folder.
  // `sections` (contract `FolderSections`) puts top-level documents in a folder per section (the
  // core: per teamspace unless there is one shared space, "Private", "Shared with you").
zipStream(entries) → ReadableStream<Uint8Array>   // fflate, one entry in memory; text deflated
exportFilename(name, now) → "Notes 2026-11-15.zip"
// workspace.export (handlers/workspace.ts): zips exportWorkspace over the query's transaction
// and hands it to the `exports?: Exports` port of createRuntime ({ save({ workspaceId, filename,
// data }) → { url, expiresAt }, workspaceName? }): a blob URL in the browser (apps/web), a save
// dialog on the desktop, the current directory in the CLI. Without the port it fails `internal`.
// `ExecuteOptions.onProgress({ done, total })` (`ctx.progress` in query handlers) hears how many
// of the export's entries are written.
resolveLink(tx, sourceDoc, { target, syntax })   // Obsidian rules, see below
resolveLinks(tx, sourceDoc, links)   // the same for many links: ids in one getMany, title keys in
                                     // one findAllByLinkKeys (each distinct key once)
touchesOf(op, input, inverse), touchesOverlap(a, b)   // conflict detection for session undo
placeKey(tx, workspaceId, parentId, { afterId?, beforeId?, sortKey? }, excludeId?)
bodyVersion, applyEdits, extract, extractLinks, linkKey, uuid, createUuidGenerator   // version 7 UUIDs, monotonic within a millisecond
type Extract = (markdown) => { links: ExtractedLink[]; blocks: ExtractedBlock[]; headings; tags; text }
type ExtractedLink = { kind, syntax, target, heading, blockId, sourceBlockId }
type Handler<O>, Handlers<R>, MutationContext, QueryContext, OpsProxy<R>, Runtime<R>, History, HistoryStep
// MutationContext: { tx, now, actor, actorRef, sessionId, operationId, groupId, search, blob, ids,
//   extract, emit(type, ws, data), pin(values), inverse(op, input), exec(op, input) (composite only),
//   afterCommit(fn) }; emit takes an optional 4th `ActivityHint` (see "Activity")

// Databases (src/database/, handlers/database.ts)
runView(rows, { config, database? }, window, ctx): ViewResult   // the reference view engine (JS)
matchFilter, matchCondition, sortRank, groupKeys, groupRank, groupCmp, allGroupKeys, groupList,
countKey, bucketOf, cellValue, computeCells, rollupValue, formulaValue, rowScope, needsEvaluation,
resolveScalar, scalarsOf, dateKey, asciiLower, toViewRow; type ViewContext, RowDoc, PropertyLike, ViewSpec
evaluate(expr, scope), DateValue, LinkValue, parseDate, addDuration, equals, compare, truthy,
isEmptyValue, toJson, toText, EvalError       // Bases expression evaluator (formulas, raw filters)
definitionOf(tx, id), queryView(ctx, def, config, window, today), requireDatabase(tx, id)
targetKey(target)                             // link target → title key; "X.base" → "x"

// Ports (types): Db { read, write }, DbRead { docs, bodies, links, blocks?, attachments?,
//   history?, activity?, databases? }, DatabasesRead { get, list, properties, property, views, view, query? },
//   DatabasesWrite { insert, update, insertProperty, updateProperty, insertView, updateView },
//   DatabasePatch, PropertyPatch, ViewPatch, ViewQuery; docs.getMany? / docs.updateMany? (bulk)
// DbTx (+ writes, oplog, savepoint?). Optional capabilities: docs.childEntries/ancestors/
// findAllByLinkKey/findAllByLinkKeys/slotKeys/trashed/purge, links.blockBacklinks/from/unresolved,
// activity.latestMany/insertMany/updateMany, Search.mentions, Blob.has. Plus LinkRow, BlockRow,
// HistoryRow, SlotAnchor, SlotKeys, AttachmentPatch, MentionsQuery.
// FreshOptions { fresh? }: bodies.put, links.replaceFrom and blocks.replaceFor get { fresh: true }
// from doc.create with an id it minted (no rows to replace; a backend may ignore it).
// docs.trashed(ws, { limit? }): newest deletion first; a backend may return more.

// "@lydie/runtime/memory"
createMemoryPorts(): { db, search, blob (+ size), events (published[], subscribe), state }

// "@lydie/runtime/layout" — pure, no DOM, no SQLite (runs in an Electron renderer)
reduceLayout(layout, action, newId): Layout     // structural sharing; no-ops return the same object
emptyLayout(newId), checkLayout(layout): string[], findTab, findGroup, activeGroup, groupsOf,
HISTORY_LIMIT (50 per tab), MIN_SIZE (0.05)
type LayoutAction = open (replace | tab | background; a replace of a document or page that
  another tab of the same pane shows activates that tab instead, moving it to the asked heading or
  block, merging asked-for `state` such as a collection's view, and closes the blank tab it came
  from) | close | closeOthers |
  closeAll { windowId? } (every unpinned tab of the window, in every pane; a lone Home: no-op) |
  activate | move | split |
  moveToSplit | resize | navigate | back | forward | leaveDocs | pin | setTabState | openWindow |
  closeWindow | focusWindow | focusGroup
// leaveDocs { ids, fallback?: { [id]: path }, windowId? }: trashed documents leave every tab's
// history; a tab showing one goes back, else to its fallback, else closes
// A window always has a tab: emptyLayout and openWindow without a path start with Home
// (HOME_PATH), and a window left without tabs gets a new Home tab (closing that one is a no-op).
// Home with no history is blank: navigating from it does not add it to the tab's back history.
// fillEmptyWindows(layout, newId): what parseLayout uses to give older saved empty windows Home
createLayoutController({ initial?, persist?, debounceMs? (300), newId? }) → { getState, dispatch,
  subscribe, subscribeTab(id), getTab(id), subscribeGroup(id), getGroup(id), flush, close }
openLayoutController({ persist: { load, save }, ... })   // restores (invalid → empty layout);
//   a version 1 layout (route objects) is upgraded to paths
parseLayout(value): Layout | null
```

## Undo, history and sessions

- Every mutation's journal entry stores its inverse (`HistoryRow.inverse`, null when not undoable) and
  what it touched (`<id>|<aspect>`: title, position, body, properties.<key>, or `*` for existence).
- `runtime.history` keeps per-scope stacks in memory. A step is one operation or one transaction; a
  step containing a non-undoable change is not recorded. New changes clear redo. Undo of `doc.create`
  moves the document to the trash (so redo can restore it).
- `inbox.capture` (composite, LYD-385): finds the top-level page named `inbox` (case-insensitive) or
  creates it, then appends a list item (`captureLine`, `appendTo`) or, with a title, creates a page
  inside it. Its steps run without their own scope check (`exec`): the composite's `inbox:write`
  authorises them.
- `history.undoSession` (composite) reverts a session newest first, each change in a savepoint; it
  skips changes that someone outside the session changed later (same entity and aspect, or `*`), those
  that depend on a skipped one, and those that fail. The result is one undo step for the caller.
- Agents run with `runtime.as(agent, scopes, { sessionId })`: their scope is `actor:<ActorRef>`, so
  their changes never land on the user's Cmd+Z stack; review and revert them by session.

### Editor text and the operation undo stack

Text editing keeps its own history (ProseMirror locally, Yjs `UndoManager` when collaborative). The
editor's Cmd+Z goes to that history while the editor has focus; elsewhere it goes to
`runtime.history.undo(windowOrTabScope)`. Body saves from the editor call `doc.updateBody` with
`{ history: false }`: they are journaled (so agent-session undo and audit still work) but never flood the
operation stack. Structural actions taken from the editor (rename via the title field, move, set
properties) are operations and do go on the stack; typing in a title should pass
`coalesce: "title:<id>"` so a burst is one step.

## Links and blocks

- `extract` returns links (kind, syntax, target, heading, block id, source block id), blocks that carry a
  `^id`, headings, tags and plain text. The regex fallback in `text.ts` is only a default; the real
  parser is `@lydie/markdown`'s, passed as `createRuntime({ extract })`.
- Resolution (`links.ts`, Obsidian's rules): an id (a UUID, or its older ULID spelling) → that document; otherwise the last path segment is a
  title matched case-insensitively (`.md` optional); with several matches prefer the source's own
  folder, then the shortest path, then tree order; a path ("A/B/Note") must match as a suffix;
  Markdown links starting with `./` or `../` resolve relative to the source. Folders are parent
  documents.
- Links are sticky: once resolved, a link keeps its target (by id) while that document is live, even
  after a rename, until its text changes. A save does not resolve a link written as before whose
  target is live (one `getMany` checks them), so a better match appearing later does not move it;
  relative Markdown links (`./`, `../`) always resolve again, since the source may have moved.
  Renames resolve dangling links that match the new title. The file bridge rewrites link text on
  rename, as Obsidian does.
- Links to trashed documents count as unresolved; purge unresolves them.
- Frontmatter links (`property-links.ts`): wikilinks and Markdown links in property values, and
  relation ids, are links with `sourceProperty` set. Body saves replace only body links
  (`sourceProperty` null) and property changes replace only property links (`indexLinks`,
  `relinkProperties` in `handlers/doc.ts`). Relinking reads nothing unless a changed property may hold a link.
  A row's relation keys are read once per database and transaction (`cachedRelationKeys`, keyed on
  the frame's own `tx` object; database and property writes, and purges, forget them).

## Notes

- Bodies are Markdown stored through the `bodies` port; `doc.get` returns `body: null` when no body is
  stored locally (for example a hosted document never opened on this device).
- `doc.updateBody` stamps `updatedAt`/`updatedBy` at most once a minute per author
  (`BODY_STAMP_MS`): a save by the author who stamped it less than a minute ago leaves the row
  alone (typing would rewrite it, and wake every live query on documents, per save). Another
  author stamps at once. `doc.restoreVersion` always stamps.
- Deleting is soft and cascades to live descendants; restore brings back what was deleted with it and
  moves the document to the top level if its parent is gone. Purge requires the trash and removes the
  subtree, its bodies, blocks, outgoing links and attachments; bytes are deleted after commit only when
  no attachment uses them any more.
- Search's typo fallback (LYD-389): `trigrams(text)` (pg_trgm-style, ASCII lower-case, words split on
  `TRIGRAM_SEPARATORS`), `queryTrigrams(query)` (first 64), `titleSimilarity(queryGrams, title)` and
  `SIMILAR_TITLE` (0.5), exported for @lydie/store's SQL. The memory search puts a title equal to the
  query first and, when nothing matches, returns titles with at least that share of the query's
  trigrams, scored `1 - share`, as @lydie/store does.

## Databases

- Handlers in `handlers/database.ts`. Schema and view operations write the `databases` port and record
  exact inverses. Row operations (`createRow`, `moveRow`, `duplicateRows`, `deleteRows`, `restoreRows`)
  are composite: they run `doc.*` and `database.setValues`, so the log holds only those (the core
  replays them without a database view engine).
- `database.setValues` is the one bulk write: checks values by type (`checkValue`), adds unknown select
  options (pinned as `newOptions`), keeps two-way relations consistent (both sides, `limit: "one"`
  reassigns), writes all rows with `docs.updateMany`, and records one `setValues { exact: true }`
  inverse per database with the previous values. `exact` skips checks, options and relation syncing.
- Option renames/deletes, key changes and type conversions rewrite rows through the same path
  (`rewriteRows`), so each is one undo step that restores the exact previous values.
- `database.query` uses `databases.query` when the backend has it (SQL in @lydie/store) and otherwise
  `runView` over `docs.children` (memory ports, and the core until it implements the port).
- View semantics live in `database/view.ts` (top comment); @lydie/store's SQL must match them
  (`store/src/database.test.ts` runs 126 view cases on both).
- Link targets `X.base` resolve to the document titled X (inline databases, `![[Tasks.base#View]]`).

## Notes from LYD-169/170/171, LYD-200 and the store bug round

- Agent operations `database.writeRows`, `database.changeSchema` and `database.changeViews` bundle
  the fine-grained database operations, so an agent makes one call. Properties and views can be
  named by id, key or name. Each has an undo scenario test. `writeRows` also takes rows by unique id
  ("LYD-12") and a `markdown` body per row (`doc.updateBody` inside the same composite step), and
  returns each row's id, title and unique id.
- References (`database/refs.ts`): `resolver` (id, key or name; ambiguous names fail with the
  candidates), `resolveViewConfig` (filters, sorts, groups, columns, summaries, layout),
  `resolveFilterRefs`, `resolveWindow`, `resolveView`, `rowResolver`. `database.query`,
  `createView`, `updateView`, `update` and the agent operations use them; ids pass through, so
  stored configs and undo are unchanged. `updateView` and `update` pin the resolved input.
- `applyEdits(markdown, edits, { atomic? })`: replace, insertBefore, insertAfter, prepend, append.
  Atomic by default (the first edit that does not match throws `invalid_input` with its
  `editIndex`); `atomic: false` skips with warnings, for replaying uploads on the core.
- `doc.updateBody` inverses (`bodyInverse`): bodies of 1 KB or more get one contextual edit plus
  `expectedVersion` when that is smaller than half the body. If the body changed since, the undo is a
  conflict. Smaller bodies keep the whole body.
- `history.undoSession` counts a deleted document's live descendants as touched (`<id>|*`), so a
  child someone else added later blocks undoing the create.
- Queries search through `ctx.tx.search` when the port provides it. A search outside the read
  transaction hangs where reads share one connection (the browser).
- `doc.listChildren` on ports without `docs.childEntries` does two reads, `children` and then `tree`
  under the parent. That reads the whole subtree, so ports should implement `childEntries`.

- `doc.outgoingLinks` uses `links.outgoing` when the port has it. Otherwise it builds the result from
  `links.from` plus one `docs.get` per distinct target.
- `MutationContext.journal?(input)` gives the history journal a smaller, still valid input; the
  upload queue keeps the real one. `doc.updateBody` with a whole large body journals the edit it
  amounts to, plus `expectedVersion` (LYD-244).

## Schema rewrites (LYD-246)

- Some database changes rewrite every row: option rename or delete, key change, type change, and the
  previous row of a limit-one relation reassign. They run through `databases.rewrite?(rewrite, fn)`
  (port; optional), so a backend that hides rows from the caller can include them. Local backends
  leave it out.
- The inverse steps of such a change carry `rewrite`. Undo and redo (`history.undo`/`redo` and
  `history.undoSession`) pass it on as `ctx.rewrite`, and `database.setValues` then runs inside the
  same rewrite, restoring hidden rows too.
- In a limit-one reassign, rows reached only through the reassign are written and journaled
  separately from the caller's own rows.
- The inverse of `database.changePropertyType` carries its `type` rewrite too. Run with that
  rewrite, the handler puts the given config back as it is, without `normaliseConfig`. A relation
  whose target database is gone (a folder whose ids did not match) can still be undone. Test:
  "undoes a type change of a relation whose target database is gone" in `undo.test.ts`.
- Tests: `database/rewrite.test.ts` wraps the memory ports as a backend that hides rows.

- Row templates: `runView`'s `ViewSpec.database.templateIds` and `ViewQuery.templateIds` leave them out.
  `database.listTemplates` lists them. Memory ports report `teamspaceId`/`privateOwnerId: null` on tree entries.

- Write path: operations whose input has `markdown` (1 KB or more) extract it before the write
  transaction (memoized, last 4), so a large body save holds the lock about 8 ms instead of about
  56 ms with the Markdown extractor. A save that leaves the links unchanged does not rewrite them
  (no wake-up for live link queries). Bulk port methods (`insertMany`, `putMany`, `replaceFromMany`,
  `resolveDanglingMany`, `replaceForMany`) are optional.

## Activity (`activity.ts`, LYD-304)

- `apply` writes every event an operation emits to the activity log, in the operation's
  transaction (so a failed transaction or savepoint leaves nothing). Titles are read right after
  the handler (`activityDrafts`); the rows of the whole transaction are written together before it
  commits (`writeActivity`: one `latestMany`, one `insertMany`, one `updateMany` where the port has
  them), coalescing in order exactly as one at a time. A savepoint that rolls back drops what its
  operations queued (the runtime wraps `tx.savepoint`). Handlers that know the target's title pass
  it (`writeBody`, `writeRows`), so a bulk change reads none. A composite's own `apply`
  records only events it emits itself; its steps record theirs, so nothing is counted twice.
  `history: false` operations and system actors (the file bridge) are recorded; `reindexBodies`
  (no journal) is not. Nothing is skipped by event type.
- Not recorded (LYD-410), events still published:
  - `ExecuteOptions.activity: false` (execute, `as`, `transaction`): nothing from that execution
    or transaction, composite steps included. Every `createGettingStarted` caller passes it: the
    web app and bridge-fs `openVault` on their transaction, the core on each operation
    (`executeOperation(…, { activity: false })`). Undo/redo of such a step would record (it is
    never on a stack: `history: false`).
  - Rows written by a schema rewrite (option rename/delete, key change, type change, unique id
    numbering, the previous row of a limit-one reassign, and their undo/redo through
    `ctx.rewrite`): `writeRows` and the key move emit `doc.propertiesChanged` with
    `ActivityHint.quiet` while `rewriting` is active (tracked per context whether or not the
    backend has `databases.rewrite`). The schema operation's own `database.changed` is the one
    row; a user's `database.setValues`, bulk or not, records each row.
  - Imports, uploads (handoff to the cloud) and the demo seeds record as usual.
- Coalescing (`coalesceActivity`, pure): the newest row with the same workspace, actor (ActorRef),
  session id, type, target and subject (`activitySubjectOf(data)`: `data.subject` kind and id,
  `data.teamspace` id) absorbs the change when its `lastAt` is less than `ACTIVITY_WINDOW_MS` ago:
  `count + 1`, `lastAt`, latest `targetTitle`, and data merged per type (rename: first
  `previousTitle`, latest `title`; move: first `previousParentId`, latest `parentId`; property
  changes: union of `keys`, capped at `ACTIVITY_KEYS_LIMIT`; workspace changes
  (`isWorkspaceActivityType`): latest, keeping the first `previousName`/`previousRole`/
  `previousLevel`/`previousVisibility`; others latest). The runtime itself only records events;
  a hosted workspace writes workspace changes (no target, a subject) with the same function.
- Titles: from the event, else read from `docs`/`attachments` after the handler. What the event
  cannot say comes from the handler as `ctx.emit(type, ws, data, hint)`: purges pass the title
  (the row is gone afterwards), property changes pass the changed `keys` (events carry the whole
  new properties).
- Port: `activity?: ActivityRead` on `DbRead`, `ActivityRead & ActivityWrite` on `DbTx`:
  `list(ActivityQuery)` (newest first by (lastAt, id), `after` = the previous page's last row,
  filters), `latest(ActivityKey)`, `insert(Activity)`, `update(id, ActivityPatch)`. Without it
  nothing is recorded and `activity.list` is `internal` "not supported by this backend". The
  handler asks for `limit + 1` rows to know whether there is a next page; the cursor is opaque
  (base64url of `[lastAt, id]`).
- `ActivityKey.targetId` is nullable (workspace changes); a port's `latest` need not know
  subjects, since `coalesceActivity` refuses a row about another subject.
- Tests: `activity.test.ts`, `activity-subject.test.ts`. Memory ports keep rows in
  `state.activity`.

## Version history (`ports.ts` `Versions`, `versions.ts`)

- `Versions { list, get, record?, checkpoint? }` is the port behind `doc.listVersions`,
  `doc.getVersion` and `doc.restoreVersion`. One provider per backend; the handlers never know
  which. Without the port those operations are "not supported by this backend".
- Every body write (`writeBody`: doc.create with a body, doc.updateBody, doc.restoreVersion) calls
  `record({ documentId, workspaceId, before, after, actor, at, restoredFrom? })` after commit.
- `doc.restoreVersion` is an ordinary body write: `checkpoint` first (so the body it replaces is a
  version, `previousVersionId`), then the write, with `doc.updateBody` as its inverse. It runs
  `checkpoint` inside the transaction, so a provider must not wait there for anything that needs
  the database.
- `createSnapshotVersions(store: VersionStore, { windowMs?, keep?, days?, ids? })` is the provider
  for backends with no history of their own. A version is the body at the end of a round of edits
  by one author (10 minutes from its start); the newest version follows the body until the author
  changes or the window passes. A body that changed without a record is kept first as
  `before_write`. Pruned like the hosted core: the newest 50, plus the newest of each day for 30
  days (`pruneVersions`).
- `VersionStore { list, read, save }` is where snapshots are kept: `createMemoryVersionStore()`
  here, files in @lydie/bridge-fs. `createMemoryPorts()` returns `versions` (snapshots in memory).
- Tests: `versions.test.ts`; the undo scenario for `doc.restoreVersion` in `undo.test.ts`.

## Threads (`handlers/thread.ts`)

- Ports: `threads?: ThreadsRead (& ThreadsWrite)` on `DbRead`/`DbTx`: `get`, `list(documentId,
  { includeDeleted? })` (threads and replies, oldest first), `insert`, `update`, `purgeFor(docIds)`.
  One `ThreadRow` per thread and per reply (`parentId`); `assembleThreads(rows)` builds `Thread[]`
  and leaves deleted replies out. `openThreads(tx, documentId)` is for `doc.get`.
- `thread.create` with a quote finds it in `ctx.extract(body).text` (as given, then as plain text
  if it was Markdown), stores `describeQuote`'s anchor and pins it with `exact: true`. A quote
  that is not there is `invalid_input`; nothing is written.
- Only the author edits (`sameAuthor`). Deleting someone else's thread is the backend's call (the
  core needs edit access).
- Threads stay when their document goes to the trash and are removed by `purgeDocuments`.
- Thread events are activity on the document (`activityTarget`).
- Undo: every mutation is `"inverse"`; aspects `body`, `anchor`, `resolved` (`history.ts`).
