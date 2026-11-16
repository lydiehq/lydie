# AGENTS.md - @lydie/plugin-links

Built-in plugin: the link popover, link following, unresolved links and embeds.

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

- `LinkInteractions` (editor extension, priority 1000): the link menu follows the selection (clicking a link or selecting text inside one opens it; moving out, typing, Escape or a press outside the editor closes it), Mod-click follows on press, middle click, read-only clicks, Mod+K (a bare caret, even in a link: nothing, so the command palette gets it; a selection inside a link or a selected wiki link: the menu with focus; any other selection: the link editor), Escape, and the `data-unresolved` decoration (an edit redraws only the textblocks it touched, `updateLinkDecorations`; a new set of unresolved targets or icons redraws all, `linkDecorations`; `extension.test.ts` checks the one against the other after random edits). State is a per-editor store (`linkStoreOf(editor)`: closed | hover | menu | edit); the extension reads no data.
- `LinkLayer` (editor overlay): renders the store as `FloatingCard`s.
  - Hover (`useLinkHover`, `HoverPreview`, `data-testid="link-preview"`): resting on a link for `PREVIEW_OPEN_DELAY` shows `DocPreview` (plugin-api's `DocCard`, the same card as the tree's hover card; a `#heading` or `#^block` link excerpts that part), the address of a web link (no fetch from the client) or "does not exist yet". Read only, no actions. It stays while the pointer is on the link or the card, swaps at once to another link, and closes on a press, a key (not a bare modifier) or typing; it never opens over the menu or the editor.
  - Click (`LinkMenu`, `data-testid="link-menu"`, one row): Open (modifiers apply) / New tab / Side, Edit, Copy (`[[Note#Part]]`), Convert wiki ⇄ Markdown, Remove; unresolved: Create note; web: Open in browser. Buttons without a text label (`IconAction`, and the bracket glyph of Convert) have a tooltip.
- `LinkEditor`: text + target with suggestions for documents, `Note#heading`, `Note#^block` (a block without an id gets one through `app.editor.assignBlockId` and `doc.updateBody`, or directly in the open editor for the same note). Tab completes, Enter applies, a URL target makes a Markdown link.
- Click modes come from `app.modeFor(gesture, "edit" | "read")`: editor Mod-click same tab, Mod+Shift-click or middle new tab, Mod+Alt-click split (reusing the pane beside).
- Resolution: the source's saved links (`doc.links`, LYD-268) carry the runtime's resolution, live; `useResolved` and `resolveTarget` read them first. A link typed since the last save falls back to `resolve.ts`'s copy of the runtime's rule (title or path, case-insensitive, source folder first, then shortest path) over `doc.search` + `doc.get`, cached 3 s. Unresolved styling comes from the document's own `doc.links` (target null), so creating or renaming a target updates it.
- Page icons on wiki links (LYD-253): `LinkIcons` reads the resolved targets' icons from the document's `doc.links` (the local backend adds `target.icon`; one query, not one per target) and the extension draws them as widgets before the links.
- New notes from unresolved links go beside the linking note (where resolution looks first).
- Folder windows: document suggestions in `LinkEditor` name targets per `linkPath`, and new links
  use `linkFormat` (Markdown: `[text](target.md)`); editing an existing link keeps its syntax.
- Contributions: `links.register({ kind: "embed" })` → `EmbedBlock` (`![[note]]`, `#heading`, `#^block`, images from attachments by file name; read-only, "Open" button; drawn by `MiniDoc`, which gives column rows the editor's markup and widths), `kind: "preview"` → `ReadPreview` for `useHoverPreview` in lists.
- Tests: `targets.test.ts` (parsing, hrefs, sections); e2e in `apps/web/e2e/links-features.e2e.ts`.

Opening whole: the hover preview fetches its target's page ahead (`prefetchDoc`), and an image embed
keeps the height it had last time (in memory) while its attachment URL is made.
