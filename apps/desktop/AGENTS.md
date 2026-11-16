# AGENTS.md - @lydie/desktop

The Electron shell. It implements `@lydie/platform` over one typed IPC contract and loads the web app
(`apps/web`) as its UI, so the same bundle runs in the browser and here. Licence: AGPL-3.0-only.

Stack: Electron 45, electron-vite 6, electron-builder 26, electron-updater 6, @parcel/watcher 2.

## May depend on

`@lydie/app`, `@lydie/platform`, `@lydie/store`, `@lydie/bridge-fs`, `@lydie/mcp-local` (the embedded
MCP server). `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Layout

```
src/shared/ipc-contract.ts    THE contract: every invoke channel (zod input + output type) and every main→renderer event
src/shared/bootstrap.ts       per-window bootstrap passed to the preload via additionalArguments; scheme names
src/shared/diagnostics-service.ts  contract of the stand-in "diagnostics" service
src/main/index.ts             entry: single-instance lock, CLI args, protocol, security, windows, deep links
src/main/handlers.ts          one ipcMain.handle per contract channel (sender + zod checks in `handle`)
src/main/ipc-validation.ts    Electron-free: parseInput, checkSender, origin policy, external URL check
src/main/workspace-fs.ts      Electron-free: file operations confined to the window's folder
src/main/watcher.ts           @parcel/watcher subscription per window, batched to IPC
src/main/services.ts          ServiceRegistry for main-process services (zod-validated)
src/main/vaults.ts            VaultManager (one vault per folder) + backend/vault services routed by window
src/main/windows.ts           WindowManager: one window per scope, bounds, title bar, state events
src/main/downloads.ts         Electron-free: which `will-download` items are the windows' own `downloads:save`
src/main/{security,protocol,asset-path,menus,secrets,state-store,measure}.ts
src/main/updater.ts           electron-updater behind the platform Updater; background checks, install on quit
src/main/update-feed.ts       Electron-free: which release a build updates from (channel, GitHub Atom feed)
src/main/trackpad.ts          loads the trackpad addon; converts its scroll events for the page
native/trackpad.mm            the trackpad addon (Objective-C++, Node-API): scroll phases for swipes
src/preload/index.ts          builds the desktop Platform from the contract; exposes window.lydiePlatform
src/renderer/diagnostics.*    dev-only page exercising every Platform method (not packaged)
e2e/                          Playwright-on-Electron tests against the built app (bun:test, *.e2e.ts)
```

## Rules

- Every renderer → main call is a channel in `src/shared/ipc-contract.ts` with a zod input schema.
  Register its handler with `handle()` in `handlers.ts`, which checks the sender (known window, top
  frame, trusted origin) and parses the input before your code runs. Never call `ipcMain.handle`
  directly and never use `ipcRenderer.send`/`sendSync` from the preload.
- The preload imports the contract with `import type` only (zod stays out of the sandboxed bundle).
- File access goes through `WorkspaceFs` of the calling window. A window can only reach its own
  folder, and only folders the user granted (picker, recent list, command line) can be opened.
- Keep `contextIsolation`, `sandbox`, `nodeIntegration: false`, the CSP, the navigation/window.open
  lock and the deny-by-default permission handlers. Allow a permission only with a reason.
- Pages cannot download (`will-download` is cancelled). The one way in is `downloads:save`
  (`platform.downloads`, LYD-380): the URL must be the hosted API's export link
  (`/v1/workspaces/{id}/export.zip`) or a backup's content (`/v1/backups/{id}/content`) on the
  configured API origin (`checkDownloadUrl`); main asks where in a save dialog, starts it with
  `webContents.downloadURL`, and `DownloadTracker.claim` lets that item through (every URL of its
  redirect chain checked again), saves it to the picked file and sends `downloads:progress`.
  No navigation is allowed for it.
- Main-process modules that can run without Electron stay Electron-free so they are unit-tested.

## Adding a main-process service (database, file bridge, MCP server)

1. Declare its contract with `defineService<Contract>("name")` where both sides can import it (a
   client package, or `src/shared` for desktop-only services).
2. Implement it in the main process and register it in `src/main/index.ts`:
   `services.register(definition, { requests: { m: { input: zodSchema, handle } }, streams: { s: { params: zodSchema, subscribe } } })`.
3. The UI calls it with `serviceClient(platform.services, definition)`. No new IPC channel is needed:
   requests and stream events travel over `services:request`, `services:subscribe`,
   `services:unsubscribe` and the `services:event` event. Subscriptions are released when the page
   reloads or the window closes.

## The data layer (local-folder windows)

- A window whose scope is a local folder gets that folder's vault (`openVault` from
  `@lydie/bridge-fs`): database, runtime and file bridge, in this process. One vault per folder,
  shared by all its windows (ref-counted by window id), opened when the window is created (indexing
  starts while the page loads) and closed when the last window on it closes, or on quit
  (`will-quit` waits for queued file writes).
- Windows are served as soon as the database is open (`VaultManager.acquireServing`), while the
  folder is still being indexed: reads are answered from the database, writes (mutations,
  transactions, undo/redo, attachments) wait for the index. `acquire` resolves once indexed (the
  hand-off source, `onOpened`).
- The database is `userData/workspaces/<hash of the folder path>.sqlite`; nothing is written into
  the folder except `.lydie/`, and, the first time an empty folder is opened, the Getting started
  page (`openVault({ gettingStarted: true })`; its id goes to the backend's `info.welcomeDocId`).
- Two services, routed to the calling window's vault: `backendService` ("lydie-backend",
  `@lydie/app/backend`, `serveBackend(createLocalBackend(vault))`) and `vaultService` ("lydie-vault",
  `@lydie/bridge-fs/service`: status, rescan, open-document sessions with external-edit steps,
  conflicts, the MCP toggle). Every request has a zod schema in `vaults.ts`; `satisfies` makes a
  method added to either contract fail the type check until it has one.
- The MCP server of a vault is off until `mcpSetEnabled({ enabled: true })`; its token is in
  `userData/mcp/`. The MCP SDK (and its HTTP server) is a chunk of its own, loaded when a server
  first starts (`@lydie/mcp-local` imports it dynamically).
- The preload wraps the bridged platform in the page's world (`contextBridge.executeInMainWorld`) so
  `windows.state()` and `updater.state()` keep their identity: contextBridge clones every return
  value, which made `useSyncExternalStore` loop (React #185).

## Hosted windows (src/main/hosted.ts)

- Windows open from the stored session (`session.load()`): the token and user read from the
  keychain decide the scope at once, and the server's check (`session.check()`, in the
  background, at most 10 s) can then move the session to expired, which the renderer follows on the `state`
  stream. A folder window's scope waits for nothing. The sync engine, collab, Yjs and the Markdown
  extractor are `src/main/hosted-lazy.ts`, imported when a hosted workspace opens or the hand-off
  runs, so the main process does not evaluate them before its first window. With the file bridge
  and the MCP SDK also loaded on first use, `out/main/index.js` went from 1,286 KB to 537 KB
  (Nov 2026).
- `HostedManager` holds the session (token in `SecretStore`, i.e. the OS keychain), decides each
  window's scope once (a folder window shows its folder; one without opens the remembered hosted
  workspace when signed in, else the web app shows a start screen), and opens one synced database
  (`userData/hosted/`), runtime and sync engine per hosted workspace, served over the backend
  service. The account service (`@lydie/sync`'s `accountService`) answers the renderer: sign-in,
  workspaces, hosted API requests, collab tokens, sync status. Collab runs in the renderer.
- Hosted HTTP from main goes through `nodeFetch` (node:http): Electron's `fetch` adds `Sec-Fetch-*`
  headers and the auth endpoints then demand an Origin.
- `LYDIE_API_URL` overrides the API origin (default: https://api.lydie.co in packaged builds,
  http://localhost:4100 in development).

## Commands

```bash
bun run dev               # web dev server (reused if already on :3000) + electron-vite dev; app window
bun run dev:diagnostics   # same, but opens the diagnostic page (also: Developer → Platform Diagnostics)
bun run build             # builds apps/web and the trackpad addon, then main/preload/diagnostics into out/
bun run build:native      # the trackpad addon only (macOS; native/build/trackpad.node)
bun run package           # dmg+zip (mac arm64/x64), nsis (win), AppImage (linux) into dist/
bun run package:dir       # unpacked app for the current platform only
bun run test              # unit tests, bun test ./src (src/**/*.test.ts)
bun run test:e2e          # trackpad addon + electron-vite build, then bun test ./e2e/*.e2e.ts (playwright-core _electron)
                          # vault.e2e.ts: operations → files, disk → live queries, renames keep ids, MCP
                          # The script first builds apps/web/.e2e/desktop (`build:e2e:desktop`), the
                          # web build the UI tests load (never the stale apps/web/dist):
                          # restore.e2e.ts: a plain launch reopens the last folder; a deleted one
                          #   falls back to the start screen, which lists and forgets it; the
                          #   workspace menu switches folders in place
                          # ui.e2e.ts: the real UI on a folder, served over the app scheme
                          #   (LYDIE_WEB_DIST); typing, outside writes, folder link settings
                          # optimistic.e2e.ts: input → next paint for rename/move/cell edit in the
                          #   real window, quick-capture rebinding (LYDIE_WEB_URL)
                          # swipe.e2e.ts: two-finger swipes through the trackpad addon (macOS)
