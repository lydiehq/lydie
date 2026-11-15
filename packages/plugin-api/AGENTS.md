# AGENTS.md - @lydie/plugin-api

The public plugin surface and the `Backend` seam between the UI and the data layer. Built-in
plugins use it from day one; third-party loading comes later, so it is experimental and may break.

Licence: MIT.

## May depend on

`@lydie/contract`, `@lydie/platform`, `@lydie/ui`, `@lydie/editor`. `client/scripts/check-boundaries.ts`
is authoritative and runs in CI.

## Rules

- If a plugin needs something missing, extend this API rather than letting the plugin reach around it.
- No host internals here: `PluginContext` and `AppApi` are interfaces the host implements, so a
  sandboxed implementation can be handed to untrusted plugins later.
- `backend.ts` is types only (the Electron main process and the renderer both build against it).
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Types that back `useSyncExternalStore` use property (arrow) members, not methods.

## Public API

Entry points: `@lydie/plugin-api` (everything below), `@lydie/plugin-api/backend` (types only),
`@lydie/plugin-api/ui` (re-exports `@lydie/ui`), `@lydie/plugin-api/editor` (re-exports
`@lydie/editor`), `@lydie/plugin-api/databases` (database hooks, shared value editors, the contract's
database helpers). Plugins import only these.

