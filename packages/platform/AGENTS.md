# AGENTS.md - @lydie/platform

The interface between the React app and the shell it runs in (browser, Electron, later Capacitor):
workspace folder access and watching, dialogs, windows and title bar, menus, deep links, clipboard,
secure storage, updater, app info, and a typed channel to backend services in another process.
Shells (`apps/*`) implement it. Licence: AGPL-3.0-only.

## May depend on

Nothing internal. `client/scripts/check-boundaries.ts` is authoritative and runs in CI. No Node,
Electron or DOM-specific APIs: both the web app and the Electron preload import it. React is an
optional peer dependency, used only by the `./react` entry.

## Rules

- Types and tiny helpers only. Shell implementations live in the shells.
- UI code branches on `capabilities`, never on `capabilities.kind` alone.
- Workspace paths are relative POSIX strings. Run them through `normalizePath` before use.
- The `scope` of a window never changes. Switching folder or account opens another window
  (`windows.open({ scope, replace: true })`).
- Errors that cross a process boundary lose their class. Use `toPlatformError(error)` to get the
  `code` back, and `isPlatformError(error, code)` only on errors you created yourself.

## Public API

`@lydie/platform` (`src/index.ts`):

- `type Platform`: `capabilities`, `app`, `scope`, `files` (`WorkspaceFiles | null`), `folders`,
  `dialogs`, `windows`, `menus`, `deepLinks`, `clipboard`, `secrets`, `updater`,
  `services` (`ServiceChannel | null`), `openExternal(url)`, `setColorScheme?(scheme)` (desktop: native
  menus and dialogs follow the app's theme), `downloads?` (`Downloads | null`: `save({ url, filename,
  onProgress? })` → `DownloadResult` `saved` { name } | `started` | `cancelled`; a file from a
  hosted export or backup link, streamed to where the person picks; `DownloadProgress` { received,
  total: number | null }. Both shells have it (the browser's falls back to a plain link where it
  cannot write the file, `started`); without it the app hands the link to the browser). All member types are exported: `ColorScheme`,
  `Capabilities`, `AppInfo`, `WorkspaceScope` (`none` | `local` | `hosted`), `FolderRef`,
  `RecentFolder`, `WorkspaceFiles`, `FileStat`, `FileEntry`, `FileChange`, `WriteOptions`,
  `DeleteOptions`, `Folders`, `Dialogs`, `Windows`, `WindowState`, `TitleBar`, `Menus`, `MenuItem`,
  `MenuRole`, `DeepLinks`, `Clipboard`, `SecretStorage`, `Updater`, `UpdateState`, `Unsubscribe`.
- Paths: `normalizePath(path)` (throws `invalid-path` for `..`, absolute paths, drive letters,
  backslashes, NUL), `isPortableName(name)`, `joinPath`, `parentPath`, `baseName`, `isWithin`.
- Errors: `PlatformError` (`code: PlatformErrorCode`, `detail`), `toPlatformError`,
  `isPlatformError`.
- Services: `defineService<Contract>(name)`, `serviceClient(channel, service)` (typed `request` and
  `subscribe`), `type ServiceChannel` (the transport a shell provides), `ServiceContract`,
  `ServiceHandlers`, `createLocalServiceChannel()` (in-process channel for tests).
- `getInjectedPlatform()` and `INJECTED_PLATFORM_KEY` (`"lydiePlatform"`): the platform a native
  shell exposed on `globalThis` before the page loaded, or null in a plain browser.

`@lydie/platform/react` (`src/react.tsx`): `PlatformProvider({ platform, children })`,
`usePlatform()`.

`@lydie/platform/testing` (`src/testing.ts`): `createTestPlatform(options?)`, an in-memory
`Platform` with the same path rules, error codes and batched watcher as the desktop shell. Its
`test` member drives it from a test: `external.write/delete` (simulates another program),
`flush()`, `dialogAnswers`, `menuAction(id)`, `deepLink(url)`, `setWindowState`, `setUpdateState`,
and records of `openedExternal`, `openedWindows`, `applicationMenu`, `clipboard`, `secrets`.

## Implementing a shell

- A shell builds one `Platform` per window. The desktop shell builds it in its preload and exposes it
  under `INJECTED_PLATFORM_KEY`, so the web bundle picks it up with `getInjectedPlatform()`.
- `WorkspaceFiles` must reject paths that escape the folder, including through symlinks, and must
  report its own writes through `watch` (consumers dedupe by content).
- `services` is a request/response + subscription transport. The host validates every input.

## Tests

`bun test` here, or `bun --filter=@lydie/platform run test` from a root. No DOM preload: the React
test renders to a string.

## Shortcuts and windows with a route

- `capabilities.browserTab?`: the page is a browser tab. The web shell sets it; the app then
  leaves the browser's own shortcuts to the browser (`isBrowserShortcut` in `@lydie/plugin-api`).
- `Platform.trackpad?: Trackpad | null` (`capabilities.trackpad?`): `onScroll(listener)` reports
  each trackpad scroll as a `TrackpadScroll`: finger and momentum phases, wheel-style deltas,
  whether the system allows two-finger page swipes, time and pointer position.
  The desktop shell provides it on macOS (its trackpad addon); the app turns it into swipe
  navigation. `createTestPlatform` drives it with `test.trackpadScroll(event)`.

- `Platform.appLock?: AppLock | null` (LYD-383): `state()` → `AppLockState { enabled, locked,
  idleMinutes, touchId: { available, enabled }, retryAt, file }`, `onChange`, `setUp({ secret,
  idleMinutes, touchId })`, `update({ idleMinutes?, touchId? })` (unlocked only),
  `changeSecret({ current, secret })` and `remove(current)` (false when `current` is wrong), `lock()`,
  `unlock(secret)`, `unlockWithTouchId()`. Desktop only; the shell draws the lock screen.

- `Platform.screenCapture?: ScreenCapture | null` (privacy mode, LYD-382): `state()` →
  `{ blocked, supported }` and `setBlocked(blocked)`, which applies to every window of the app and to
  new ones. `supported` is false on Linux. The browser has none.

- `Platform.shortcuts?: GlobalShortcuts | null` (`capabilities.globalShortcuts?`). `register(accelerator, listener)`
  and `unregister` hold system-wide shortcuts for the calling window. `quickCapture()` and
  `setQuickCapture(accelerator | null)` manage the quick-capture shortcut. That one is owned by the shell
  and defaults to `DEFAULT_QUICK_CAPTURE`; pressing it sends the menu action `QUICK_CAPTURE_ACTION`
  ("quick-capture.open"). `isAccelerator` checks Electron syntax (at least one modifier). The browser has none.
- `windows.open({ scope, route })` always opens a new window, even for a scope that already has one. The
  new window reads the route as `windows.initialRoute` (a JSON object the app defines). The app
  does not use it at present ("Open in new window" was removed on 2026-11-13).
- `createTestPlatform` implements both: `test.globalShortcut(accelerator)`, `test.takenShortcuts` and
  the `initialRoute` option.
