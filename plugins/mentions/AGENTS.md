# AGENTS.md - @lydie/plugin-mentions

Built-in plugin: `@` mentions.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

- `@` opens a menu (TipTap Suggestion, per-editor storage + `SuggestionPopup`) with dates (today/tomorrow/yesterday, next weekdays, explicit dates as YYYY-MM-DD), people (from the `workspace.members` live query: hosted workspaces only, empty locally) and pages (`doc.search`).
- Stored portably: a page → `[[Page]]`; a date → `[[2026-11-13]]` (as Obsidian's natural-language dates do); a person → `[@Name](lydie:user/<id>)` (readable text everywhere; the link popover shows it as a person).