```ts
// Backend (src/backend.ts) — what the UI needs from the data layer, wherever the database runs
type Backend = {
  info: { mode: "local" | "synced"; workspaceId; workspaceName; persistent;
          ephemeral? /* in memory on purpose (the site's try-out): the sidebar does not warn */;
          welcomeDocId? /* the Getting started page this open created (a new folder) */ };
  ops: BackendOps;                      // ops.doc.move(input, { scope?, coalesce?, history?, sessionId?, label? })
  execute(id, input, options?);
  transaction(label, async (ops) => …, options?);   // one DB transaction, one undo step
  live(name, params): LiveHandle<Row>;  // { key, getSnapshot, subscribe } for useSyncExternalStore
  query(name, params): Promise<Row[]>;  // the same queries, once
  history: { undo(scope?), redo(scope?), canUndo, canRedo, state(scope) /* sync, stable */, subscribe };
  status: { get, subscribe, dismissRejected? };   // BackendStatus below
  attachments: { add({ workspaceId, documentId?, filename, contentType, data }), url(id) };
  layouts: { load(id), save(id, layout) };
  documents?: { open(id) → DocumentSession, conflicts(), resolveConflict(id) };  // Electron folder
  //   windows only: the file bridge's editing sessions. DocumentSession { source, update(doc),
  //   save(doc), subscribe(event: steps | conflict | closed), close() }
  close();
};
LiveQueries: "doc.children" | "doc.tree" | "doc.get" | "doc.search" | "doc.backlinks" |
  "doc.blockBacklinks" | "doc.unresolvedLinks" | "doc.unlinkedMentions" | "trash.list" | "attachment.list" |
  "database.get" ({ id } → 0/1 DatabaseDefinition) | "database.list" ({ workspaceId } → DatabaseSummaryRow) |
  "database.view" (DatabaseViewParams { databaseId, viewId?, view?: { type?, config? }, window?, me?, today? }
    → DatabaseViewItem: rows in order, then group headers, then { kind: "meta", total, offset, viewType };
    `database.setValues` and `doc.rename` paint into it optimistically; windows linger 1 s, not 10) |
  "workspace.get" ({ workspaceId } → 0/1 WorkspaceRow { id, name, image }, hosted only: the name
    and picture as they are now) |
  "workspace.members" ({ workspaceId } → WorkspaceMemberRow, hosted only) |
  "database.properties" ({ databaseId } → DatabaseProperty; works without the database row: a shared row) |
  "doc.links" ({ id } → OutgoingLink: the document's links as written, `target` the live document or null)
LiveState<T> = { data: readonly T[]; isLoading; error }   // unchanged rows keep identity
BackendStatus = { sync: "local-only" | "signed-out" | "auth-expired" | "offline" | "connecting" |
  "syncing" | "synced" | "error"; pendingOperations; pendingUploads; conflicts; lastSyncedAt; error;
  rejected?: RejectedChange[];
  awaitingFirstSync? /* hosted: this window's first download is on its way; an empty tree may not
    have arrived yet */ }

// Plugins (src/plugin.ts)
definePlugin({ id, name, description?, activate(ctx) → void | cleanup })
ctx: { plugin, app, commands, views, sidebar, panels, statusBar, settings, overlays,
  documentMenu, links, editor, documents }    // each .register(def) → disposer
CommandDef { id, title, group?, icon? (ReactNode, shown in the palette), keybinding? ("Mod+O"), inText?, hidden?, operation?, when?, run({ app, source, args }) }
ViewDef { path ("/trash", "/d/:id", "/reports/*": the pages it shows, and their URL on the web),
  component({ tab }), title? | tabTitle?({ path }), icon? (before `title` in the tab; a `tabTitle`
  draws its own), order?,
  preload?(path, app) → void | Promise<void> /* a route loader: starts what the page reads;
  nothing when it is all here, else a promise for when it is. The host holds the page on screen
  until then (150 ms at most), so the new one paints whole */ }
//   A tab shows a path (TabInfo.path). docPath(id, { heading?, blockId? }), parseDocPath(path),
//   docIdOf(path), HOME_PATH ("/"), matchesPath(pattern, path)
SidebarSectionDef { id, order?, title?, fill?, replaces?, actions? [{ label, icon, run(app) }], component }
//   actions: small buttons beside the title, shown while the section is hovered or focused; titles
//   use `sidebarSectionTitleClass` from @lydie/ui (sentence case, font-medium), as should a plugin's own
   PanelDef { id, title, order?, component({ activeTab }) }
StatusItemDef, SettingsPageDef, OverlayDef { id, component({ close, props }), url?: { path(props), parse(path) } /* its place in
the web app's address bar, below the base: opening adds a history entry, Back closes it */ },
DocumentMenuItemDef { id, label /* or (doc) => label, read when a menu opens: documentMenuLabel(def, doc) */,
  run(doc, app), icon?, group?, order?, when?, danger? }
//   (the page's ••• menu shows the icon and puts each group between separators),
LinkRendererDef { id, kind: "link" | "embed" | "preview", match(target), component({ target, sourceId? }) },
EditorContributions { extensions?, slashItems? (array or getter), overlay?({ editor, docId, tabId }) }
DocumentSlotDef { id, slot: "actions" | "top" | "header" | "body", order?, component({ docId, tab, fallback }) }
//   inside the doc view: actions at the right of the top bar, before the ••• menu (Share); top slots above the title, header slots under it (properties); body slots replace the
//   editor and chain (return `fallback` for documents a slot does not handle, e.g. non-databases).
//   The doc view renders them with <DocumentSlots slot docId tab? fallback? />.
AppApi { backend, workspace, open(path, { mode: replace|tab|background|split, side?, state? }),
  openDoc(id, opts), modeFor(gesture { meta, ctrl, shift, alt, button }, "read" | "edit"),
  //   read: click replace, Mod tab; edit: Mod replace; both: Mod+Shift/middle tab, Mod+Alt split
  //   (open "split" reuses the pane beside when the window is split)
  activeTab(), subscribeActiveTab(fn), setTabState(tabId, state),
  historyScope(), runCommand(id), commands(), formatKeybinding(binding), keymap: { set, subscribe },
  keyCaps(binding) → [["⌘", "K"]] | [["G"], ["H"]], keybindings(commandId) /* the ones that work here */,
  overlays: { open, close }, panels: { toggle, show },
  download({ url, filename, onProgress? }) → DownloadResult   // a hosted export or backup link
  //   saved where the person picks (`platform.downloads`), else the browser's download ("started")
  confirm({ message, detail?, confirmLabel?, cancelLabel?, destructive? }) → Promise<boolean>
  //   in-app dialog (@lydie/ui ConfirmDialog), queued one at a time; not the native confirm
  notify({ title, description?, kind?: info|success|warning|error, action?: { label, onPress },
    duration? /* ms; 4 s, errors 6 s; Infinity stays */ }),
  setColorScheme("light" | "dark" | "system"),   // native menus and dialogs (desktop)
  editor: { fromMarkdown(md) → { content, source }, toMarkdown(original, content), extensions(), slashItems() },
  storage: { get, set },   // per device
  shortcuts?: { quickCapture(), setQuickCapture(accelerator | null) },   // desktop only
  appLock?: AppLock   // @lydie/platform's; the lock screen is the shell's, desktop only
  screenCapture?: { state() → { blocked, supported }, setBlocked(blocked) } }   // privacy mode, desktop only
DRAG_TYPES { doc, tab }    // drag-and-drop MIME types shared with the host

// React (src/react.tsx)
useBackend, useApp, useWorkspace, useWorkspaceImage() (the synced workspace's picture, live; null:
the generated one), useQuery(name, params | null), useQuerySelect(name, params, select),
useOps() (records on the tab's / active tab's undo scope), useHistory(scope?), useStatus(),
<Portal container> (render into another element; plugins do not import react-dom),
useTab(), useActiveTab(), useTabState(key, initial) (the tab's persisted state bag),
useTabStateSnapshot(), useContributions(kind), <DocumentSlots slot docId tab? fallback? />
useShortcut(commandId) → key caps | null   // for the tooltip of a button that runs the command
Providers (host only): BackendProvider, HostProvider (HostBridge), TabProvider

// Hosted mode and host services (src/hosted.ts, src/hosted-react.tsx); every part optional
app.services?: { account?: AccountApi, collab?: CollabApi, vault?: VaultApi, about?: AboutInfo,
  renameWorkspace?(name) }
AccountApi { apiUrl, scope, wanted, state: Observable<AccountState>, signIn /* rejects with code
  "two_factor_required" */, verifySignIn({ code, method: "app" | "backup" }), twoFactor: { hasPassword(),
  enable(password) → { uri, backupCodes }, confirm(code), disable(password), backupCodes(password) } | null
  /* AccountUser.twoFactorEnabled */, setImage(image | null) /* a URL or a drawn SVG data: URL;
  null: the generated avatar */, signUp, signOut,
  signInWith("google", { then? }) /* web: leaves the page; desktop: system browser */,
  cancelSignInWith(), takeProviderReturn() /* { then, error } once after the web app returns */,
  workspaces(), createWorkspace({ name, gettingStarted? /* the server adds the Getting started page */ }),
  localWorkspaces() /* this browser's, or recent folders (desktop); { id, name, kind, path?, current } */,
  openLocalWorkspace(id) /* in place of this window */, openFolder: (() => Promise<void>) | null
  /* pick a folder, in place of this window; null in the browser */, openScope(scope) /* reopens */,
  call(hostedOperationId, input) /* typed by hosted-operations.ts */,
  callContract?(operationId, input) /* a contract operation on the server, not the replica
  (workspace.export) */, handoff: { plan, run /* outcome.renamed: local → hosted ids that
  changed */, changedSince?(since) /* pages here the cloud may lack */, discard?() /* a move:
  forgets the local workspace after a complete run; browser workspaces only */ } | null,
  sync: { details: Observable<SyncDetails>, retry() } | null, webUrl(path) }
CollabApi { open(docId) → CollabSession { ydoc, awareness, user, state, loaded, release() } }
app.plugins?: { list() → PluginInfo[], setEnabled(id, on) }      // per device, applied on reload
app.storage.subscribe?(key, listener)
ctx.workspaceMenu.register({ id, order?, component({ close }) })   // the workspace switcher's menu
SettingsPageDef += { group?, description?, keywords?, icon?, when?(app) };
  component gets { path, navigate(path) } (`/settings/<id>/<path>`)
StatusItemDef += { replacesSyncIndicator? }   PluginDef += { essential? }
Live queries += "workspace.teamspaces" | "teamspace.members" | "doc.access" | "doc.grants"
TEAMSPACES_UI (false: hidden for the alpha; the one switch), teamspacesShown(teamspaces) /* the
  switch, or `workspace.teamspaces` rows other than one default teamspace */,
  useTeamspacesShown(), spaceName(teamspace, shown) /* "Workspace" for the default one while
  hidden */, WORKSPACE_SECTION (src/teamspaces.ts)
useAccount(), useObservable(obs), useDeviceSetting(key, initial), useHostedQuery(id, input | null)
  → { data, error, isLoading, reload, setData }, useCollabDocument(docId) → binding | "loading" | null
  // (bound before the first paint when the document is already loaded; waits for the Yjs chunk too)
src/hosted-operations.ts: generated by @lydie/sdk's scripts/generate.ts (do not edit)

// Helpers
gettingStartedId(workspaceId), GETTING_STARTED_TITLE   // the contract's: a new workspace's page
parseActorRef(ref), type DocumentVersion   // the contract's: who an `authors` entry is; a version
//   of a body (doc.listVersions / getVersion / restoreVersion through `backend.execute` and `ops`)
appName("claude-code") → "Claude Code"   // an agent's app as people know it (activity log, comments)
actorRef(actor), types Actor, ActorRef, Activity, HistorySession   // the contract's: an actor as
//   the ref `activity.list`'s `actors` filter takes; an activity row; an agent session
ACTIVITY_TYPES, isWorkspaceActivityType(type)   // the contract's: every activity row type; the
//   ones about the workspace itself (members, sharing, tokens, publishing: hosted workspaces)
//   `FolderSettings.versionHistory`: "snapshots" | "git" | "off" (what keeps a folder's versions)
parseKeybinding, matchesKeybinding, formatKeybinding, firesInText; fuzzyScore, fuzzyRanges
keySequence("G H") → ["G", "H"], keyCaps(binding, mac), isBareKey(binding)   // sequences and bare
//   characters ("?" matches whatever Shift the layout needs), as in Linear
isBrowserShortcut(binding | keydown, mac)   // the browser's own shortcuts, which a browser tab
//   leaves alone (per platform; content keys such as Mod+K, Mod+F, Mod+P are not on the list)
formatDate(date, "YYYY-MM-DD"), parseDate(text, format), startOfDay, addDays   // Moment-style tokens
confirmMoveToTrash(app, ids, total?) → Promise<boolean>   // asks (app.confirm) only when one has
//   content: hasContent(backend, id) = a non-blank body, documents inside, or a database. The
//   palette's "Delete document" and the sidebar tree both use it
moveToTrash(app, topmost docs, { total?, scope }) → Promise<boolean>   // a document menu's "Move
//   to trash": asks as above, one step (one undo), then a toast whose Undo restores them
documentMenuItems(doc, contributions) → ContextMenuItem[], runDocumentMenuAction(action, doc,
  contributions, app) → "open-tab" | "open-split" | "new-child" | "rename" | "delete" | null
//   (src/document-menu.ts) the context menu on a document in a list, the same wherever it opens
//   (the sidebar tree, Home): open in a new tab / to the right, new document inside, rename, the
//   `documentMenu` contributions (by `order`), move to trash, each with its icon. The list carries out the built-in
//   actions (rename is inline); a contribution runs and the call returns null
findByPath(app, "Meta/Templates") → id | null; resolvePath(app, path) → { id, missing };
//   createMissing(ops, workspaceId, match) in a transaction   // documents by title path
atTop(backend, workspaceId, parentId) → { beforeId? }   // spread into doc.create: new pages made
//   from the UI go first among their siblings (as in Notion); doc.create alone appends (API, MCP, CLI)
useHoverPreview(target, sourceId?) → { trigger, preview, open }; docPreviewTarget(id, part?)
//   hover/focus card for links outside the editor, drawn by a `links` "preview" contribution
DocCard({ id, entry?, section? }), DOC_CARD_CLASS   // the one document preview card (cover, emoji,
//   title, excerpt, facts): tree hover cards and link popovers; `section` { label, missing,
//   select(content, markdown) } shows a `#heading`/`#^block` part. summarizeDoc(doc, title),
//   countWords, editedAgo(iso), wordsLabel(n) (src/doc-summary.ts)
DocumentTreeView(props: DocumentTreeProps)   // the registered `documentTree` contribution (the
//   document-tree plugin's virtualised tree) over part of the workspace; ctx.documentTree.register
//   ({ id, component }). Props: label, space { teamspaceId?, privateOwnerId? }, filterRoot, dragKey,
//   onForeignDrop(id, { parentId, beforeId?, afterId? }), createInput, expandedKey,
//   scroll "self" | "parent", emptyState
linkStyleOf(app) → { format: "wiki" | "markdown", path: "shortest" | "relative" | "absolute" } | null
//   (folder windows: `vault.settings.current()`, read when a link is made), linkTargetFor(backend,
//   fromId, toId, path) → "Projects/Plan" | "../Plan" | "Plan", markdownHref(target) → "My%20note.md"
prefetchDoc(backend, id) → void | Promise<void>   // (src/prefetch.ts) starts the live queries the
//   doc view and its slots read (body, row, collection and the page's row view, links, the pages
//   it embeds, access, the pages above); they
//   keep their results for the backend's linger. The doc view's `preload`.
useDocPrefetch(id | null) → { onMouseEnter, onMouseLeave, onMouseDown }   // spread on whatever
//   opens a document on click: fetches after a 60 ms rest and on the press (tree rows, breadcrumbs)
docPickerItem({ id, title, properties? }, extra?) → PickerItem   // a document as a PickerDialog row
//   (title, DocIcon): the palette, the quick switcher and the slash menu's link picker use it
setDocumentMarks(owner, Map<docId, DocumentMark { connector, label }>), useDocumentMark(id)
//   (src/doc-marks.ts) what a plugin knows about a document that its icon should show: a
//   connected folder. One map per owner (a plugin id); an empty map clears it. DocIcon shows a
//   mark in place of the plain page or table icon (GitHub's mark for "github"); an emoji still wins
setConnectedPages(owner, Map<docId, DocumentMark>), useConnectedPage(id)   // the pages inside a
//   connected folder (not its root), apart from the icon marks: the properties panel adds keys to
//   such a page's own frontmatter instead of offering a collection
DocIcon({ properties, id?, hasChildren?, className? }) (page icon, an emoji or a doodle, else v1's document icons:
  a page with lines, a shorter page with another popping out with `hasChildren`, a small table for a collection with `id`), useIsDatabase(id), useDatabaseIds(),
  pageIconOf(properties), PageIcon({ icon, size?, className? }) (draws the icon text: an emoji as
  is, `doodle:star:blue` as the doodle; show an icon with it, never as bare text),
  fillPageIcon(element, icon) (the same into a DOM element), PAGE_ICON_KEY "icon", PAGE_COVER_KEY "cover",
  PAGE_COVER_POSITION_KEY "cover-position"   // page icons and covers are frontmatter
