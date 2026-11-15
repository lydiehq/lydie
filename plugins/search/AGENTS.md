# AGENTS.md - @lydie/plugin-search

Built-in plugin: full-text search view.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

A "search" view tab: full-text search (`doc.search`, deferred input, state in the tab), results open with the usual modifiers (`app.modeFor`) and preview on hover (`useHoverPreview`).
