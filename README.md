# Lydie

A writing app that works on a folder of Markdown files, or against a hosted workspace. Web and desktop
(Electron) from one React app.

**Lydie v2 is a ground-up rebuild, in alpha.** Expect rough edges and keep backups of your notes. The
old app (v1) is at the `v1` tag.

![An essay open in Lydie, with the notes that link to it in the panel beside the text](.github/screenshot.png)

## Download

- **Mac** (Apple silicon and Intel): the `.dmg` on the
  [releases page](https://github.com/lydiehq/lydie/releases). The app is not signed by Apple yet,
  so macOS asks you to confirm the first time; the release notes say how.
- **Browser**: [app.lydie.co](https://app.lydie.co), no account needed.

## Running

Requires [Bun](https://bun.sh) 1.4 or later.

```bash
bun install
bun run dev:web     # http://localhost:3000
bun run check       # lint, format check, typecheck, tests, package boundaries
```

## Layout

- `packages/` libraries: contract, runtime, store, markdown, editor, ui, platform, plugin-api, app, and more
- `plugins/` built-in features, each a plugin that uses only `@lydie/plugin-api`
- `apps/` the web and desktop shells

See `AGENTS.md` for the package map and rules.

## Plugins

Every built-in feature is a plugin on `@lydie/plugin-api`. That is how the app is organised
internally, not yet a way to extend it:

- The plugin API is experimental and may change without notice.
- Third-party plugins cannot be loaded yet.
- Plugins run with the app's full access, with no sandbox or permissions yet. That is why only the
  built-in plugins are loaded.

## Licence

AGPL-3.0 (see `LICENSE`). Packages marked MIT in `AGENTS.md` are MIT, each with its own `LICENSE`.