bun run dist:mac          # unsigned (ad-hoc) arm64 Lydie.app in dist/mac-arm64/, no dmg/zip
bun scripts/check-release.ts [--arch arm64,x64] [--signed]   # checks dist/ after packaging and
                          # copies the release files to dist/release/ (used by the release workflow)
bun run measure           # S6 baseline against dist/mac-<arch>/Lydie.app (run package:dir first):
                          # first paint, workspace ready (`lydie:ready`), first sidebar row, memory;
                          # each run opens a new folder of 20 notes (--start-screen: no folder)
bun run typecheck
```

Dev ports: web 3000, diagnostic page 5184. Command-line switches: `--open-folder=<path>`,
`--diagnostics` (unpackaged only), `lydie://…` deep links (`lydie://auth/callback` is the return
of a Google sign-in in the system browser, taken by `HostedManager.takeSignInLink`, never routed to
a window; packaged builds only, where the scheme is registered). Environment: `LYDIE_BACKGROUND` (unpackaged only: no Dock icon,
windows shown inactive and never focused, no background throttling; the e2e launches set it through
`e2e/env.ts`, `LYDIE_E2E_FOREGROUND=1` turns it off to watch a run), `LYDIE_USER_DATA` (profile
directory; dev uses "Lydie Dev"), `LYDIE_WEB_URL` (dev UI URL, unpackaged only), `LYDIE_WEB_DIST` (another web build served over
the app scheme, unpackaged only; e2e), `LYDIE_MEASURE*`,
`LYDIE_DISABLE_UPDATER`; at package time `LYDIE_UPDATE_REPO` (owner/repo of the GitHub
releases feed, default `GITHUB_REPOSITORY`, then lydiehq/lydie; `none` for no feed),
`LYDIE_UPDATE_URL` (a generic feed instead), and the signing variables in `electron-builder.config.ts`.

