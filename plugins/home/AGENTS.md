# AGENTS.md - @lydie/plugin-home

Built-in plugin: the home page.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `backend.ops`, `app.storage`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.
- Nothing on the page needs setup, and a section with nothing to show is left out.

## What it does

Registers the view for `/` ("Home"), so it is the new-tab page, the command "Go to home",
and a "Home" sidebar entry (order 2; `aria-current` while the focused tab is the
home page; click opens here, Mod-click in a new tab). It answers "where was I" and "where do I write this":

- **Find box** (focused when the tab is): title matches first (fuzzy on title or path + title, lifted
  by recent opens here; `rankTitles`), then full-text hits (`doc.search`) not already listed, then
  "Create “…”" when no title matches exactly (offered once titles have loaded, so an early Enter
  does nothing). Arrow keys move, Enter opens here, Mod+Enter in
  a new tab, Mod+Alt+Enter or Shift+Enter to the side, Escape clears.
- **Start here**: one row linking to the workspace's Getting started page (`gettingStartedId`)
  while it exists and is not in the trash; left out otherwise, and never in "Jump back in". A
  hand-off gives the page the hosted workspace's derived id (`@lydie/sync`), so it is found there too.
- **Jump back in**: up to 8 documents, opened on this device first (newest first), then the
  workspace's recently changed ones (`doc.recent`, watched only while fewer than 8 were opened here).
  Each row shows its parent and when it last changed. Trashed documents drop out of the list.

Opens are recorded per device and workspace (`home:recent:<workspaceId>`, at most 50) whenever a
document becomes the focused tab. The quick switcher keeps its own frecency stats.

Hosted caveat: collaborative edits do not bump a document's `updatedAt` yet, so "changed" times in
hosted workspaces reflect renames, moves and property changes, not typing.
