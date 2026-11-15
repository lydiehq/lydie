# AGENTS.md - @lydie/plugin-slash-menu

Built-in plugin: `/` menu items beyond the editor's blocks.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Contributes slash items (a getter, re-read as the menu filters): Image or file (upload → attachment → `![[file]]` embed), Link to page and Embed page (a document picker overlay `slash-menu.pick`: before typing it lists the 5 most recently changed documents, `doc.recent`, leaving out the open one), Today's date, and the enabled commands of the registry that act on the open document (`scope: "document"`: rename, share, full width, …; group "Commands", shown only once the user types). App-wide commands such as "Collapse all documents" stay in the palette. Ranking (fuzzy title > keyword, recents first) lives in editor-view's `slash-ranking.ts`.
