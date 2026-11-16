# AGENTS.md - @lydie/plugin-editor-view

Built-in plugin: the view for `/d/:id`, a document: title and editor.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.
- Permissions: `vault` (a folder's link format, for the links it writes: `linkStyleOf`).

## What it does

Loads the body with `useQuery("doc.get", { includeBody })`, converts with `app.editor.fromMarkdown`/`toMarkdown` (splice-preserving), saves through `doc.updateBody` debounced (400 ms) with `history: false`; each save's text (its parse, cached by `@lydie/markdown`) is the next save's original, so a session's saves stay small. Takes outside changes when there are no unsaved edits, in a hidden tab (the pool's) only once it shows again, never with a collaborative body. Title renames wait for a pause in typing (`RENAME_DELAY`, 400 ms; written at once on blur, Enter, unmount and `pagehide`) and coalesce per document; meanwhile the tab title and the breadcrumbs show what is typed (`title-drafts.ts`), the sidebar after the rename. Restores scroll and selection from the tab state; `route.heading` / `route.blockId` scroll there (also when they change in place); tab state `focusEditor: true` focuses the editor once opened. Enter or ArrowDown in the title moves into the body; Shift-Tab in the body with nothing to outdent moves back to the title (a priority-50 extension under the indent handler).

- **File sessions** (`file-session.tsx`, LYD-196/197): when `backend.documents` exists (Electron folder windows), the editor opens a session, sends an update 150 ms after local edits while dirty, saves with `session.save`, and applies `steps` events rebased over local edits since the last update (prosemirror-collab style), off the undo stack. A `conflict` event (or a flag found on open) shows `ConflictBanner`: Keep mine (loads the conflict copy, undoable), Keep theirs, Open both (split); both clear the flag and trash the copy. Updates and saves send block patches (`DocumentPatch`: the top-level blocks that differ from what main last took, compared by node identity), and the whole document when there is no copy to patch or main refuses a patch (answers `stale`); the doc view calls `file.save()` without the document, so nothing is serialised per save.
- **Session ordering** (LYD-269, `session-log.ts`): updates and saves carry `seq`/`version` (the
  session tags them); disk steps are mapped through what the editor did since update `basedOn`
  (undoing main's steps received since, redoing local edits and applied steps); after applying, an
  update is sent; a `stale` save waits for the pending steps and saves again; after a save that is
  not stale, `saved(seq)` prunes the log, so it holds no more than the edits since.
- **Plugin hooks**: renders every `editor.register({ overlay })` once per editor (`EditorOverlays`), `![[embeds]]` through the first matching `links.register({ kind: "embed" })` (`EmbedSlot`), `documents` slots "top" (above the title), "header" and "body".
- **Find in page** (`FindBar.tsx`, `find.ts`): command `editor-view.find` (Mod+F, "Find in page";
  enabled while the active tab is a doc with an editor, so elsewhere the browser's find still
  works) opens a bar at the top right of the scroll container (sticky, zero height), prefilled with
  a one-line selection; Mod+F again selects the query. `findMatches(doc, query)` is pure:
  case-insensitive, per textblock (across mark splits, not across blocks or hard breaks), a wiki
  link matches whole by its label. The `FindExtension` plugin (registered with
  `ctx.editor.register({ extensions })`) holds query, matches and current index and paints them as
  decorations (`data-find-match` / `data-find-current`); it changes only through meta transactions
  (`addToHistory: false`, no doc change), so nothing is saved, synced or undoable. After any edit (local, collab,
  disk) it searches again only the textblocks the edit touched and maps the other matches
  (`remapMatches`, checked against a full search by a fuzz test). Enter / Shift+Enter in the bar, `editor-view.find-next`
  (Mod+G) and `find-previous` (Mod+Shift+G, enabled while the bar is open) step with wraparound;
  Escape closes, clears and selects the current match in the editor. Bars register per tab id in
  a module map that the commands read for `app.activeTab()`.
- **Slash menu**: the editor's blocks plus every plugin's items, ranked by `slash-ranking.ts` (fuzzy title > keyword, recently used first, registry commands (the slash-menu plugin's document commands) only when typing); uses are stored per device (`slash-recents`).
- **Preload**: the view's `preload` is `prefetchDoc`, so the host opens a page once its queries
  have results; breadcrumbs prefetch their page on hover (`useDocPrefetch`). While a hosted
  window's first download is on its way (`awaitingFirstSync`), a page that is not here shows as
  loading, not as missing.
- **Hosted body** (as in v1): until the collaborative document is loaded (`useCollabDocument`
  is `"loading"`), the body this device has (`doc.get`'s markdown) shows read-only in an editor
  of its own (`key="local"`), without `onCreate`, so nothing is saved, focused or restored on it;
  the collaborative editor (`key="live"`) then takes its place.
- **Tab title** shows the page icon (`pageIconOf`).
- **Page menu** (`PageMenu.tsx`, LYD-292): a ••• button at the right of the breadcrumbs bar, as in
  Notion, after the `documents` "actions" slots (Share). "Full width" (a checkable item with a
  switch) sets `full-width: true` in the frontmatter or removes the key (`doc.setProperties`,
  undoable); then every `documentMenu` contribution, the same items as the sidebar's row menu,
  with their icons, one section per `group` (`menuGroups`: groups by their first item's `order`).
  Command `editor-view.toggle-full-width` ("Toggle full width") does the
  same from the palette, where it reads "Turn on full width" or "Turn off full width": its
  `paletteTitle` reads `shownFullWidth` (`PageMenu.tsx`), which each `DocView` fills with the
  width it draws. Full width passes `fullWidth` to the editor and widens the title column
  (`pageColumnClass`); page options stop there on purpose: text size and font are not per page.
  Toggling glides (300 ms, ease-in-out): `useWidthTransition` sets `data-width-transition` on the
  view while it runs, only for a toggle on the same page, so opening another page snaps.
- **Breadcrumbs** (`Breadcrumbs.tsx`, as in v1): a bar above the page, parents › title, centred
  between an empty column and the actions (equal `flex-1 basis-0` columns). Each crumb has the
  ghost `xs` button look (`buttonStyles`), muted, so it hovers like Share and •••.
  Each parent is a live `doc.get` (at most 8 up) and opens on click (`app.modeFor(event)`; middle
  click too). On a page that opens on a cover (an element with
  `data-page-cover` at the very top of the scroll container, which page-decor draws; not in the
  trash, not under a banner) the bar lies over the cover instead of taking a row (`useCoverBar`).
  Scrolling is followed without a render: geometry is read when the view's DOM changes, then
  each scroll frame reads only `scrollTop`. The bar's surface is a layer under its controls that
  the cover's bottom edge pushes down (a transform), so the bar is transparent where the cover is
  and the page's colour where it has gone; its ink (`INK`, set on the bar so plugins' controls
  follow) turns by `data-over-cover` (the cover's `data-cover-tone`, dark until known) once the
  edge passes the bar's middle. There is no fade over the cover. A colour cover
  (`data-cover-color`) tints the tab (`useSetTabTint`, not in a host's panel) with its computed
  background, mixed toward the card's colour as the edge crosses the bar, so tab and cover read
  as one and part smoothly. Pulled past the top (macOS rubber-banding), the gap above a colour
  cover shows its colour: an underlay behind the scroll container (content above the top is not
  drawn, so the cover cannot run on upward), as tall as the cover is on screen less
  `UNDERLAY_SLACK`, so it stays behind the cover when it follows scrolling a frame late. It sets `--page-bar-overlay` (the bar's height) meanwhile, which the
  find bar keeps clear of. A long trail truncates. With `bare: true` in the tab state (a host's
  panel: the collections' page panel, which puts its ×, full page and to the side there) the bar
  stays but shows no breadcrumbs, actions or •••.
- **Sub-pages from the editor**: `createSubPage` (Notion's Mod-Alt-9 "turn into page" and the `+`
  menu) creates a child of the open document with `doc.create`, placed first (`atTop`), and links
  it the way `[[` would (folder link settings apply). The `+` menu reuses the `[[` menu renderer;
  its "new sub-page" item has `create: true`.
- **`[[` links** follow the folder settings in folder windows (`linkStyleOf`, read per link):
  `linkPath` names the target (`linkTargetFor`; the path shows under the title in the menu),
  `linkFormat: "markdown"` writes `[Title](path.md)` (suggestion `href`). Elsewhere: the title, as a
  wiki link. Checked in Electron by `apps/desktop/e2e/ui.e2e.ts`.
- The scroll container carries `data-scroll-root` so overlays find it without a computed-style walk.
  Its right padding is `var(--doc-margin, 0px)`: an overlay that puts something beside the text
  (the threads plugin's comment margin) sets it for room, and the title and body move left
  together.
- Without the links plugin, Mod-click on a wiki link still follows (`app.modeFor(gesture, "edit")`).
