# AGENTS.md - @lydie/plugin-changelog

Built-in plugin: what's new in Lydie, and the changelog's entries.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- `src/entries/` is plain data with no imports outside it but `../types.ts`: lydie.co/changelog
  reads it through the `./entries` export, so it must not pull in React or the plugin API.
- One file per entry, `src/entries/<yyyy-mm-dd>-<slug>.ts`, listed in `src/entries/index.ts`.
  Text is plain, with `code` spans in backticks and nothing else. Links are full URLs.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

A "?" status item in the sidebar footer (order -10, so left of the account plugin's sync state):
a popover with the latest three entries on a short timeline, each opening its entry, and "See all
changes". A blue dot shows while the newest entry is newer than the one this device saw last
(`changelog.seen` in device storage, `seen.ts`, unit-tested); opening the popover or the page
marks it seen. `view:/changelog` (and `/changelog/:id`, scrolled to that entry) shows every entry
down a timeline. Command `changelog.open` ("What's new").