## Global shortcuts, menu actions and routes

- `main/shortcuts.ts` (`ShortcutRegistry`, no Electron import) gives each accelerator one owner: a
  window (released when its page reloads or closes) or quick capture. The quick-capture accelerator
  is stored in `state.json` (`quickCapture`, null = off) and registered at startup. Pressing it
  focuses the last focused app window, or reopens the last workspace (below), then sends
  "quick-capture.open".
- The default menu (`defaultMenu` in `main/menus.ts`) leaves Mod+key combinations to the page
  where the app uses them as Notion does: its View menu has zoom and full screen but no Reload
  (Mod+R fills right in a database table); Reload is in the Developer menu on Mod+Shift+R.
- Swipes: Chromium drops scroll phases before the page sees a wheel event, so two-finger swipes
  come from the trackpad addon (`native/trackpad.mm`, loaded by `main/trackpad.ts`, as Linear's
  desktop app does). An AppKit local monitor per app window reports every scroll that has a phase,
  unconsumed; the main process converts it to the page's CSS pixels and wheel-style deltas and
  sends it on `trackpad:scroll` (`platform.trackpad`), and the page decides. Each event carries
  `NSEvent.isSwipeTrackingFromScrollEventsEnabled` ("Swipe between pages"), so the system setting
  applies at once. `scripts/build-native.ts` compiles it with `xcrun clang++` into a universal
  `native/build/trackpad.node` (gitignored; `node-api-headers` for the headers): `build`,
  `build:shell` and `test:e2e` run it and fail without Xcode's tools; `dev` runs it with
  `--optional` and starts without swipes. Packaged, it is unpacked from the asar. Its `simulate`
  posts trackpad-like events into AppKit for `e2e/swipe.e2e.ts`. Three-finger swipes arrive as
  the window's `swipe` event and are delivered as the menu actions `core.back` ("left") /
  `core.forward` ("right").

