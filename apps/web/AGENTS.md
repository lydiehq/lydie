# AGENTS.md - @lydie/web

The web shell: a thin Vite + React 19 app that implements `@lydie/platform` for the browser and
mounts `@lydie/app` with the built-in plugins. Also the renderer of the Electron app. Licence:
AGPL-3.0-only.

## May depend on

Internal packages per `client/scripts/check-boundaries.ts` (authoritative, runs in CI): it is a
composition root.

## Composition (`src/compose.ts`, the only place that decides)

- Electron injected a platform with `services` (`getInjectedPlatform()`): the backend is
  `createRemoteBackend(platform.services)`; the database lives in the main process.
- Plain browser ("local browser mode", no login): SQLite WASM on OPFS through `openWebStore`
  (PowerSync's worker), runtime in the page, `createLocalBackend`. The workspace id is minted on
  first run (`localStorage` `lydie:local-workspace`) together with the Getting started page
  (`createGettingStarted`, one transaction, not on the undo stack), which the window opens.
- First run elsewhere (`src/welcome.ts`, LYD-313): a desktop folder window opens
  `backend.info.welcomeDocId` (the main process wrote the page into a new, empty folder). A new
  hosted workspace (`createWorkspace({ gettingStarted: true })`, from "New cloud workspace…" or the
  desktop start screen) gets the page on the server; `rememberWelcome` marks it in `localStorage`
  (`lydie:welcome:<id>`) and the reopened window takes the mark and opens the page as soon as sync
  brings it (`openWelcome`, up to 60 s, not if a document was opened meanwhile).
- "Move to cloud" forgets the browser's workspace once all of it is in a cloud workspace
  (`discardLocalWorkspace`, the hand-off's `discard`): the record is removed and its database is
  listed in `lydie:local-discarded`, deleted at a later start when nothing has it open
  (`deleteWebDatabaseFiles`; a hosted window does it at once). The next local window mints a new
  workspace; its record names its database (`db`) when the first name is still waiting to be
  deleted. Attachment bytes stay (content-addressed, shared with hosted windows).
- Browsers without PowerSync multi-tab support (Safari, iOS, Android) hold a Web Lock: a second tab
  shows "Lydie is open in another tab" with "Use Lydie here" (`src/single-tab.ts`).
- When OPFS is missing the store runs in memory: the sidebar says so, and the Getting started page
  is created again on every start.
- The local database asks for `navigator.storage.persist()` once open (not in embed or benchmark).
- A database that cannot be opened (`WebStoreOpenError`) shows `src/StorageRecovery.tsx`: notes are
  still there, "Save a copy" downloads the raw database (and its journal, if a write was unfinished)
  through `readWebDatabaseFiles`, then Reload. There is no reset.
- `platform.downloads` (`src/downloads.ts`, LYD-376): with the File System Access API (Chromium)
  a hosted export or backup is saved by picking the file (`showSaveFilePicker`) and piping the
  fetched link into it, so the app shows progress and nothing is held in memory; a failed fetch
  aborts the file. Without the API (Firefox, Safari), or when the picker refuses because the click
  that started it has lapsed, it is a plain link and the browser's downloads show the progress:
  fetching it ourselves there would mean holding the whole zip as a Blob first.
- `vite.config.ts` must keep `powersyncOpfsFix()` from `@lydie/store/vite` in `plugins` and
  `worker.plugins` (LYD-279; see `packages/store/AGENTS.md`). Those settings live in
  `vite.shared.ts` (`appVite()`, exported as `@lydie/web/vite`) so that any other bundler of the
  app uses the same ones.

## The try-out (`src/try.tsx`, exported as `@lydie/web/try`)

`mountTry(element, { appUrl, about, show })` starts the whole app inside a page that is not the
app (the marketing site's home page, which paints a captured copy of the shell first).

- The page's own content (`about`, an element) becomes the first tab, "About Lydie" (path
  `/about`, with a sidebar item above Home). It is moved into the tab, not copied, so its scroll
  position, focus and form input carry over. The app renders hidden in `element`; once it has
  painted its sidebar it takes `about` and calls `show` in the same animation frame, and then
  restores focus (an element in a hidden app cannot take it).
- The database is in memory (`WASQLiteVFS.InMemoryVfs`, a new file name per page), the blob store
  is the memory port, `startApp` gets `createMemoryStorage()`, and the window title is left alone.
  Nothing is written to the page's storage and no Web Lock is taken.
- The workspace id is fixed (`WORKSPACE_ID`), so the shell paints the same every time and the
  page's captured copy matches it.
- No session and no account service: nothing reaches the API. The workspace gets the "try"
  Getting started page, `info.ephemeral` (no sidebar warning) and a banner with "Open Lydie"
  (`appUrl`).
- The page brings the app's stylesheet (`@lydie/web/styles.css`); `try.tsx` imports none.
- Narrow pages (`NARROW`, under 768 px) start with the sidebar collapsed.

## Bundle splitting

- Hosted-only code (the sync engine, the collab pool, the hand-off, Yjs) is reached only through
  `src/hosted-lazy.ts`, imported dynamically where a window opens a hosted workspace, the desktop
  collab pool starts, or the hand-off runs. `@lydie/sync` is `"sideEffects": false`, so what the
  startup imports from it (session, scope preference) does not pull the rest in.
- `src/plugins.ts`: settings, team, sharing and publishing are `lazyPlugin`s (`src/lazy-plugin.ts`):
  id and name up front, code in their own chunks, loaded at startup in parallel with the database,
  activated when in.
- Initial JS (entry + modulepreloads) in local mode: 2,500 KB / 768 KB gzip before round 4,
  2,196 KB / 675 KB after.

## Boot

- `public/theme.js` (head) applies the saved theme before the first paint; light by default.
- `public/boot-shell.js` (after `#root`) paints the shell's frame (window background and content
  card, at the saved sidebar width) before any module loads, so a reload never shows a blank page.
  It mirrors `LydieApp`'s geometry: keep them in step. `src/boot-shell.ts` removes it once the app,
  an error or another page renders; the loading label fades in only after 1.5 s.
- Both are classic same-origin scripts, not inline: the desktop CSP forbids inline scripts.
- Vendor chunks (`vite.config.ts`, LYD-226): `react`, `editor` (ProseMirror/TipTap), `markdown`
  (micromark/mdast) and `powersync` split out of the entry, so a deploy that changes only the app
  leaves them cached. Groups list packages explicitly: a group pulls in modules that only lazy
  chunks use, so a broad pattern turned wa-sqlite, PowerSync's WebSocket transport and every
  highlight.js grammar into startup code. After changing a group, compare what `dist/index.html`
  loads (entry, modulepreloads) before and after. Nov 2026: startup 2.5 MB / 767 kB gzip in 13
  files; the largest is the entry, 626 kB.

## Modes and routes

- The address bar follows the focused tab (`syncUrl` from `@lydie/app`, started in `LydieWeb.tsx`
  for browser tabs, not the embed or Electron): a tab's path is the URL
  (`/d/<title>-<docId>`, `/trash`, …; `/settings/<page>` for the settings overlay), under
  `/w/<slug>/` in a hosted workspace (its id where this browser has not cached the slug). The server must answer these with `index.html` (no
  segment has a dot). Top-level names taken by pages outside the app: `invite`, `s`, `oauth`,
  `playground`. Details: `packages/app/AGENTS.md`, "URLs".
- The URL says which workspace a window opens (`src/scope.ts`, used by `compose.ts`):
  `w/<slug or id>/…` is that hosted workspace (resolved from `lydie:hosted-workspace-slugs`, a
  cache of `session.workspaces()`, else by asking), the app's base is the workspace opened last (the
  `lydie.scope` preference), any other URL is this browser's own. Signed out: the browser's
  workspace opens with the sign-in dialog (`account.wanted`), the URL is left alone, and signing
  in reloads it (a provider sign-in comes back to it through `returnTo` in the sign-in intent).
  Signed in, a workspace this browser has not listed before is looked up (`session.workspaces()`);
  one the user cannot open falls back to the last one with a toast (`Composition.notice`).
  Switching workspace goes to the other one's URL (`reopen` in `src/hosted.ts`).
