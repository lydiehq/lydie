# AGENTS.md - @lydie/plugin-outline

Built-in plugin: the outline panel.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

An editor overlay publishes each editor's headings (from the live editor state, not the last save) and the section in view per tab; the "Outline" panel (right panel, next to Links) shows the focused tab's, highlights the current one (`aria-current="location"`) and scrolls on click. Command "Show outline".

Cost: headings are read on each change after the frame is painted; the section in view (heading
positions, a layout read) only while the panel is shown, also after paint. Headings carry no
position (rows are keyed by index, and positions are looked up on click), so typing above a heading
changes no row. The scroll container is
found through `[data-scroll-root]` (the doc view sets it).