## App lock (LYD-383)

`main/app-lock.ts` (Electron-free): a PIN or password, scrypt-hashed with a salt in
`userData/app-lock.json` (mode 600), whether Touch ID unlocks it, and the idle time. Locked from
the start of every run once set up, on `lock()` ("Lock now", the `core.lockApp` command), when the
screen locks or the computer sleeps, and after the idle time without system input
(`main/app-lock-system.ts`: `powerMonitor`, `systemPreferences.promptTouchID`). Five wrong tries,
then each waits, doubling from 30 s to 15 min. Changing or removing it needs the current secret;
nothing changes while locked. Channels `app-lock:*`, state broadcast on the `app-lock:state` event,
`platform.appLock`. The lock screen is `apps/web/src/AppLock.tsx`: the gate waits for the state
before rendering the app, so a locked window never paints notes (the workspace opens meanwhile:
only rendering waits); a lock that comes later covers
the window and makes the rest of `<body>` inert and swallows keys. A forgotten lock is removed by
deleting the file with the app closed (the lock screen says where): it locks the app, it does not
encrypt the notes.

## Privacy mode (LYD-382)

`state.json`'s `blockScreenCapture` (Settings → General → Privacy, `platform.screenCapture`):
`BrowserWindow.setContentProtection` on every window, at creation and when it changes
(`WindowManager.setContentProtection`), over `privacy:screen-capture` /
`privacy:set-screen-capture`. Lydie's windows then show blank in screenshots, recordings, screen
sharing and window previews on macOS and Windows; Linux has no such thing (`supported: false`).
Lydie never puts a document's title in the window title (it is the folder's name or "Lydie"), so
there is nothing to hide there.

## Reopening the last workspace

- Focusing an app window records its workspace in `state.json` (`lastWorkspace`: a folder id, or
  `synced` once a hosted window's page has loaded).
- A launch without `--open-folder`, a Dock click with no windows, and quick capture reopen it
  (`StateStore.folderToRestore`). `synced` opens a window without a folder, and the remembered hosted
  workspace (`account.json`) decides. A folder that cannot be opened falls back to the start screen
  without an error dialog. Profiles from before `lastWorkspace` reopen the newest recent folder
  unless a synced workspace is preferred.
- The start screen (`apps/web/src/DesktopStart.tsx`) lists recent folders and, when signed in, the
  synced workspaces; "Remove from the list" calls `folders.forget`.
- The sidebar's workspace menu lists the same (`desktopAccount` in `apps/web/src/desktop.ts`:
  `localWorkspaces` are the recent folders). Switching replaces the window: a folder opens with
  `windows.open({ replace: true })`, a synced workspace opens in a new window and the folder window
  closes.