- `?embed=1`: for a page that frames the app; posts `{ type: "lydie:embed-ready" }` to the parent
  once mounted. The marketing site no longer frames it (it mounts the try-out instead).
  `Content-Security-Policy: frame-ancestors 'self' https://lydie.co http://localhost:4300` is set
  by the dev and preview servers (production: CloudFront).
- `?seed=large` (dev, and builds with `VITE_LYDIE_SEED=1`): opens `lydie-bench.db` and seeds it once
  with `client/scripts/seed` (10k notes, a folder with 5k children, a 2k-block document; ~15 s).
- `/playground` (dev only): the design-system and editor playground.
- In-app "Playground" view (dev only, `src/playground/playground-plugin.tsx`, linked at the bottom
  of the sidebar): design explorations, switched at the top (`src/playground/Explorations.tsx`).
  "Avatars" (`src/playground/avatars/`) compares looks for people, workspaces and robots (MCP
  clients, API keys, automations), all built from `@lydie/ui`'s mark (`MARK_PIECES`, the
  canonical path) and its band, with a star per row and mocks that use the starred ones, plus
  mascot candidates (Lydie itself, a character of its own: bookworm, moth, ink drop, sticky note,
  blob, one shared face, each through idle, thinking, working, happy, oops and asleep;
  `avatars/mascot.tsx`), and scribbles (`@lydie/ui`'s `ScribbleIcon`, what workspace icons
  are). "Scribbles" (`src/playground/scribbles/`) shows only the ten doodles, small; "Draw your
  own" (`scribbles/DrawPlayground.tsx`) is a pointer canvas on the beige squircle with the six
  pens, undo, clear, the ten as starting points, previews at 64 to 16 px and Copy SVG (kept in
  `app.storage`). "Mac
  icon" has the macOS app icon variants and theme colour (its mark is `MARK_PATH`).
  "Empty states" (`src/playground/empty-states/`) shows every empty-state drawing from `@lydie/ui`
  with the text it has in the app, in `EmptyState` or alone, light or dark, at panel and page
  sizes, and the collection view drawings at menu size.
