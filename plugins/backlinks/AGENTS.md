# AGENTS.md - @lydie/plugin-backlinks

Built-in plugin: right-panel links.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

The "Links" panel for the focused document:

- **Linked mentions**: one row per linking document (`doc.backlinks`), the blocks around each link as context (the source body is read when the row shows), badges for links to a heading or `^block` (click: go there), the property name for links in frontmatter. 50 rows at a time ("Show more").
- **Unlinked mentions** (`doc.unlinkedMentions`): snippet and a "Link" button that turns the first plain mention into `[[Title]]` (or `[[Title|as written]]`) with one exact `doc.updateBody` edit + `expectedVersion`, on the active tab's undo scope (Mod+Z undoes it). `mentions.ts` computes the edit (tested).
- Titles open with the usual modifiers and preview on hover (`useHoverPreview`). The outline moved to the outline plugin.