- Menu actions go through `WindowManager.deliverAction`. A page that has no listener yet (still
  loading) gets them when its first `menus.onAction` listener asks (`menu:take-pending`).
- `window:open` takes `route`, a JSON object of at most 16 KB, passed through the window bootstrap.
  The new window is offset from its sibling.

## Packaging notes

- Bundle id `co.lydie.app`, icon `build/icon.icns` (generated with `build/icon.png`; unpackaged runs
  set the same Dock icon from `build/icon.png`), `lydie://` registered, folders open
  with "Open With" (CFBundleDocumentTypes `public.folder`, handled by `open-file`).
- asar is on. `@powersync/**`, `comlink`, `better-sqlite3`, `@parcel/watcher*` and `*.node` are in
  `asarUnpack`; PowerSync's worker and extension paths come from its module URL, so `VaultManager`
  opens stores with `store: { workerUrl: unpackedAsar }` (`@lydie/store/node`), which maps
  `/app.asar/` to `/app.asar.unpacked/`. Fuses `onlyLoadAppFromAsar` and
  `enableEmbeddedAsarIntegrityValidation` are on. better-sqlite3 (N-API prebuild) and @parcel/watcher
  load in Electron 45 without a rebuild (`npmRebuild: false`).
- Size: `files` drops better-sqlite3 `deps/src/docs/node_modules`; `scripts/after-pack.ts` removes
  other platforms' and arches' binaries from `app.asar.unpacked`. Mac arm64: 282 MB `.app`,
  `app.asar` 4.6 MB, `app.asar.unpacked` 5.0 MB.
- The fuses block Playwright on the packaged app. Smoke-test it by running
  `Lydie.app/Contents/MacOS/Lydie --open-folder=<tmp>` with `LYDIE_USER_DATA=<tmp>`, then SIGTERM, and
  look for "[lydie] databases closed".
- SIGTERM/SIGINT quit like Cmd+Q: `will-quit` waits for every vault (including ones whose last
  window just closed) and logs "[lydie] databases closed".

## Releases and updates

How to cut a release, the signing secrets and the channels are in `client/RELEASING.md`
(workflow: `.github/workflows/release.yml`, macOS only).

- Version: `package.json` here, the same as `apps/web`. Its first prerelease identifier is the
  update channel (`2.0.0-alpha.1` → `alpha`), set explicitly on the publish config:
  electron-builder only derives it for generic feeds, and a github feed got `latest-mac.yml`.
- `app-update.yml` names a GitHub repository. `update-feed.ts` resolves one release per check (an
  alpha build takes the highest alpha in `/releases.atom`; a stable build reads
  `/releases/latest`) and reads it as a generic feed with single-range requests (GitHub's asset
  storage answers multi-range requests with 501). electron-updater's GitHub provider is not
  used: it would move an alpha build to whatever release is newest, stable included.
- Signing: with `CSC_LINK` the build uses the hardened runtime, `build/entitlements.mac.plist` and
  notarises (APPLE_API_* required); without it, ad-hoc and every artifact name ends in `-unsigned`.
- Cross-arch packaging: Bun installs only the host's `@parcel/watcher-<os>-<arch>`, so packaging
  x64 on arm64 needs `bun install --os=darwin --cpu='*'`; `after-pack.ts` keeps each app's own.

## Not done yet

There is no update UI ("restart to update"), Windows and Linux
releases, IME/spellcheck checks on Windows and Linux. Tracked in the Lydie issues (LYD-68 and
follow-ups).