pageFullWidthOf(properties) → boolean, PAGE_FULL_WIDTH_KEY "full-width"   // `full-width: true`;
  // off is the key's absence (the doc view's page menu and "Toggle full width" set and unset it)
pageColumnClass(fullWidth), PAGE_WIDTH_TRANSITION, PAGE_WIDTH_TRANSITION_MS (300)   // the title
  // column; the class glides max-width and padding (ease-in-out) while an ancestor has
  // `data-width-transition`, which the doc view sets only while full width toggles
PAGE_OPTION_KEYS (the four keys above), isPageOptionKey(key), userPropertyEntries(properties)
  → [key, value][]   // page options are frontmatter but not properties: whatever lists a page's
  // properties (the properties panel) leaves them out; doc.setProperties still sets them
pageCoverOf(properties) → { cover, position } | null, useCoverUrl(cover) → URL | null (an http(s)
  URL as is, else the attachment with that file name; null for a colour)
COVER_COLORS (name → class, type CoverColor), coverFillOf(cover) → { className, style? } | null
  // a solid-colour cover: a palette name (`cover: blue`) or a hex; null when the cover is an image
app.editor.outline(markdown) → { headings, blocks }, app.editor.assignBlockId(markdown, index)

// "@lydie/plugin-api/databases" (src/databases/)
useDatabase(id | null) → { definition, isLoading, error }
useDatabaseView(DatabaseViewParams | null) → ViewWindowState { rows, offset, total, groups, viewType,
  isLoading, isFetching, error }   // keeps the previous result while a new window/query loads
