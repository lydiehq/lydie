# AGENTS.md - Lydie client (public repo)

The open-source Lydie client: a writing app that works on a folder of Markdown files (local mode) or
against a hosted workspace. Web and Electron from one React app. Licence: AGPL-3.0; the packages marked
MIT below are MIT.

## Packages

| Package                          | Purpose                                                                                                    | May depend on                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@lydie/contract` (MIT)          | Operation and query definitions (Zod 4), event schemas. Generates OpenAPI, MCP tool schemas, CLI help.     | nothing internal                                                           |
| `@lydie/runtime`                 | Runs operations in-process over ports (`Db`, `Blob`, `Search`, `Events`, `Clock`, `Actor`).                | contract                                                                   |
| `@lydie/store`                   | Local SQLite schema and domain queries through the PowerSync client SDK. The only package that writes SQL. | contract, runtime                                                          |
| `@lydie/markdown` (MIT)          | Lydie Markdown ⇄ ProseMirror, splice-preserving save, three-way merge. Runs headless.                      | nothing internal                                                           |
| `@lydie/editor` (MIT)            | TipTap 3 extensions matching the `@lydie/markdown` schema.                                                 | markdown                                                                   |
| `@lydie/ui` (MIT)                | Design system: react-aria-components + Tailwind 4.                                                         | nothing internal                                                           |
| `@lydie/platform`                | Interface for fs, watch, dialogs, windows, menus, updater, secure storage. Types, small helpers.           | nothing internal                                                           |
| `@lydie/plugin-api` (MIT)        | The public plugin surface.                                                                                 | contract, platform, ui, editor                                             |
| `@lydie/app`                     | Plugin host: layout, routing, loader, command palette. No features of its own.                             | everything above                                                           |
| `@lydie/bridge-fs`               | File bridge: folder ⇄ database. Node only.                                                                 | store, markdown, contract, runtime                                         |
| `@lydie/sync`                    | Cloud sync peer.                                                                                           | contract, runtime, store, sdk                                              |
| `@lydie/sdk` (MIT)               | Generated TypeScript client for the hosted API.                                                            | contract                                                                   |
| `@lydie/mcp-local`, `@lydie/cli` | Local MCP server and CLI over the runtime.                                                                 | contract, runtime, store, bridge-fs (cli also mcp-local)                   |
| `plugins/*`                      | Built-in features.                                                                                         | `@lydie/plugin-api` only                                                   |
| `apps/web`, `apps/desktop`       | Thin shells implementing `@lydie/platform`.                                                                | every package above except cli (mcp-local: desktop only), plus `plugins/*` |

The "May depend on" column is enforced by `scripts/check-boundaries.ts` (`bun run check:boundaries`),
which is authoritative: change the table there first, then here.

## Rules

- Nothing here may import from outside this repository.
- Plugins import only `@lydie/plugin-api`. If a plugin needs something the API lacks, extend the API.
- UI code (`ui`, `app`, `plugins/*`) never writes SQL or touches the filesystem.
- Every user-visible action is an operation in `@lydie/contract`.
- Generated files are committed. Regenerate, do not hand-edit.

## Commands

```bash
bun install
bun run check          # lint, format:check, typecheck, test, check:boundaries
bun run format         # bun fmt; config is [fmt] in bunfig.toml (format:check to verify)
bun run typecheck      # bun check in every package (use `bun check --no-script` at this root)
bun run test           # bun test ./scripts, then every package's `test` script
bun --filter=@lydie/platform run test   # one package (or `cd` into it and run `bun test`)
bun run dev:web        # web app on http://localhost:3000
bun run dev:desktop    # Electron app
bun run bench          # seeds 10k notes, a 5k-row database and a 2k-block document; runs the store
                       # budgets and prints one line per measurement (median, p95, budget, ok/OVER)
bun run bench:markdown # @lydie/markdown parse/save timings (seed document, help vault if downloaded)
bun run seed --out <file.sqlite>   # the same seeded database, for manual testing
bun run seed:demo --out <folder>   # a realistic workspace (someone's notes, journal, projects,
                                   # three databases) as a folder to open in the app; the
                                   # content is scripts/seed/demo.ts, written through operations
```

## CI

`.github/workflows/ci.yml` runs on pushes to `main`/`v2` and on pull requests, with Bun pinned to the
version used locally (`BUN_VERSION`; bump it with Bun). No secrets.

- `checks`: `bun install --frozen-lockfile`, then lint, format:check, typecheck, test,
  check:boundaries and check:generated (`generate --check` in `@lydie/contract` and `@lydie/sdk`).
- `web-e2e`: `apps/web` `test:e2e` and `test:e2e:links` in Chromium. The databases suites (performance
  budgets) and `test:e2e:settings` (needs a hosted core) are not run.
- `desktop-e2e`: `apps/desktop` `test:e2e` against the built Electron app on macOS.

## Tests

- Bun's test runner: import from `bun:test` (`mock`, `spyOn` instead of `vi.*`). Unit tests are
  co-located as `*.test.ts(x)`. Packages without tests use `"test": "bun test --pass-with-no-tests"`.
- DOM tests: the package's `bunfig.toml` sets `[test] preload = ["./test/setup.ts"]`, which calls
  `GlobalRegistrator.register()` from `@happy-dom/global-registrator`. Rendering to a string
  (`react-dom/server`) needs no DOM.
- End-to-end tests are `e2e/*.e2e.ts`: the default `bun test` run skips them (no `.test` in the
  name), and the package's `test:e2e` script runs them explicitly, e.g.
  `bun test --timeout 60000 ./e2e/*.e2e.ts`. They use `bun:test` with the Playwright library;
  Bun's `expect` has no `expect.poll`, so wait with locators (`locator.waitFor()`,
  `filter({ hasText })`) or a small poll helper (`apps/desktop/e2e/poll.ts`).
  - Desktop: `playwright-core`'s `_electron.launch()` against the built app (`out/`); `test:e2e`
    builds first.
  - Web (convention, not set up yet): `playwright`'s `chromium.launch()`; the suite starts
    `vite preview` on a free port in `beforeAll` and stops it in `afterAll`. Browsers come from
    `bunx playwright install chromium`.

## Code style

TypeScript strict with `noUncheckedIndexedAccess`; `import type` for types; `type` over `interface`.
Packages export TypeScript source directly. React 19 with React Compiler and function-declaration
components. Zod 4. Colours: light-mode Tailwind classes with `bg-surface`/`bg-elevated` and
`gray-950/N` overlays instead of white/black; dark mode follows from the theme (see
`packages/ui/AGENTS.md`, "Colours and dark mode"). No uppercase text anywhere in the UI (no `uppercase` class, no all-caps labels): section titles are sentence case, `text-xs font-medium`. Components `PascalCase.tsx`, other files `kebab-case.ts`. oxlint lints;
`bun fmt` decides formatting and import order. Our own lint rules are in `scripts/oxlint-plugin.ts`:
`lydie/icon-button-tooltip` (a button that shows only an icon needs a tooltip; see `packages/ui/AGENTS.md`).
Shared rules are in `oxlint-base.json`, which other configs extend; keep `jsPlugins` in `.oxlintrc.json`,
because oxlint fails when two configs in one run load the same plugin.

## Contributing

Open an issue describing the change before a large pull request. Plugins, connectors and importers are
the preferred contribution surface. Disclose AI assistance in the pull request description.
