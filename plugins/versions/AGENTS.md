# AGENTS.md - @lydie/plugin-versions

Built-in plugin: version history of the open document.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API; no SQL, no filesystem, no git. What keeps the versions
  (snapshots, git, the hosted core) is the backend's business: the plugin calls `doc.listVersions`,
  `doc.getVersion` and `doc.restoreVersion` and never asks which.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Folder windows only (`app.services.vault`), until hosted and browser backends answer the same
operations. The right panel's "History" tab lists the open document's versions, newest first
(`format.ts`, unit-tested: who changed it, when). A version opens to its Markdown; "Restore this
version" asks first, then runs `doc.restoreVersion` on the tab's undo scope, so Cmd+Z takes it back.
The list reloads when the document's `updatedAt` moves. Command: "Show version history".

Which provider a folder uses is a folder setting (`versionHistory`), on Settings → Files & links
(the settings plugin).