pageRowViewParams(definition, { title }) → DatabaseViewParams | null   // the view a page's own row
  // (computed values: relation titles, rollups, formulas) is read from: the properties panel's,
  // and what prefetchDoc starts
useMembers() → Map<userId, WorkspaceMemberRow>
PropertyEditor({ property: PropertyLike, value, related?, initialText?, rowId?, onChange(value),
  onClose("commit" | "cancel" | "tab" | "shiftTab") })   // per-type editors, shared by every plugin
EditorPopover({ anchor, label, cover /* anchor height */, onClose, fill?, strong?, nonModal? })
  // the popover an editor opens in, over the value (it pops out of its cell or row, as in Notion);
  // fill: as wide as the anchor (text fields), else the editor's own width (pickers). The table
  // (nonModal) and the properties panel use it
PropertyValueView({ property, value, related?, wrap?, maxRelated? }), OptionPill, RelationChips
  ({ rows, wrap?, max? }: pills; with `max`, one line of as many as fit (at most `max`) and the
  rest as "+N" on that line; hover preview via `links` "preview"
  contributions, click opens), fileLabel
PropertyLike { id, name, type, key, config, databaseId? }; rowValue(property, row), relatedRows,
  valueText, parseValueText, isEmptyValue, formatNumber, formatDate, parseDateValue, joinDate, todayIso,
  TYPE_LABELS, TYPE_ICONS / <TypeIcon type /> (MingCute icon per type: use these wherever a type
  shows), TYPE_GLYPHS (plain text, only where an icon cannot go), ADDABLE_TYPES, PAGE_TYPES, OPTION_COLORS, optionsOf, optionFor,
  isEditableType, isListType, convertPageValue
