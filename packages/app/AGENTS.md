# AGENTS.md - @lydie/app

The plugin host: shell layout, tabs on the layout tree, command registry and keymap, command
palette, global undo/redo, error boundaries and UI states; plus the `Backend` implementations and
their transport. No features of its own: those are plugins.

Licence: AGPL-3.0-only.

## May depend on

contract, runtime, store, markdown, editor, ui, platform, plugin-api. `client/scripts/check-boundaries.ts`
is authoritative and runs in CI.

## Rules

- UI package: never writes SQL, never touches the filesystem, never imports `node:*`, `fs`, SQLite
  drivers or `@powersync/*`. Data goes through a `Backend`.
- `src/backend/**` (`@lydie/app/backend`) has no React, DOM or Node imports: the Electron main
  process imports it to serve the renderer.
- Shell components never test for a platform: title-bar metrics come from `@lydie/platform`
  (`useTitleBarInset`), behaviour from `capabilities`.
- Features live in `plugins/*`. The host's own contributions (`src/shell/core-plugin.tsx`: the
  "new tab" page and "New document") use the public plugin API.

## Public API

```ts
// "@lydie/app/backend"
createLocalBackend({ store, runtime, info, blob?, events?, status?, resolveRemoteUrl?, lingerMs? }): LocalBackend
createEventHub(next?) → { port /* runtime events port */, subscribe }
backendService                       // defineService("lydie-backend")
serveBackend(localBackend) → ServiceHandlers   // channel.register(backendService, serveBackend(b))
createRemoteBackend(channel, { documents? }): Promise<Backend> // renderer side
                                     // `onProgress` crosses as a token: execute's `options.progress`
                                     // names the `progress` stream the renderer subscribed to
createVaultDocuments(channel): BackendDocuments // `Backend.documents` over the vault service
handledOperations()                  // contract ops that have runtime handlers (registry for createRuntime)
markdownExtract                      // @lydie/markdown's extractor for createRuntime({ extract })
MARKDOWN_EXTRACT_VERSION, reextractIfStale(store, runtime, workspaceId)
                                     // bump the version when markdownExtract's output changes: a
                                     // database without a folder re-extracts its bodies on the next
                                     // open (store.meta "extract_version"; the web app runs it when idle)
createLiveRegistry, liveKey, stabilize, encodeRows, applyLiveEvent   // transport internals
// registry.get(key, source, { lingerMs? }): per-query linger (database.view windows: 1 s, VIEW_LINGER_MS)

// "@lydie/app"
startApp({ backend, platform, plugins, storage?, poolSize?, holdMs?, layoutDebounceMs?, services? }): Promise<Host>
  // services → app.services; plugins turned off in Settings → Plugins (DISABLED_PLUGINS_KEY) are
  // not activated unless `essential`
<LydieApp host sidebarFooter? banner? />
syncUrl(host, { base, workspaceId?, history? }): () => void   // see "URLs"; browserHistory()
appUrl(base, path, workspace?, search?, title?) → string, parseAppUrl(below, hash?) → { workspace, path },
belowBase(base, pathname)   // also at `@lydie/app/url`, without the shell
createHost(options), Host, ShellState, createDeviceStorage(), createMemoryStorage(),
  // DeviceStorage { get, set, keys? }; app.storage keeps plugins' keys under "plugin:"
useTitleBarInset(platform), titleBarInset, ErrorBoundary
```

## Design notes

- **Live queries** are deduped by key and keep running 10 s after the last subscriber leaves, so a
  tab that comes back paints at once. The remote backend streams row diffs (`[start, count]` runs of
  previous rows or new rows), so unchanged rows keep identity in the renderer, and delivers once per
  animation frame; a query's first result and an optimistic patch are delivered at once (`emit(state, { now: true })`), so it
  paints in the task of the input that made it (LYD-319).
- **Databases** (`src/backend/databases.ts`): `database.get` combines the store's three definition
  queries into one row; `database.view` wraps `store.liveView` and patches `database.setValues`
  (and row renames) into the window before the write commits; one-shot `query` runs `queryView`.
  View windows linger 1 s: every live window re-runs on each change, and a scrolled table leaves many.
- **Optimistic paint**: `doc.rename` and `doc.move` patch the cached results of the live queries
  that show them before the write commits (`patchers` in `local.ts`); the store's emission replaces
  the patch, a failure restores the real rows. Undo/redo wait for in-flight operations, so Cmd+Z
  right after an action undoes that action.