- Pages outside the app, lazy-loaded (`App.tsx`), sharing one session and an inline sign-in form
  (`src/standalone.tsx`): `/invite?token=` (accept an invitation), `/s/<slug>` (a public page) and
  `/oauth/consent?request=` (an app asks to use the hosted MCP server: client, scopes in plain
  words, workspace picker, Approve / Deny; logic in `src/oauth-consent.ts`, unit-tested).
- "Sign in to Lydie Cloud" in the sidebar footer is a stub dialog (hosted sync wiring: see
  `packages/sync/INTEGRATION.md`).

## Tests

- `bun run test:e2e`: builds `.e2e/main` (e2e builds live in gitignored `.e2e/<suite>`, outside
  `dist/`, so a plain `vite build` cannot empty them mid-run), serves it with `vite preview` on a free port and runs
  `e2e/flows.e2e.ts` (documents, undo/redo, tabs and splits, quick switcher, search, wiki links,
  backlinks, trash, palette, sidebar, two pages at once, embed). `BROWSER=webkit|firefox` runs
  the same suite in another engine (`bunx playwright install webkit firefox` once). Each test uses
  a fresh on-disk profile (WebKit only offers OPFS to persistent profiles).
- `bun run test:perf`: `e2e/perf.e2e.ts` against the seeded workspace in a reused profile on a
  fixed port (`LYDIE_PERF_PORT`, default 5197); writes `/tmp/lydie-web-perf.json`.
- `bun e2e/playground.ts [url]`: the old playground smoke check against a running dev server.
- `bun e2e/storage-stress.ts kill|two-pages|low-disk [runs] [outDir]` (by hand, Chromium): repeats
  killing the browser mid-write, two pages writing at once, or a full disk (macOS disk image), and
  counts databases left unopenable (LYD-279: kill went from 4 of 10 to 0 of 10).
- Screenshots go to `/tmp/lydie-web-*.png`.

## Notes

- Dev server: `bun run dev:web` on http://localhost:3000 (`strictPort`).
- `server.fs.allow` includes the install root's `node_modules` (above `client/`); without it the
  self-hosted Inter font returns 403.
- PowerSync's worker and WASM files are excluded from dependency pre-bundling (`optimizeDeps`).