// re-exported from the contract: operatorsFor, groupable, sortable, convertValue, checkValue,
// parseExpression, ExpressionError, tryParseExpression, isStoredType, isUuid, normalizeId, COLORS, PROPERTY_TYPES,
// VIEW_TYPES, ROLLUP_FUNCTIONS, SUMMARY_FUNCTIONS, LIST_TYPES, STORED_TYPES + database entity types
```

## Adding a feature as a plugin

1. `plugins/<name>/` with `package.json` named `@lydie/plugin-<name>` depending only on
   `@lydie/plugin-api` (React as peer).
2. `definePlugin({ id, name, activate(ctx) { ctx.views.register(…); ctx.commands.register(…) } })`.
3. Add it to the app's plugin list (`apps/web/src/plugins.ts`).
4. Data: `useQuery` for reads (never the full tree), `useOps()` for writes, `useTabState` for anything
   that must survive tab switches, eviction and restarts.

## Tests

`bun test` (DOM preload in `test/setup.ts`). The Backend contract is tested in `@lydie/app`
(`src/backend/backend.test.ts`, run against the local and the remote implementation).

## Grid

`@lydie/plugin-api/grid` (`src/grid/`): the engine for spreadsheet-like grids (the collections
table; boards and lists can share its selection and keyboard model). Plain TypeScript with
co-located tests, plus one React hook.

```ts
createGridStore() → GridStore { getState, subscribe, dispatch(GridEvent), setGeometry(geometry, scroll),
  scrolled(scroll) /* moves the rendered window only when it changes */, revealTarget(cell, scroll) }