- **Held navigation** (`whenReady` in `host/host.ts`, after TanStack Router's loaders and pending
  threshold): `open` (replace, tab, background) calls the target view's `ViewDef.preload`. When it
  returns a promise, the layout changes once it resolves or after `holdMs` (150), so the page on
  screen stays instead of an empty or half-filled one; when it returns nothing (the data is here:
  prefetched on hover, or still lingering), `open` is synchronous as before. Any other layout
  action drops a waiting page. Back and forward are not held. Test: "a page with a preload…" in
  `shell.test.tsx`.
- **Tabs**: the layout tree comes from `@lydie/runtime/layout`, saved per workspace and window
  (`window:<workspaceId>:<windowId>`) through `backend.layouts`. Views subscribe per tab
  (`subscribeTab`/`subscribeGroup` with selectors), so a change in one tab re-renders nothing else.
  A window always has a tab: closing the last one leaves Home (the reducer's rule), so there is
  no empty pane.
  A pool (`host/tab-pool.ts`, default 8) keeps recently used tab views mounted but hidden
  (`visibility: hidden; content-visibility: hidden; inert`), so switching mounts nothing; evicted
  views remount and restore from the tab state bag (scroll, selection).
- **Per-workspace device settings follow a hand-off** (`host/workspace-storage.ts`): plugins key
  some settings by workspace id (favorites, Home's recent pages, expanded folders). The host wraps `services.account.handoff`: once a run succeeds, every `app.storage`
  key with this workspace's id as a `:` segment is copied under the hosted workspace's id, with the
  ids the hand-off changed (`outcome.renamed`, the Getting started page) changed in the values.
  Keys the target already has on this device are kept. Test: `workspace-storage.test.ts`.
- **Trashed documents**: the host watches each document its window's tabs show (`doc.get`, no
  body). When one that was live goes to the trash (here, by undo or from elsewhere), its tabs go
  back, else to its parent, else to a new tab page (`leaveDocs`), and it leaves their history. A
  page landed on that was trashed with it (a deleted folder) is left too. A document opened from
  the trash stays, with its banner. Test: "tabs leave a document…" in `shell.test.tsx`.
- **Undo**: Cmd+Z outside a text field runs `backend.history.undo(activeTabId)`; in the editor,
  ProseMirror's history handles it. `useOps()` records on the tab's scope. A step that no longer
  applies shows "Could not undo" with the runtime's cause (`details.cause`) after its message.
- **Command palette** (Mod+K, `shell/Overlays.tsx`), styled after Numina's command menu: every
  command with an icon (`CommandDef.icon`; the host's own and the operations' in
  `host/command-icons.tsx`). Empty: grouped (`GROUP_ORDER`), registration order within a group.
  Typing: up to 4 commands whose title contains the query lead without a heading (group as a
  breadcrumb), then full-text document hits (`doc.search`, 8), then the other matches by group. A
  document opens like the quick switcher (Mod+Enter: new tab).
- **Toasts** (`shell/Toasts.tsx`, after Sonner): `app.notify` only appends to `host.toasts` (at
  most 10); the toaster times them out, so hovering, keyboard focus, a swipe or a hidden page
  pauses every timer. The newest three stack at the bottom right, older ones peeking 14 px above
  and scaled down; hovering fans them out. Swipe right or down (45 px or a flick) or the hover
  close button dismisses. CSS transitions only, positions from measured heights.
- **Confirm** (`Confirms` in `shell/Overlays.tsx`): `app.confirm` appends to `host.confirms` and
  returns a promise; the shell shows the first request in `@lydie/ui`'s ConfirmDialog, above any
  overlay, and answering it removes it. Keybindings are off while one is open (like
  `window.confirm`); `dispose()` resolves pending ones false. Destructive operations from the
  palette ask first (`confirmOperation` in `host.ts`), except `doc.delete` on a document without
  content (`confirmMoveToTrash`). `platform.dialogs.confirm` is no
  longer used by the app.
- **Keymap**: commands carry default keybindings; overrides are stored per device
  (`DeviceStorage`, key `keymap`). Mod+key combinations fire in text fields; bare keys do not.
  Defaults follow Notion where it has one: New document Mod+N (and Mod+Alt+N), Go to parent
  page Mod+Shift+U (`core.goToParent`), Copy link to page Mod+L (`core.copyLink`: `[[Title]]`, or
  the folder's link format), back/forward Mod+[ / Mod+], new tab Mod+T. In a browser tab
  (`capabilities.browserTab`) the browser's own shortcuts (`isBrowserShortcut`: windows and tabs,
  history, address bar, reload, developer tools, bookmarks, settings) are never taken: a
  capture-phase listener in `LydieApp` stops them before anything in the page (editor, tables,
  plugins) sees them, `handleKey` skips them, and commands do not list them. The desktop app
  uses them freely.
- **Linear's keys**: a binding can be a sequence ("G H": G, then H within 1.5 s) or a bare
  character ("C", "/", "?"). Bare keys (`isBareKey`) fire only outside text fields, open overlays
  and widgets that use letters themselves (dialogs, menus, listboxes, grids, comboboxes; a list
  that types to select prevents the key first), and never on key repeat. A key that does not
  continue a pending sequence is read on its own. Defaults: C new document, / search, ? keyboard
  shortcuts (also Mod+/), G then H home, G then T trash, G then S settings.
  Settings records only chords with a modifier, so sequences and bare keys are defaults only.
- **Shortcuts in tooltips**: a button that does what a command does shows the command's first
  binding as key caps in its tooltip (`useShortcut(commandId)` → `tooltipOptions={{ hotkeys }}`),
  as in Linear: the sidebar toggle, back/forward, new tab, right panel, close tab, and the
  sidebar's Home and Trash rows. Labels stay plain. The sidebar's Search (the palette, Mod+K) and
  New document rows show theirs at the row's end instead (`ActionRow`), as Numina's search button.
- **Swipe navigation** (`shell/swipe.ts`, `shell/SwipeNavigation.tsx`): with `platform.trackpad`
  (scroll events with their finger phases; wheel events have none), a two-finger horizontal swipe
  runs `core.back` / `core.forward`, as in Linear's desktop app and Chrome. Its direction follows
  the content, as in Chrome: scrolling left past the start goes back (fingers moving right with
  natural scrolling, left without; the deltas already follow the setting). A swipe is one touch:
  its first 8 px must be clearly horizontal, with nothing under the pointer that scrolls that way
  (wide tables, code blocks, text fields), no overlay or confirm open and history that way. An
  arrow follows the fingers in from the window edge (painted once per frame) and turns solid at
  140 px; lifting there navigates, as does a quick flick (50 px at 0.8 px/ms); otherwise it
  retracts, also when the fingers pull back. Momentum after the lift is ignored. Mouse
  back/forward buttons are handled in `LayoutView`.
- **Back/forward buttons** (`shell/NavigationButtons.tsx`): arrows at the start of the top-left tab
  row (after the sidebar toggle when the sidebar is collapsed), disabled when the focused tab has
  no history that way. Not in a browser tab (`capabilities.browserTab`), which has its own.
- **URLs** (`host/url.ts`, `host/url-sync.ts`; the web shell starts `syncUrl`): the address bar
  follows the focused tab. A tab's path (`Tab.path`: `/`, `/d/<docId>#heading`, `/trash`,
  whatever a view registers) is its URL below the base, with a `w/<slug>/` prefix when
  `workspaceId` is passed (hosted; the slug is `backend.info.workspaceSlug`, else the id; both
  are read). A document's URL carries its title, `d/<title>-<id as 32 hex>`: the title is read
  live for the focused tab and rewrites the entry when it arrives or changes; only the id counts
  when a URL is read, so stale titles and bare ids open the same page. The window's query
  string is kept. The focused tab navigating adds a history entry; a focus change, a closed tab or a
  trashed document rewrites the current one, so splits and other tabs stay out of the history.
  Each entry carries its tab id (`history.state.lydie`): Back and Forward focus that tab and move
  it with its own back/forward (state restored); a closed tab's page opens in the focused tab.
  The app's own Back and Forward (`core.back`, `core.forward`) are the window's there
  (`host.attachWindowHistory`, set by `syncUrl`), so there is one history, not two.
  An overlay with `OverlayDef.url` is an entry over the page, under the same workspace prefix:
  Back closes it, closing it goes back. On load a URL wins over the saved layout: the entry's tab after a reload, else a tab
  that shows it, else a new tab; a path no view shows stays until a later plugin's overlay
  claims it; another workspace's URL is left to whoever chose the window's workspace (the web
  app's `compose.ts`). `UrlHistory` is the seam for
  tests (`url-sync.test.ts` runs against a history in memory).

- **Shell layout** (as in v1): the sidebar flush on the window background; per tab group a row of
  tabs on the background over a card (`tab-group-card`); the right panel as a card of its own
  with its panel tabs in the same row. As in Dia, the active tab is cut from its card
  (`ActiveTabShape`: the card's colour and hairline run up around it, and its feet curve out into
  the card's top edge; the tab list runs 2px into the card to cover its hairline and, in dark
  mode, the inset highlight under it; its top edge catches the light, `--depth-shine`, fading
  into the hairline down its sides, in dark mode only); a first tab on
  the card's left edge (a group other than the top-left one) has no left foot and squares the
  card's corner instead. Split gutters are `ResizeHandle`s between cards. Cards (and
  the status banner under them) are `surface-depth` from `@lydie/ui`. The sidebar's toggle
  starts the top-left tab row, open or collapsed (as in Dia), with a divider after the row's
  buttons while its first tab is not the active one (drawn in the gap, taking no room, so the
  tabs stay put). As in Linear, the sidebar's
  top differs by frame: with a drawn title bar (`inset.custom`, macOS desktop) a row of its own
  holds the window buttons above the workspace row; otherwise (web, native frame) the workspace
  row is level with the tab row. Search (the command palette) and New document are rows in the
  sidebar (`ActionRow` in `Sidebar.tsx`) with their shortcuts at the end, grouped under a leading
  section that is itself a row (Home).
  The top row's icon buttons are squircles where the browser draws them (`topRowButtonClass`).
  With the sidebar
  collapsed, being offline shows at the right of the top-right tab row (`OfflineStatus` in
  `LayoutView.tsx`: the status item with `replacesSyncIndicator`, else `SyncIndicator`), since the
  sidebar footer that says it is out of view; there is no offline banner.
