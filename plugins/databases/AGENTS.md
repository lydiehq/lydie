# AGENTS.md - @lydie/plugin-databases

Built-in plugin "Collections" (called databases in the code, contract and folders): a collection is a
page whose sub-pages share properties and views. Any page with sub-pages can become one and be turned
back. Its views show on its own page (under the page's text) and inline (`![[Name.base]]` /
`![[Name.base#View]]` in any document).

User-facing words: collection (never "database"), page (never "row"), properties, views, filter,
sort, group / sub-group, summary. Code names (`database.*` operations, `data-testid`s,
component names) stay as they are.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API: `useDatabase`, `useDatabaseView` (`@lydie/plugin-api/databases`),
  `useQuery`, `useOps`, `backend.transaction` for multi-operation steps (paste). No SQL.
- Every change to data is an operation (undoable). View settings go through
  `ViewContext.updateView` (a patch: only the given config fields change), which is personal: see
  "Personal view changes" below. Creating, renaming, duplicating, reordering, retyping and deleting
  views are operations right away.
- Value editors and value rendering are the shared ones in `@lydie/plugin-api/databases`
  (`PropertyEditor`, `PropertyValueView`); do not fork them here.
- Lists that can grow are virtualised (`virtual.ts`, re-exported from `@lydie/plugin-api/grid`):
  windows of the view are fetched as the user scrolls (`windowFor`, pages of 100, at most 1,000
  rows per window).
- Select elements in tests by role, label or test id.

## Contributions

- `documents` body slot `database` (`CollectionPage.tsx`): a collection's page shows its own text
  (the slot's `fallback` editor) above `DatabaseScreen` when it has any, "Add a description…"
  otherwise, with "Hide description" / "Show description" per tab. The views then keep at least
  70vh and scroll inside; the page scrolls past the description. The editor is rendered in the
  same place for plain pages and collections (wrappers with `contents`), so turning a page into a
  collection or back never remounts it: keep it that way, a remount shows a stale body.
- On its own page the bar of views (tabs and toolbar) and the chips keep to the title's column
  (`pageColumnClass(fullWidth)`: as wide as the text, or the full-width page's), so the bar never
  stretches past the title; the views start at the column's left edge and run to the right edge
  of the window (the views' own insets in `DatabaseScreen.tsx`, `pageInset` for the skeleton's
  rows in `skeleton.tsx`; they mirror the title column for normal and full-width pages
  (`full-width: true`, read by `CollectionPage.tsx`): change them together).
- Loading shows skeletons, never a spinner (`skeleton.tsx`, outside the lazy chunk; bars are the
  shared `Skeleton`, hidden for the first 150 ms so a quick load shows none). Before the
  collection or the views' code is there: `ScreenSkeleton` (the page shows it as soon as
  `database.list` says the page is a collection; embeds use it `compact`). Before a view's first
  result: the view's own rows and cards as placeholders (`placeholderItems`, `PLACEHOLDERS`; the
  board `BoardSkeleton`), so nothing moves when the pages arrive. Rows and cards scrolled to
  before their window loads draw the same bars.
