# AGENTS.md - @lydie/plugin-quick-switcher

Built-in plugin: Cmd+O quick switcher.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Mod+O / Mod+P. Ranking (`ranking.ts`, tested): fuzzy match on the title, or on path + title (counting less), plus 250 × frecency (log2(1 + opens), half-life one week; opens are counted per device whenever a document becomes the focused tab). Empty query: eight suggestions (`suggest`), the documents opened most by frecency, filled up with the most recently edited ones. No exact title match: "Create “…”" (Enter). Enter opens here, Mod+Enter in a new tab, Mod+Alt+Enter (or Shift+Enter) to the side. `#text` lists the active note's headings, `Note#text` another note's; `>text` lists commands. Shows page icons.

The highlighted document's page is fetched ahead (`PickerDialog`'s `onHighlight` → `prefetchDoc`).