- **Elastic panels** (`useElasticPanel` and `ElasticHandle` from `@lydie/ui`, `layout/use-elastic-panel.ts`,
  motion in `layout/elastic.ts`; also used by the collections plugin's page drawer): the sidebar and the right panel
  collapse to 0 and reopen from their toggles in the tab row. Drags rubber-band past the limits, snap past the midpoint with hysteresis
  and settle on a spring carrying the release velocity; toggles ease. Widths are written to the DOM
  every frame, never through React state, and the contents keep their width while collapsing so
  they clip instead of reflowing. Escape cancels a drag; a double-click resets the width. The full
  sidebar stays mounted (hidden, inert) while collapsed. No animation library.
- **Sidebar peek** (`shell/sidebar-peek.ts`, as in Linear and Notion): collapsed, resting on the
  window's left edge (an 8 px ledge below the tab row) or the sidebar toggle for 100 ms shows the
  same mounted sidebar as a card over the content (fixed, so the collapsed panel does not clip
  it), floating 4 px inside the content card like the collections' page sheet: `shadow-popover`,
  `rounded-lg`, its left corners following the card's (8 px less hairline and gap). It slides in and out (WAAPI), and closes 300 ms after the
  pointer leaves card and triggers, when it leaves the window, or on Escape. One document
  `pointermove`/`dragover` listener decides from what is under the pointer; anything drawn
  outside the shell (menus and their underlays) holds it as it is, so a menu opened from it keeps
  it open. After a collapse the triggers wait until the pointer has been elsewhere. Opening the
  sidebar for good ends the peek at once. Test: "collapsed, the left edge…" in `shell.test.tsx`.
  The first collapse on a device (`shell.peekHintSeen`) shows `PeekHint`: a pulsing mark on the
  edge and "Hover the edge to show the sidebar" beside it, for 6 s or until the peek opens; it
  never takes the pointer. Test: "the first collapse on a device…".
- **Drop indicators** (`shell/LayoutView.tsx`, after Dia): dragging a tab or document over a group
  shows `DropPreview`, a frosted inset card over the half (or whole) it would take, with a pill
  naming the result ("Split right"). It glides between zones (top/right/bottom/left transitions)
  and fades out where it was. Neutral greys, no accent colour.
- **Dragging a tab** (`shell/tab-drag.ts`, as browser tabs): the tab itself follows the pointer.
  The drag is a native one with its drag image hidden; the store says where the tab is drawn
  (`position: fixed`, out of the row's flow). Over a tab row (its own or another group's) it docks:
  it slides along the row and the other tabs glide aside (transforms; a spacer keeps its room).
  Away from the rows it floats under the pointer as a small card. Pressing a tab selects it. A
  document dragged in from the sidebar still opens a ghost pill in the row (`TabDropGap`).
- **Opening a tab**: a tab that joins a row grows in from no width and fades in (CSS
  `@starting-style`), pushing what follows along. The growth is 350ms on `ease`, which starts
  gently, so the new tab button glides over rather than jumps (an ease-out did); the fade waits
  50ms and takes 250ms, so the label does not show squeezed. Not the tabs a row starts with (a restored
  layout, a new split), nor a tab a drag drops there.
- **Workspace menu**: the sidebar's workspace button opens a popover of `workspaceMenu`
  contributions (`shell/WorkspaceMenu.tsx`); without any it runs `core.openSettings`, which opens
  the settings plugin's overlay.

## Tests

`bun test`: `src/backend/backend.test.ts` runs one suite against the local and the remote backend
(over `createLocalServiceChannel`); `src/shell/shell.test.tsx` checks pooling (no remount on
switch), render isolation, global undo, keyboard tab commands and layout restore. End-to-end and
performance tests are in `apps/web/e2e`.