- `links` embed renderer `database-embed` (`*.base` targets): `InlineDatabase`, compact, with
  "Open as page"; unboxed (`data-embed-bare`: the editor's embed border and padding are dropped and,
  like a table, it spans the editor's width from the text column on: the title and the bar of
  views keep to the text column (`data-embed-column`, max width in editor-content.css), the view
  below runs on to the right when it is wider, so a board's columns are not cut at the text's
  edge); events kept inside the embed (Cmd+Z runs the app's undo).
- Commands: "New collection" (`databases.new`, bound to `database.create`: top level, unique title,
  opened with its title selected for naming); "Turn into collection" (`databases.fromPage`, args: the document id or
  `{ documentId }`, default the open page; also run by the properties plugin); "Turn back into page"
  (`databases.toPage`, `database.delete`).
- `databases.openView` (hidden, args `{ databaseId, viewId, mode? }`): opens the collection on a
  view by setting its page's tab state (`COLLECTION_STATE_KEY` + `:view`, `CollectionPage.tsx`); in
  the active tab when it already shows the collection. The sidebar tree's view rows run it.
- Sidebar section "collections" (`CollectionsSection.tsx`, order 11: under the documents, above
  Trash; LYD-427): every collection by title (`database.list`), wherever it is in the tree, a
  shortcut like Favorites. The title and its "+" (a section action, "New collection") are the
  sidebar's; a row opens like a tree row, with "Open in new tab" / "Open to the right" on
  right-click. Renders nothing while there are none, so the sidebar hides the title too.
- Document menu: "Turn into collection" / "Turn back into page".
- Slash items (`slash.ts`): "Collection" (a child collection of this page, embedded here) and
  "View of a collection…" (overlay `databases.pick`, then an embed). "database" still finds them.
- No row-template UI for now: the data layer still has them (`config.templateIds`, left out of
  views, LYD-209; `database.listTemplates`; `createRow({ templateId })`), but nothing here marks,
  lists or uses one.
- The collection-wide filter (`database.update({ filter })`) has no UI on purpose: it exists for
  `.base` files.

## Personal view changes (`overlay.ts`, `context.tsx`)

- `updateView` writes filter, sorts, groupBy, subGroupBy, columns, summaries, limit and layout to a
  per-device overlay in `app.storage`: key `databases.overlay:<viewId>` on the collection's page,
  `databases.overlay:<viewId>:embed:<sourceDocId>:<target>` in an embed. Only keys that differ
  from the saved view are kept; the view shown is `{ ...saved.config, ...overlay }`, so a view
  saved underneath shows through wherever the overlay has no opinion.
- `ctx.view` is the merged view; `ctx.savedView`, `ctx.overlay`, `ctx.edited`. The query gets
  `viewId` plus the overlay (and the search) as `view.config`.
- "Edited · Reset · Save for everyone" at the end of the chips row (`ViewChips.tsx`): save is one
  `database.updateView` (one undo step) then clears the overlay; without edit access (hosted
  view/comment) it reads "Only you see this".
- New pages and group moves follow the effective view: with a personal filter or grouping,
  `ctx.createRow` computes the implied values itself (`implied.ts`, mirroring the runtime) instead
  of passing `viewId`, and `ctx.moveRow` sets the effective group's value with `database.setValues`
  in one transaction. Use `ctx.moveRow` rather than `database.moveRow` directly.

## Filters as chips (`ViewChips.tsx`, `chips-model.ts`, `filter-ui.tsx`)

- Under the toolbar, only while the view has filters or personal changes: each filter as
  "Property · operator · value" (each part a picker, × removes), then a "+" that opens the Filter
  menu. Choice and list operators follow the number of values ("is" ⇄ "is any of"). Or-groups or
  nested groups show as one "Advanced filter" chip that opens `FilterBuilder`.
- Filters only. Sorting and grouping are set in Display and are not repeated as chips: the view
  shows them itself (the table header's arrow on a sorted column, with "Remove sort" in the
  column's menu; the group lines). Keep it so: the row has to stay one line for an ordinary view.
- The row is not a `ul`: in an embed the editor's list styles would reach it.
- The toolbar's "Filter" menu (also `F` while the screen has focus, outside fields and the grid)
  picks a property, or a select/status option typed by name; a new filter opens its value.
  "Advanced filter…" switches the menu to the and/or builder.

## Layout of the code

- `DatabaseScreen.tsx`: view tabs, toolbar, chips, the active view; per-tab view choice
  (`useTabState`), the overlay (`useViewOverlay`), the `F` key.
- `context.tsx`: `ViewContext` (definition, effective view, params with overlay and search,
  `updateView`, `openRow`, `peekRow` = open to the side, `createRow`, `moveRow`, `savedView`,
  `overlay`, `edited`, `saveView`, `resetView`, `saveBlockedReason`), `useDraft` for edits faster
  than a re-render.
- Look of the controls: view tabs are text pills with a line under the open one, sitting on the
  bar's bottom border; tabs and toolbar share one line that never wraps (as in Notion, the tabs
  take the bar's width and the ones that do not fit go under "N more…", measured from invisible
  copies before paint, `tabs-model.ts`; the open view always shows, in its place; "add a view"
  stays beside them; Filter and Display keep their labels in an embed too);
  chips are 24px segmented pills ("icon label | operator | value | ×") in `text-xs`; menus have a
  fixed width.
- The board's look (its classes are in `skeleton.tsx`, so `BoardSkeleton` has the same sizes):
  columns on a light gray (`gray-950/[0.035]`, darker while a card is dragged over), the option's
  pill and the count on top, "+" on hover and "New page" at the bottom. Cards are raised
  (`bg-elevated`, lighter than the column in dark mode; a hairline ring and a soft shadow) and
  leave out the properties the column and lane already say. A card drags whole; a grip at its top
  right shows on hover. The dragged card fades in place and the drop line is drawn in the gap
  between cards, so nothing moves while dragging; a column clears its line by the pointer's
  position (`relatedTarget` is null in Safari).
- `PageSheet.tsx`: `ctx.peekRow` ("Open" on a page, Space in the table, a new page from the
  toolbar) shows the page in a panel that slides in from the right over half of the tab: the
  registered `doc` view rendered in a portal on the tab's panel with a tab of its own to read (not
  one in the layout, so scroll and selection are not remembered). The collection beside it stays
  in use and its card does not change; the panel floats 4px inside the card, its right corners following the card's (card radius less the gap), with the popovers'
  edge (`shadow-popover`, `rounded-lg`). Another "Open" swaps the page.
  The open page is tab state (`<stateKey>:peek`), so it returns with the tab. A page without a
  name ("" or "Untitled": a new page from the toolbar or the table) opens with its title focused,
  so it can be named at once: the panel's tab gets `{ focusTitle: true }` through `TabProvider`'s
  `state`, which the doc view reads as for "New document". A page opened from
  inside the panel stacks on it (the panel steps back, inert). Escape with focus in the panel
  (once the editor has no use for it), Escape in the collection's tab that nothing there used
  (the table closes the panel before unwinding its selection), or × closes; "Open as full page" and "Open to the side"
  move the page out; "Open as full page" first grows the panel over the whole tab (300 ms,
  ease-in-out: width, insets, the card's corners, its edge fading), so the hand-over to the tab
  does not show (a stacked panel moves at once). The three sit at the right of the page's bar,
  where a page has its •••; the panel's tab state has `bare: true`, so the bar shows no
  breadcrumbs, Comments, Share or ••• there. Swapping pages cross-fades the two in place (opacity only, 180 ms; the page before stays mounted
  meanwhile). `ctx.peekedId` is the open page: the table rings its row like the active cell
  (`Overlay.tsx`; the ring glides between rows by transform)
  and keeps its button showing, reading "Close" (`ctx.closePeek`, which slides the panel out like
  its ×).
  The panel's left edge resizes it with the sidebar's elastic handle (`useElasticPanel` /
  `ElasticHandle` from the UI package): width per device in `databases.peekWidth`, half the tab
  by default; dragged shut it closes.
- View types: table, board, list, calendar. There is no gallery (removed Nov 2026): a stored
  view of a type Lydie no longer has opens as a table (`viewTypeOf` in the contract).
- `ViewTabs.tsx` (add/rename/duplicate/change type/delete/drag to reorder; a view's menu has no
  button, so nothing appears on the open tab: it opens on right-click, a click on the open tab, or
  Shift+F10 / the menu key, and starts with the view's name as a field, saved as the menu closes; "New view" lists the
  types with their `xs` drawings from the UI package and a line on each), `Toolbar.tsx` (
  "Filter", "Display" = sort, group/sub-group, card or calendar settings and properties with order
  and visibility in one popover, a search icon that the field grows out of (width, 200 ms) and
  shrinks back into, New; keep the
  toolbar to these, new settings go inside Display; row height and board column colours have no
  UI), `ViewChips.tsx`, `FilterBuilder.tsx` (advanced) over
  `filter-model.ts` (pure, tested), `PropertyMenu.tsx` (column settings; `TypePicker`: every type in a grouped
  two-column list, used to add a property in one click and to change a type; type config: relation target
  with "Also show on {Collection}" on by default, rollup, formula editor with the contract's parser,
  number format).
- `table/`: the table on the grid engine (`@lydie/plugin-api/grid`). `TableView.tsx` wires the
  engine's interaction store (active cell, range, editing, picked rows, drags, resize) to the data
  window (`useDatabaseView`, which paints `setValues`/`rename` optimistically) and carries out
  commands: edits (to every picked page when the edited one is picked), paste/fill/clear (one
  operation, or one `backend.transaction` when titles change: one undo step; rows outside the
  loaded window are read first), copy as TSV + HTML table, row drag (`ctx.moveRow`), column move
  and resize (saved once on release through `ctx.updateView`, painted meanwhile via `--c<i>` CSS
  variables). `TableRow.tsx` (memoised rows; a cell subscribes only to whether it is selected),
  `Overlay.tsx` (range, rounded active cell, fill handle, drop lines, the editor's anchor; frozen
  part in a sticky layer; its layers are 0 by 0, so every box, drop lines included, takes its
  size from the geometry, never `inset-*`). A row drag fades the row in place and shows a card
  with its title under the pointer (`RowGhost`, on the body, moved by the drag's pointer events
  without a render), with the grabbing cursor; `Header.tsx`, `SummaryRow.tsx`, `GroupRows.tsx`, `BulkBar.tsx`,
  `cell-values.ts` (copy text, type-aware paste parsing, fill lines; pure, tested).
  Rules: never position anything by measuring cells (geometry comes from the store); render rows
  only when the window moves (scroll updates it once per frame); keep the selection in the store,
  not in props. The title column is frozen (`FROZEN`); the view config has no setting for more.
  On a collection's own page the wrapper sets `--table-inset` (DatabaseScreen `TABLE_INSET`); the
  table measures it and scrolls it as a leading margin, so the table bleeds left when scrolled.
  Pointer: a plain click edits the cell (the editor opens over the cell, `AnchoredPopover`
  `cover`: non-modal and without animation, so the view still scrolls and takes hover, a click on
  another cell moves the editor there, and scrolling commits and closes it; a checkbox flips; computed cells are only selected), Cmd/Ctrl+click selects without
  editing, drag or Shift+click selects a range. Picked pages get a floating dark bar at the bottom
  of the tab (`BulkBar.tsx`, a portal on the tab's panel, so it stays put while the page or an
  embed's page scrolls), as wide as its buttons and centred, at most a normal page's text column
  (`pageColumnClass(false)`, also on a full-width page). In a collection's page panel it stays on its table. Header, summary and group lines use the rows' `border-gray-100`.
  Keys: arrows/Tab/Enter/Escape, Shift+arrows, Cmd/Ctrl+arrows (data edges), Shift+Space (row),
  Ctrl+Space or Shift/Mod+click a header (column), typing edits, Delete clears, Space peeks (toggles
  a checkbox; on a range, checks all its checkbox cells, or unchecks them when all are checked), X / Shift+X pick rows, Cmd/Ctrl+A picks all, Shift+F adds a filter, Cmd/Ctrl+D /
  Cmd/Ctrl+R fill down / right (the range's top row or leftmost column, or the cell above / to the
  left of a single cell; through `fill`, so one undo step, values converted per column type and
  computed columns skipped).
- `board/BoardView.tsx` (a window per column, swimlanes, drag cards with optimistic placement;
  `Card.tsx` with covers), `ListView.tsx`, `calendar/` (month/week, drag to move,
  drag edges for ranges, click a day to create; `calendar-model.ts` pure, tested).

## Controls

Shared components only (`@lydie/plugin-api/ui`): Button, Checkbox, Switch (on/off settings),
Select, TextField/Input/TextArea, `MenuButtonItem` for rows in panels. A plain element stays only
with a comment saying why (rows and cells recycled while scrolling, drag sources, segments of a
chip, invisible hit areas) and takes the shared recipes (`buttonStyles`, `CheckboxMark`,
`focusRingInsetClass`) instead of its own classes.

## Tests

`bun test` (DOM preload from `@lydie/ui`'s `test/setup.ts`, see `bunfig.toml`): filter model, chips
model, overlays, implied values, slash items, cell values (paste parsing, fill), calendar arithmetic,
columns/items/summaries/windowing. End to end:
`apps/web/e2e/databases.e2e.ts` and `databases-perf.e2e.ts` (`bun run test:e2e:databases` in
`apps/web`).
