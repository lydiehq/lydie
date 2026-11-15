# AGENTS.md - @lydie/plugin-document-tree

Built-in plugin: the document tree in the sidebar.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Rows as in v1 (`v1/packages/web/src/components/layout/DocumentTreeItem.tsx`, `TreeItemIcon.tsx`):
30 px rows in 32 px slots (`ROW_HEIGHT`; the gap still takes drags), `font-medium`, indented 8 px
per level. A page with pages inside has no separate chevron: its icon is the Expand/Collapse button
and turns into v1's caret (`CollapseArrow` from `@lydie/ui`) while the row is hovered, while its menu is open,
on touch screens, and on the keyboard-focused row. The "+" and "…" actions (`RowAction`, tooltips
"Add page inside" / "Document options") show on hover and stay while the row's menu is open, which
opens under the button. Dragged rows dim (`data-dragging`). The empty tree is v1's dashed "Seems
empty here." box, except while a hosted window's first sync is on its way
(`BackendStatus.awaitingFirstSync`): then an empty tree shows a few skeleton rows (`SyncingRows`,
"Syncing documents"), also in place of another plugin's `emptyState`. Tests: `SyncingRows.test.tsx`.

A virtualised tree (`tree-model.ts`): one live `doc.children` query per expanded folder, never the full tree; expanded folders are remembered per device, and until anything is remembered the Getting started page (`gettingStartedId`) starts open, so a new workspace shows its pages. Open (click, Cmd/middle-click for a new tab), create, rename inline (F2 or the menu), move by drag and drop (before/after/inside; a drag resting on a closed folder opens it; drop markers are neutral grey, the line indented to the level it lands on), move to trash;
multiple selection (`selection.ts`): Mod+click toggles (seeded with the open row, as in Finder; Mod+Shift+click
and middle-click still open a tab), Shift+click and Shift+arrows select a range, Space toggles, Mod+A selects
all, Escape clears. Delete and "Move to trash" ask first when a document has content (`confirmMoveToTrash`: a body,
documents inside or a database; empty pages go at once). Delete, "Move to trash" and dragging a selected row act on the whole selection (the topmost
documents only: subtrees go along), in one `backend.transaction`, so one undo reverts it. The "moved to trash" toast names the undo
shortcut and has an Undo button, which restores those documents (`doc.restore`, one transaction)
instead of popping the undo stack, which may hold newer steps by then. A multi-drag carries
`application/x-lydie-doc-ids`; `DRAG_TYPES.doc` stays the grabbed row, so a tab group opens that one; keyboard per the ARIA tree pattern with aria-activedescendant (Shift+F10 or the menu key for the context menu). The open document is revealed: its folders open and its row scrolls into view (`model.reveal`, only when it lives in this tree). The focus ring shows only while the tree has keyboard focus. The empty state's button and the "+" beside the "Documents" title (shown on hover, as in v1) run `core.newDocument`, so the "New documents" setting applies. The palette command `document-tree.collapseAll` ("Collapse all documents") closes all folders in every tree on screen (`collapseAllTrees` in `tree-model.ts`); it has no sidebar button.

Collections (LYD-426): a collection stays in the tree where it lives (the tree matches the
folder), but it never lists its pages: a collection opens to its views (`database.get`, one live
query per open collection), drawn with `VIEW_ICONS`, and its pages are reached through them. Which
pages are collections comes from one live `database.list`; the tree shows no rows until it has
answered, so a collection's pages never flash. A collection can open even with no pages. A view row
(`kind: "view"` in `tree-model.ts`) opens the collection on that view through the collections
plugin's `databases.openView` (Cmd/middle-click: a new tab; without the plugin, the collection's
page); it takes no selection, menu, drag or drop. A page dropped "inside" a collection moves into
it, but the collection does not open, and a drag resting on it does not open it. Revealing a page
inside a collection stops at the outermost collection: its row is focused and scrolled to
(`model.reveal` returns the row's id). Tests: `tree-model.test.ts` (views not pages, kind swapped
when a page becomes a collection, reveal), `DocumentTree.test.tsx` ("collections in the tree").

Favorites (`favorites.ts`, `Favorites.tsx`): "Add to favorites" / "Remove from favorites", a
`documentMenu` contribution (label by state), so it shows in every document menu (the rows' menu,
Home's, the page's •••), and the document-scoped command `document-tree.toggleFavorite` (same id,
so the palette lists it once). They are kept per device and
workspace in `app.storage` (`document-tree:favorites:<workspaceId>`, in the order added), not
synced, so there is no operation behind them. The "Favorites" sidebar section (order 9, above the
documents) lists the ones that are live documents (a trashed one is left out and returns when
restored) and renders nothing while there are none. A row opens like a tree row, shows a star on
hover that removes it, and has its own context menu. Tests: `favorites.test.ts`.

Rows and favorites fetch their page ahead of the click (`useDocPrefetch`, `prefetchDoc` from the
plugin API: after a 60 ms rest and on the press), so it opens whole.

Hover card (`DocHoverCard.tsx`): each row has a `useHoverCard` from `@lydie/ui`
(React Aria's preview trigger). After 1.5 s on a row (twice the default, so crossing the tree
does not set it off), a card beside the sidebar fades in and shows
plugin-api's `DocCard` (also the link popover's card): the cover, emoji, title, the opening lines
(`summarizeDoc`: headings, text, lists, tasks, quotes, code; six lines at most, a title-repeating
first heading skipped) and edited / documents inside / words.
The pointer can move onto the card and it stays open there. While one is open (and briefly after),
the next row's card replaces it at once. Tooltips are timed apart: one that was just open does
not make a card instant, and no card opens while the pointer is on a row's buttons (toggle, "+",
"…"); back on the row the rest starts over. The card is the row's sibling, so events inside it never
reach the row. A press on the row, scrolling, Escape, typing, the context menu, renaming and
dragging put it away; touch never opens it. The open document's row has none (it would repeat the
page on screen), and a row that comes under a still pointer (a scroll, a folder opening, the open
document being revealed) waits until the pointer moves. Tests: plugin-api's `doc-summary.test.ts`, the "hover card" test in
`DocumentTree.test.tsx`. The context menu is plugin-api's `documentMenuItems` (shared with Home), with
`documentMenu` contributions; "Move to trash" goes through its `moveToTrash`. Rows are draggable into tab groups (`DRAG_TYPES.doc`).

The same tree is offered to other plugins as the `documentTree` contribution (`<DocumentTreeView>` in
`@lydie/plugin-api`, props `DocumentTreeProps`): `space` (one hosted space's top level), `filterRoot`,
`dragKey` + `onForeignDrop` (a page dragged in from another tree: the handler, e.g. move to that
teamspace; without one the drop is refused), `createInput`, `expandedKey`, `scroll: "parent"`
(as tall as its rows, virtualised against the nearest `[data-scroll-root]` or scrolling ancestor),
`emptyState` (accepts drops). The hosted spaces sidebar (`plugins/team/src/SpacesTree.tsx`) is one
tree per group. Tests: `tree-model.test.ts`, `DocumentTree.test.tsx` (fake backend: space filter,
moves within a tree, foreign drops, refused drops).
