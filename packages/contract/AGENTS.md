# AGENTS.md - @lydie/contract

Operation and query definitions (Zod 4), entity and event schemas, the error envelope, the API version
and the `versionChanges` table, and the workspace layout types. Generates OpenAPI 3.1, MCP tool
definitions and CLI command metadata. The seam between the public client and the hosted core: the same
definitions run on both sides.

Licence: MIT.

## May depend on

nothing internal (external: `zod`, and `yaml` for `.base` files and frontmatter, only from
`src/files.ts`'s modules). `client/scripts/check-boundaries.ts` is
authoritative and runs in CI.

## Rules

- Pure definitions: no I/O, no runtime state. Handlers live in `@lydie/runtime` (client) or the core.
- Every user-visible action is an operation defined with `defineOperation` (mutations) or `defineQuery`
  (reads) and added to `operations` in `src/registry.ts`.
- Every operation has `rest`, `mcp` and `cli` projections, or `internal: { reason }`. The parity test fails
  otherwise.
- Every mutation declares `undo`: `"inverse"` (its handler records the operations that undo it) or
  `{ none: "reason" }` (then it must be `destructive`). The parity test fails otherwise, and a runtime
  test fails if an `"inverse"` operation has no undo/redo round-trip scenario.
- Generated outputs in `generated/` are committed; regenerate, do not hand-edit:
  `bun --filter=@lydie/contract run generate` (`generate:check` fails on drift). Output is formatted
  with `bun fmt`.
- Tests: `bun test` (`bun --filter=@lydie/contract run test`).

## Public API (`src/index.ts`)

```ts
// Definitions
defineOperation({ id, summary, description?, input, output, scopes, destructive, idempotent,
  undo?: "inverse" | { none: string },   // required for registry operations (parity test)
  composite?: boolean,                     // runs other ops via ctx.exec; only those are logged
  emits?, rest?, mcp?, cli?, ui?, internal? }): OperationDef<Id, I, O, "mutation">
defineQuery({ id, summary, description?, input, output, scopes, rest?, mcp?, cli?, ui?, internal? })
  : OperationDef<Id, I, O, "query">       // readOnly, idempotent, undo null, never logged
createRegistry(...ops): RegistryOf<T>     // rejects duplicate ids, routes, MCP names, CLI commands
operations                                // every operation (typed by id)
type OperationId, Operations, Registry, AnyOperation, InputOf<O>, ParsedInputOf<O>, OutputOf<O>, UndoSpec
SCOPES, type Scope, hasScope(granted, scope) // "docs:read" | "docs:write" | "inbox:write";
                                          // docs:write covers inbox:write
```

Operations (mutations marked M; `undo` none marked ✗):

| Area       | Ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| doc        | create M, rename M, move M, delete M (to trash), restore M, purge M✗, setProperties M, updateBody M, get, listTree, listChildren, search, backlinks, blockBacklinks, unlinkedMentions, unresolvedLinks, listVersions, getVersion, restoreVersion M                                                                                                                                                                                                                                                                     |
| trash      | list, empty M✗                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| attachment | create M, delete M (to trash), restore M, purge M✗, get, list                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| history    | listSessions, listBySession, undoSession M (composite)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| activity   | list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| database   | create M, update M, delete M, restore M, setDefinition M, get, list, query; addProperty M, renameProperty M, updateProperty M, changePropertyType M, moveProperty M, deleteProperty M, restoreProperty M; addOption M, updateOption M, moveOption M, deleteOption M; createView M, renameView M, duplicateView M, moveView M, updateView M, deleteView M, restoreView M; createRow M (composite), setValues M, moveRow M (composite), duplicateRows M (composite), deleteRows M (composite), restoreRows M (composite) |

```ts
// Entities (Zod schemas + inferred types)
Uuid, WorkspaceId, Timestamp, SortKey, Title, PropertyKey, PropertyValue, Properties, Workspace,
Document (+ createdBy?/updatedBy?: ActorRef | null), ChildEntry (+ childCount), TreeEntry (+ depth),
DocumentBody { markdown, version }, Link, LinkKind ("link" | "embed"), LinkSyntax ("wikilink" | "markdown"),
BlockId, Block, Backlink, UnresolvedLink, UnlinkedMention, SearchHit, Attachment, TrashItem,
Actor (user | agent(app, onBehalfOf) | system), ActorRef, actorRef(actor), parseActorRef(ref),
InverseStep { op, input }, HistoryEntry, HistorySession, Warning, BodyEdit

// Layout (device state, not operations): TabPath ("/d/<docId>", docPath, parseDocPath, docIdOf, HOME_PATH), TabState, TabHistoryEntry, Tab,
// TabGroup, LayoutSplit, LayoutNode, LayoutWindow, Layout, LAYOUT_VERSION. Reducers: @lydie/runtime/layout.

// Events: eventData, EVENT_TYPES, EventType, EventDataOf<T>, LydieEvent (envelope: id, type, workspaceId,
// at, actor, operationId, sessionId?, data). Types: doc.created|renamed|moved|deleted|restored|purged|
// propertiesChanged|bodyUpdated, attachment.created|deleted|restored|purged, database.changed

// Databases (src/database/): entities Database, DatabaseConfig, DatabaseProperty, PropertyType,
// PropertyConfig(+Input), SelectOption, Color, StatusGroup, RelationConfig, RollupConfig, RollupFunction,
// DatabaseView, ViewType, ViewConfig, ViewLayout, ViewColumn, Sort, GroupBy, GroupKey, DateBucket,
// FilterNode (condition | expression | group and/or/not, 3 levels), FilterOp, FilterValue, RelativeDate,
// MeValue, DatabaseDefinition, DefinitionInput, PropertyInput, ViewInput, ViewWindow, ViewResult,
// ViewRow, ViewGroup, RelatedRow, STORED_TYPES, LIST_TYPES, isStoredType
// .base files: toBaseObject, fromBaseObject, effectiveColumns, BASE_FORMAT_VERSION; the text
//   (toBase / fromBase) is in `@lydie/contract/files`, below
// Bases expressions: parseExpression, tryParseExpression, printExpression, refOf, refsIn, refExpr,
//   refString, parseRefString, quote, ExpressionError, type Expr (+ node types), PropertyRef
// Filters ⇄ Bases statements: toBaseFilter(Root), fromBaseFilter, conditionExpr, exprCondition,
//   propertyRef, propertyRefString, ME_TOKEN ("@me"), rollupFormula
// Values: checkValue, convertValue (type changes), toFileValue / fromFileValue (ids ⇄ links),
//   operatorsFor(type), groupable(type), sortable(type)
// Team rows synced from the core (empty locally): WorkspaceMemberRow, TeamspaceRow, TeamspaceMemberRow,
//   DocumentGrantRow, DocumentAccess, AccessLevelValue, ACCESS_LEVELS

// Errors: { error: { code, message, hint?, details? } }
ErrorCode, ErrorEnvelope, LydieError(code, message, { hint?, details? }), isLydieError

// Versioning and the operation log
LYDIE_VERSION ("2026-11-12"), LYDIE_VERSION_HEADER, versionChanges, VersionChange,
AppliedOperation   // { id, operation, input, actor, sessionId?, workspaceId, createdAt, version }

// Projections
toOpenApi(registry) (adds x-lydie-undoable on mutations), toMcpTools, toMcpTool, toCliCommands,
toCliCommand, toJsonSchema, generatedFiles
```

`@lydie/contract/files` (`src/files.ts`): what reads or writes YAML, kept out of the main entry
point so that loading the contract does not load `yaml` (~100 KB, which every app and server would
otherwise evaluate at startup). `files.test.ts` checks that `index.ts` never reaches it.

```ts
toBase(def, { folder?, linkFor?, resolveProperty? }): string
fromBase(text, { newId, existing?, types?, idFor? }): { id, folder, definition, warnings }
frontmatterBlock(properties, eol?): string
planFolder(snapshot): FolderPlan
```

Import it statically where files are read or written (the file bridge), or `await import()` it on
first use from code that is on a startup path (`@lydie/runtime`'s `exportWorkspace`).

`Document` mirrors the synced `documents` table: `id` (a UUID, minted client-side), `workspaceId`,
`parentId` (nullable), `title`, `sortKey` (fractional index, siblings sort by `(sortKey, id)` in byte
order), `properties` (typed frontmatter), `createdAt`, `updatedAt`, `deletedAt` (nullable, set while in
the trash), `createdBy`/`updatedBy` (`ActorRef`). Timestamps are ISO 8601 UTC strings.

`ActorRef` is how authorship is stored in `created_by`/`updated_by` columns: a user is their plain user
id (what the core stores), an agent is `agent:<app>:<agentId>:<onBehalfOf>`, the system `system:<id>`.
`createdBy`/`updatedBy` are optional in the schema only so rows from peers that do not write them parse.

`Link.kind` was `"wikilink" | "markdown" | "embed"` before 2026-11-13; it is now `kind` (`link`/`embed`)
plus `syntax` (`wikilink`/`markdown`). `@lydie/store` reads old rows correctly.

## Ids (`src/ids.ts`)

- Ids are UUIDs, lowercase with hyphens (`Uuid`, `isUuid`). New ones are version 7, minted by
  `@lydie/runtime`'s `uuid()`: time first, so they sort in creation order (the operation log and
  the history journal are read `ORDER BY id`).
- Until November 2026 ids were ULIDs. Every stored id was rewritten as the same 128 bits
  (`uuidFromUlid`, which keeps the order): the core's Postgres by migration `0022_ids_uuid`, local
  databases by `@lydie/store` migration 8, `localStorage` by the web app, and a folder's `.lydie/`
  files, `.base` files and `id:` frontmatter as they are read (`uuidsForUlids`). Stored ids are
  never ULIDs any more; do not add code that expects one.
- Text people wrote can still spell an id as a ULID (a `[[link]]` by id, an `attachment:`
  reference): read ids out of text with `normalizeId`.
- Ids derived by hashing (`starterId`, bridge-fs `deriveId`) hash the workspace id in its ULID
  spelling (`hashSpelling`), so they are the ids they were before the change.

`slugify(text, fallback?)` (`src/slug.ts`) makes the readable part of a URL: a workspace's slug
(`WORKSPACE_SLUG` is what one may be) and the title in a document's URL.

## Adding an operation

1. Define it in `src/operations/<area>.ts` with `defineOperation`/`defineQuery`, including projections and,
   for mutations, `undo`.
2. Add it to `operations` in `src/registry.ts`; add new event types to `eventData` and `LydieEvent` in
   `src/events.ts`.
3. `bun --filter=@lydie/contract run generate`, then commit `generated/`.
4. Implement the handler in `@lydie/runtime` (`src/handlers/`), recording inverses with `ctx.inverse`,
   and add an undo scenario to `runtime/src/undo.test.ts`. If it needs new data access, extend the ports
   there (as optional members) and implement them in `@lydie/store` and the memory ports.

## Databases

A database is a document; its live children are the rows; every row is an ordinary document whose
`properties` hold its values. Schema and views are three tables (`databases` id = document id,
`database_properties`, `database_views`), all soft-deleted. Property values by type:

| type                                                  | stored in `properties[key]`                                                     | frontmatter                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| text, url, email, phone                               | string                                                                          | string                      |
| number                                                | number                                                                          | number                      |
| select, status                                        | option name                                                                     | string                      |
| multiSelect                                           | option names                                                                    | list                        |
| date                                                  | `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]`; with an end `start/end` (config.range) | string                      |
| checkbox                                              | boolean                                                                         | boolean                     |
| person                                                | user ids                                                                        | list                        |
| files                                                 | attachment ids or URLs                                                          | list of `"[[path]]"` / URLs |
| relation                                              | document ids                                                                    | list of `"[[Path/Title]]"`  |
| title, createdTime, updatedTime, createdBy, updatedBy | document columns                                                                | not stored                  |
| formula, rollup                                       | computed                                                                        | (formula in the .base file) |

`key` is the frontmatter key (default: the name as typed); renaming a property changes only its display
name (`displayName` in the .base file). Rows store option _names_ (readable files); renaming an option
rewrites the rows that use it in one undoable step. Deleting a property keeps the values in the rows.

### Databases on disk (for the file bridge)

- A database is a folder of rows plus `<Folder>/<Folder>.base` (inside the folder, so moving the
  folder moves the database). Write it with `toBase(def, { folder, linkFor })` where `folder` is the
  rows' vault-relative folder (written as `file.inFolder("…")`) and `linkFor(id)` the link target of a
  document (relation filter values); `resolveProperty(id)` lets rollups get a useful Obsidian formula.
  Rewrite it on every `database.changed` event and when the folder moves.
- Read it with `fromBase(text, { newId, existing, types, idFor })` (`existing` = the current
  definition, so ids survive files without a `lydie:` block; `types` = `.obsidian/types.json`), then
  apply with `database.setDefinition({ id, definition })`. A file without `lydie.id` is a new database:
  `database.create({ documentId })` for the folder's document first. `warnings` lists what was skipped.
- Row frontmatter ⇄ `properties`: `toFileValue`/`fromFileValue` map relation/files ids ⇄ `[[links]]`
  (unresolved links stay as written). Write row values on `doc.propertiesChanged`.
- `toBase`/`fromBase`/`frontmatterBlock`/`planFolder` come from `@lydie/contract/files`.
- Native Bases keys hold what Obsidian understands; Lydie-only settings live under `lydie:` (top level:
  `version`, `id`, `templates`, `filter`, `properties` with ids, types, options, relations, rollups,
  number formats; per view: `id`, `type: calendar`, `filter`, `columns` (hidden/all), `groupBy` extras,
  `subGroupBy`, `layout` extras, `cover`). Unknown keys are kept. Native keys win when they disagree.
- Inline databases: an embed `![[Tasks.base]]` (first view) or `![[Tasks.base#View name]]`; the
  runtime resolves `X.base` targets to the database document titled X.

## MCP surface (LYD-200)

- `mcp.expose?: "agent" | "fine"`. `"fine"` operations are left out of the agent tool list and stay
  reachable through the generic `run_operation` / `describe_operation` tools (`RUN_OPERATION_TOOL`,
  `DESCRIBE_OPERATION_TOOL`, `mcpOperations`). `toMcpTools(registry, { expose: "agent" | "all" })`.
- `mcp.outputSchema?: boolean`: output schemas are opt-in. Set it only where an agent needs to know
  the shape of the result.
- Agent-sized database operations: `database.writeRows` (`write_database_rows`),
  `database.changeSchema` and `database.changeViews`. The last two return a `DatabaseOutline`.
- JSON Schema defs: a schema whose input variant differs from its output gets an `<Name>Input` def.
  Give nested reusable schemas a `.meta({ id })`, so they appear once in `$defs`.
- `Link` and `Backlink` have an optional `sourceProperty` (frontmatter links, LYD-201).
- Connection defaults (LYD-286): MCP schemas make the top-level `workspaceId` and `sessionId`
  optional (`CONNECTION_DEFAULTS`); the dispatcher fills them from the server's `McpConnection`.
  The operations keep them required, so REST, the SDK and the CLI stay explicit. `whoami`
  (`WHOAMI_TOOL`) is answered by the dispatcher from `McpConnection.whoami` (`McpWhoami`): it
  describes the connection, not the workspace, so it is not an operation.
- `mcpInstructions({ mode: "hosted" | "local", workspace })`: the server instructions every MCP
  server sends. Change the guide there, not in a server.
- References (LYD-288): view settings name a property with `PropertyReference` (JSON `PropertyRef`:
  id, key or name); `query_database` takes a view id or name; `write_database_rows` takes a row id
  or unique id (`RowRef`, "LYD-12"). The runtime resolves them to ids (`database/refs.ts`); stored
  configs hold ids only.
- `doc.updateBody` `edits` are `BodyEdit { type?: replace | insertBefore | insertAfter | prepend |
  append, oldStr?, newStr, replaceAll? }` (Linear's `patch`), all or nothing. Old
  `{ oldStr, newStr }` edits are replacements, as before.
- `database.writeRows` takes `markdown` per row and returns `rows: WrittenRow[]` (id, title,
  uniqueId, action). `ViewResult.hasMore` is set by `database.query`.
- The tool list drops `annotations.title` (the tool has `title`) and the ±2^53 integer bounds, and
  `describe_operation` does not repeat the operation enum. The cap in `contract.test.ts` is 58 KB.

## The folder format (`src/folder/`, plan "export guarantee")

The one writer of the local folder layout, shared by the file bridge and every export
(`planFolder` and `frontmatterBlock` are in `@lydie/contract/files`; the rest in the main entry):
`planFolder({ workspaceId, documents, databases, attachments, attachmentsFolder? })` → `{ entries,
keyOf(id), attachmentLink(documentId, link), meta(written?) }`. Entries are notes (`<key>.md`, `head` = frontmatter with `id:`; a
database's own note is `optional`), `.base` files, attachments (once per SHA-256) and empty database
folders; `meta()` gives `.lydie/workspace.json`, `ids.json`, `order.json` and `attachments.json`.
Rules are bridge-fs's "On-disk rules": file name = title (`fileNameFor`, `uniqueName`
case-insensitive, the attachments folder reserved at the top), relation and file values as
`[[path]]`, `order.json` only where the order is not by name, trash left out. Also
`frontmatterBlock(properties)` (the bytes of @lydie/markdown's `serialize` head; bridge-fs tests
it), `baseDefinitionOf`, `baseFileFor`, `compareNames`, `titleOf`. Hosted bodies can name a file
by id (`attachment:<id>`, the API's `…/attachments/<id>/…` URLs; `attachmentIdIn(ref)`):
`attachmentLink` gives what such a link becomes in the folder (the vault path in a wikilink or
embed, the path relative to the note in a Markdown link). `sections: { list: [{ id, name }], of(id) }`
groups top-level documents into a folder per section, in list order, after the top-level
documents without one (the core: a folder per teamspace, "Private", "Shared with you"; a
workspace's one shared space has none, its pages are the top level); a section folder keeps its
name, has no note or id, and a vault opens it as a top-level page. Without sections the layout is the bridge's. `bridge-fs/src/export.test.ts`
checks that an export is byte for byte the folder the bridge wrote, and reopens as the same
workspace.

`workspace.export` (query, `POST /workspaces/{workspaceId}/export`, MCP `export_workspace`, CLI
`lydie workspace export`): a zip of that folder; returns `{ url, filename, expiresAt }` (a signed
link on the core, a blob or file URL locally, null when a save dialog was cancelled).

## Patch inputs

Never build a patch schema with `.partial()` on a schema that has `.default()`s. In Zod 4 the
defaults stay, so every field the caller leaves out gets reset (LYD-249). Write the patch as its
own object of `.optional()` fields, as `ViewConfigPatch` does. A test checks that its keys match
`ViewConfig`'s.

Recent additions: `database.create` takes `teamspaceId` (hosted only). `doc.outgoingLinks`
(`list_outgoing_links`, `GET /documents/{id}/links`, `lydie doc links`) returns `OutgoingLink[]`:
each link as written, with `target` (the live document it resolves to, with its page icon
`target.icon`, the `icon` property or null) or null.

## MCP dispatch, schema rewrites

- `createMcpDispatcher(listed, { callable?, internalErrors?, expose? })` returns `{ tools, resolve, call }`.
  It is the tools/list and tools/call handling every Lydie MCP server shares: listed tools, `run_operation`
  and `describe_operation` by id (over `callable`, default `listed`), `whoami`, and result and error
  envelopes. Unexpected errors are hidden by default; set `"expose"` when the server's user is its
  operator. Also exported: `describeOperation`, `mcpResult`, `mcpErrorResult`, `unknownKey`. Servers
  only supply `execute(op, input)` and the connection (`call(name, args, execute, connection)`:
  `{ workspaceId?, workspaces?, sessionId?, whoami? }`). Don't copy this logic into a server.
- Strict inputs (LYD-289): an argument key the tool's JSON Schema has no place for fails with
  `invalid_input` and a hint naming where it belongs ("limit belongs under window"); records and
  discriminated unions are followed. A `workspaceId` outside `connection.workspaces` is `not_found`
  (LYD-287).
- `SchemaRewrite { databaseId, propertyId, reason: option | key | type | relation | uniqueId }`. `InverseStep.rewrite?`
  carries it in the journal only. Operation inputs never do, so no caller can claim a rewrite.

- Getting started (LYD-313, `src/getting-started.ts`): the page a new workspace starts with, as data.
  `gettingStarted({ mode: "browser" | "folder" | "hosted" | "try", mcpUrl?, today })` returns the
  page tree ("try": the site's in-memory try-out, which keeps nothing)
  (`StarterPage` / `StarterDatabase`, Lydie Markdown bodies); `gettingStartedId(workspaceId)` and
  `starterId(workspaceId, key)` derive its ids (so it is created once and can be found);
  `GETTING_STARTED_TITLE`. It lives here because the client, the desktop main process and the core
  all create it (with `createGettingStarted` in @lydie/runtime). Tone: short, plain, no "!".
- `database.listTemplates` (`list_row_templates`, fine-grained): a database's row templates, which views leave out.
  `ChildEntry`/`TreeEntry` have optional `teamspaceId`/`privateOwnerId` (hosted space).

## Activity (LYD-304)

- `Activity` (`src/activity.ts`): one row of the workspace activity log. `{ id, workspaceId,
  actor: Actor, sessionId | null, type: ActivityType, targetId | null (document, attachment or
  database; null for a change to the workspace itself), targetTitle | null (an attachment's
  filename), data: ActivityData, count, firstAt, lastAt }`. `ActivityData` is small and typed:
  `title`/`previousTitle` (rename), `parentId`/`previousParentId` (create, move; attachment.created:
  the document), `keys` (property changes), `change` (database.changed), `count` (delete/restore/
  purge; documents a publication run published). Never bodies, property values, operation inputs
  or secrets.
- `ActivityType` = the event types plus `WORKSPACE_ACTIVITY_TYPES` (`ACTIVITY_TYPES`,
  `isWorkspaceActivityType`): changes to the workspace itself that a hosted workspace records
  where they happen (members and invitations, teamspaces, sharing and share links, API tokens and
  connected apps, connections and publications, backups). They are not events: nothing emits
  them, so peers and webhooks never see them; keep the two lists separate. Their rows say what
  they are about in `data.subject` (`ActivitySubject { kind: user | invitation | workspace |
  teamspace | token | app | connection | publication | shareLink, id, name | null }`, the name at
  the time) plus `teamspace`, `previousName`, `slug`, `role`/`previousRole`, `level`/
  `previousLevel`, `visibility`/`previousVisibility`, `restricted`, `service`, `scopes`,
  `frequency`, `failed`. `doc.moved` may carry `teamspace` (moved to another space; null: Private).
- `activity.list` (query, `docs:read`): input `{ workspaceId, limit (1..200, default 50), cursor?,
  actors?: ActorRef[], types?: ActivityType[], targetId?, sessionId?, search? }`, output
  `{ items: Activity[], nextCursor: string | null }`, newest first by `lastAt`, then `id`. REST
  `POST /workspaces/{workspaceId}/activity/query` (POST because of the list filters: GET query
  parameters must be primitives), MCP `list_activity` (fine), CLI `lydie activity list`.
- Rows are written and coalesced by @lydie/runtime (`activity.ts`), not by the API caller.

## Version history

- `doc.listVersions`, `doc.getVersion`, `doc.restoreVersion` (`operations/doc.ts`) and the
  `DocumentVersion` entity (`kind`: auto | before_write | restore | external; `authors` are actor
  refs; `label` is set by providers that have one, such as a git commit subject).
- They are the same in every mode. What keeps the versions is the runtime's `Versions` port: the
  hosted core (collab's snapshots), a folder (snapshots beside its database, or git). A version
  `id` is opaque and belongs to that provider.
- A backend without the port answers `internal` ("not supported by this backend").

## Threads (LYD-109, plan §3 "Threads")

Notes and comments beside a document, never in its body and never published.

- Entities (`src/thread.ts`): `Thread` (`kind`: note | comment, `anchor`: `ThreadAnchor` or null for
  the page, `body`, `replies: ThreadReply[]`, `resolvedAt`/`resolvedBy`, `sessionId`), `ThreadKind`,
  `ThreadBody`, and `sameAuthor(a, b)` (an agent and the person it acts for are one author).
- Operations (`src/operations/thread.ts`): `thread.create` M, `reply` M, `edit` M, `setAnchor` M,
  `resolve` M, `delete` M, `restore` M, `list`. MCP agent tools: `create_thread`,
  `reply_to_thread`, `resolve_thread`; the rest are fine-grained. `id` in `edit`, `delete` and
  `restore` is a thread or a reply.
- An anchor is a quote plus the text before and after it, never a position (`src/quote.ts`:
  `findQuote(text, selector)`, `describeQuote(text, range)`, `QUOTE_CONTEXT`). Both work on the
  document's plain text. `thread.create` takes `quote`/`prefix`/`suffix` as a caller read them and
  the handler stores the passage as it stands; `exact: true` stores them as given (editors, and
  the logged input, so a replay does not look the quote up again).
- Events: `thread.created|replied|updated|resolved|deleted|restored`. `data.id` is always the
  thread, `data.documentId` its document, `data.messageId` the thread or reply that changed.
- The agent tool list cap in `contract.test.ts` is 61 KB (was 58) to fit the three thread tools.