useStoreSelector(store, selector, isEqual?)   // re-renders only when the selected slice changes
reduce(state, event)   // modes: idle | selecting | editing | filling | resizing | rowDragging | columnDragging;
                       // selection { anchor, focus }; rows (picked ids + anchor); escape unwinds one step
keyCommand(key, state, { page, editable, checkbox, isBlank }) → GridCommand | null   // select, edit,
  // toggle, open, peek, clear, toggleRow (X), selectAllRows (Mod+A), escape, filter (Shift+F),
  // fill { source, target } (Mod+D down / Mod+R right), ignore (Mod+D/R with nothing to copy:
  // handled so the browser does not bookmark or reload)
createGeometry({ columnWidths, frozen, rowHeight, header, footer, inset?, leading, trailing, items,
  rowToItem }) → Geometry; cellBox, rangeBoxes (frozen / scrolling parts), columnLeft, itemTop,
  stickyStart, onScreen, nextViewport, reveal, hitTest(g, x, y, scroll), nearestRow, withColumnWidth
selection: single, rectOf, isRange, inRect, moveSelection (Mod: data edges), tabSelection, dataEdge,
  rowsSelection, columnsSelection, allSelection, clampSelection
clipboard: toTsv, parseTsv, toHtmlTable, parseHtmlTable, clipboardMatrix({ html, text }), pasteTargets
  (one value fills a range, one row fills rows, an even divisor tiles)
parse: parseNumberText (separators, currency, %, accounting), parseDateText / parseDateRangeText,
  parseBooleanText, splitList, matchName
fill: fillTarget(source, cell), fillShortcut(rect, "down" | "right") (a range copies its top row /
  leftmost column; one row or column copies the row above / column to the left; null at the edge),
  extendSeries (numbers/dates by constant step; days or months),
  extendTextSeries ("Week 1, Week 2")
virtual: visibleRange, windowFor, prefixSums, visibleColumns, indexAt, PAGE, MAX_WINDOW
```

Rules: no DOM measurement of cells (geometry comes from the model; only the viewport size is
measured); fixed row height per grid; keep interaction state in the store, data elsewhere.

## Threads (LYD-399)

- Live query `"thread.list"` (`{ documentId }` → `ThreadRow[]`: a document's threads and replies
  as stored, resolved ones included, deleted ones not); build `Thread[]` with `assembleThreads`.
  Also re-exported from the contract: `findQuote`, `describeQuote`, `sameAuthor` and the types
  `Thread`, `ThreadAnchor`, `ThreadKind`, `ThreadReply`, `ThreadRow`.
- `EditorContributions.selectionActions`: `SelectionAction { id, label, icon, run(editor,
  { docId, tabId }), readOnly? }`, buttons in the selection toolbar after the formatting ones
  (the editor-view plugin draws them). `readOnly: true` actions are also shown, on their own, to
  someone who may comment on the page but not edit it.
