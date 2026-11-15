# AGENTS.md - @lydie/plugin-quick-capture

Built-in plugin: quick capture.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Mod+Shift+I opens a small box; Enter runs the contract's `inbox.capture` (LYD-385), which appends `- HH:mm text` to a top-level "Inbox" note (named per device under `quick-capture:inbox`, created when missing); one undoable step. The web clipper and automations use the same operation through the API with a capture-only token. A system-wide shortcut needs the desktop shell to register a global shortcut and deliver the command id `quick-capture.open` through `platform.menus` actions, which the host already runs as commands.
