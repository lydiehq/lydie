import type { ServiceChannel } from "./services.ts";

export type Unsubscribe = () => void;

export type PlatformKind = "web" | "desktop";

export type OperatingSystem = "macos" | "windows" | "linux" | "other";

// What the shell can do. UI code branches on these flags, never on `kind` alone, so a new shell (or a
// browser without the File System Access API) only has to report what it supports.
export type Capabilities = {
  readonly kind: PlatformKind;
  readonly os: OperatingSystem;
  // A real folder on disk can be picked and opened (desktop, Chromium with FSA).
  readonly canOpenFolder: boolean;
  // Folder changes made by other programs are reported (natively or by polling).
  readonly canWatchFolder: boolean;
  // Several windows, each with its own scope.
  readonly multipleWindows: boolean;
  // The application menu and context menus are native.
  readonly nativeMenus: boolean;
  // The app draws its own title bar and must leave room for `TitleBar` insets.
  readonly customTitleBar: boolean;
  // `secrets` encrypts at rest with an OS-backed key.
  readonly secureStorage: boolean;
  readonly updater: boolean;
  readonly deepLinks: boolean;
  // `services` reaches backend services in another process or worker.
  readonly services: boolean;
  // `shortcuts` registers system-wide shortcuts (desktop). Absent means false.
  readonly globalShortcuts?: boolean;
  // The page runs in a browser tab: the browser's own shortcuts (Mod+T, Mod+L, Ctrl+Shift+I…)
  // stay the browser's. Absent means false.
  readonly browserTab?: boolean;
  // `trackpad` reports scroll gestures with their phases, so two-finger swipes can go back and
  // forward (macOS desktop). Absent means false.
  readonly trackpad?: boolean;
};

// A finger phase of a trackpad (or Magic Mouse) scroll gesture, as AppKit reports it.
export type ScrollPhase =
  | "none"
  | "mayBegin"
  | "began"
  | "changed"
  | "stationary"
  | "ended"
  | "cancelled";

// One trackpad scroll event with what wheel events lack: when fingers touch, rest and lift, and
// which events are momentum after the lift.
export type TrackpadScroll = {
  // Fingers on the trackpad; "none" during momentum.
  readonly phase: ScrollPhase;
  // Coasting after the fingers lift ("began", "changed", "ended"); "none" while they touch.
  readonly momentumPhase: ScrollPhase;
  // As a wheel event's deltaX/deltaY: CSS pixels the content would scroll, positive right/down.
  readonly deltaX: number;
  readonly deltaY: number;
  // The system allows swiping between pages with two fingers ("Swipe between pages" on macOS).
  readonly swipeEnabled: boolean;
  // The system's event time, in milliseconds.
  readonly timeStamp: number;
  // The pointer, in the page's CSS pixels.
  readonly x: number;
  readonly y: number;
};

export type Trackpad = {
  onScroll(listener: (event: TrackpadScroll) => void): Unsubscribe;
};

export type AppInfo = {
  readonly name: string;
  readonly version: string;
  readonly os: OperatingSystem;
  readonly arch: string;
  readonly locale: string;
  // Present on desktop only.
  readonly electron?: string;
  readonly chrome?: string;
  readonly packaged: boolean;
};

// A folder the user granted access to. `id` is opaque: an absolute path on desktop, a key into the
// stored directory handles on the web. `path` is for display and exists only where it is known.
export type FolderRef = {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
};

export type RecentFolder = FolderRef & { readonly openedAt: number };

// The workspace a window is bound to. Chosen when the window opens and never changed afterwards:
// switching folder or account opens a different window, so signing in or out can never silently swap
// the database under a running UI.
export type WorkspaceScope =
  | { readonly kind: "none" }
  | { readonly kind: "local"; readonly folder: FolderRef }
  | { readonly kind: "hosted"; readonly serverUrl: string; readonly accountId: string };

// Workspace paths are relative, POSIX-separated and never escape the folder (see `normalizePath`).
export type WorkspacePath = string;

export type FileKind = "file" | "directory";

export type FileStat = {
  readonly path: WorkspacePath;
  readonly kind: FileKind;
  readonly size: number;
  // Milliseconds since the epoch.
  readonly mtime: number;
};

export type FileEntry = FileStat & { readonly name: string };

export type ListOptions = {
  readonly recursive?: boolean;
};

export type WriteOptions = {
  // Create missing parent directories. Defaults to true.
  readonly createParents?: boolean;
  // Fail with `conflict` if the file's mtime differs, so an external edit is not overwritten blindly.
  readonly expectedMtime?: number;
};

export type DeleteOptions = {
  readonly recursive?: boolean;
  // Move to the OS trash where available instead of deleting.
  readonly toTrash?: boolean;
};

export type FileChangeType = "create" | "update" | "delete";

export type FileChange =
  | { readonly type: FileChangeType; readonly path: WorkspacePath }
  // The watcher lost events (overflow, sleep, permission change): rescan the folder.
  | { readonly type: "rescan" };

// Files of the window's local folder. Implementable over Node `fs` (desktop) and over File System
// Access directory handles (web), which is why it has no streams, no file descriptors and no
// absolute paths.
export type WorkspaceFiles = {
  readonly folder: FolderRef;
  stat(path: WorkspacePath): Promise<FileStat | null>;
  list(dir?: WorkspacePath, options?: ListOptions): Promise<FileEntry[]>;
  readText(path: WorkspacePath): Promise<string>;
  readBytes(path: WorkspacePath): Promise<Uint8Array>;
  writeText(path: WorkspacePath, content: string, options?: WriteOptions): Promise<FileStat>;
  writeBytes(path: WorkspacePath, content: Uint8Array, options?: WriteOptions): Promise<FileStat>;
  mkdir(path: WorkspacePath): Promise<void>;
  rename(from: WorkspacePath, to: WorkspacePath, options?: { overwrite?: boolean }): Promise<void>;
  delete(path: WorkspacePath, options?: DeleteOptions): Promise<void>;
  // Changes arrive in batches. Changes made through this object are reported too; callers dedupe by
  // content. Every listener shares one underlying watcher.
  watch(listener: (changes: FileChange[]) => void): Unsubscribe;
};

export type Folders = {
  // Shows the OS folder picker. Resolves null when cancelled.
  pick(options?: { title?: string }): Promise<FolderRef | null>;
  recent(): Promise<RecentFolder[]>;
  forget(id: string): Promise<void>;
};

export type FileFilter = { name: string; extensions: string[] };

export type PickedFile = { readonly name: string; readonly data: Uint8Array };

export type MessageDialogOptions = {
  type?: "none" | "info" | "warning" | "error" | "question";
  title?: string;
  message: string;
  detail?: string;
  // Defaults to ["OK"].
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
};

export type Dialogs = {
  // Resolves the index of the chosen button.
  message(options: MessageDialogOptions): Promise<number>;
  confirm(options: { message: string; detail?: string; confirmLabel?: string }): Promise<boolean>;
  // Files outside the workspace, for importing. Resolves [] when cancelled.
  openFiles(options?: {
    title?: string;
    multiple?: boolean;
    filters?: FileFilter[];
  }): Promise<PickedFile[]>;
  // Saves outside the workspace (export). On the web this is a download. Resolves false when cancelled.
  saveFile(options: {
    defaultName: string;
    content: string | Uint8Array;
    filters?: FileFilter[];
  }): Promise<boolean>;
};

// How much of a download has arrived. `total` is null when the server does not say (a zip made
// as it is sent).
export type DownloadProgress = { readonly received: number; readonly total: number | null };

export type DownloadOptions = {
  // A link of the hosted API (an export or a backup); shells may refuse any other.
  url: string;
  // The name the save dialog suggests.
  filename: string;
  onProgress?: (progress: DownloadProgress) => void;
};

// "saved": written where the person picked (`name` is the file name they gave it). "started":
// handed to the browser, whose downloads show the rest. "cancelled": they closed the dialog.
export type DownloadResult =
  | { readonly status: "saved"; readonly name: string }
  | { readonly status: "started" }
  | { readonly status: "cancelled" };

// Saves a file from a URL outside the workspace, streamed to disk rather than held in memory.
export type Downloads = {
  save(options: DownloadOptions): Promise<DownloadResult>;
};

export type TitleBar = {
  readonly style: "native" | "hidden-inset";
  // Height the app should give its own title bar area.
  readonly height: number;
  // Space reserved for OS window buttons (macOS traffic lights on the left). 0 in full screen.
  readonly insetLeft: number;
  readonly insetRight: number;
};

export type WindowState = {
  readonly focused: boolean;
  readonly maximized: boolean;
  readonly fullscreen: boolean;
  readonly titleBar: TitleBar;
};

export type OpenWindowOptions = {
  scope: WorkspaceScope;
  // Close the calling window once the new one is open (used to "switch" workspace).
  replace?: boolean;
  // What the new window shows first (the app's own route object, e.g. a tab route). With a
  // route a new window always opens, even when one is already bound to `scope`.
  route?: WindowRoute;
};

// A JSON object the app defines; the shell only carries it to the new window.
export type WindowRoute = { readonly [key: string]: unknown };

export type Windows = {
  readonly id: string;
  state(): WindowState;
  onStateChange(listener: (state: WindowState) => void): Unsubscribe;
  setTitle(title: string): void;
  minimize(): void;
  toggleMaximize(): void;
  toggleFullscreen(): void;
  close(): void;
  // Opens (or focuses, when one exists) a window bound to `scope`.
  open(options: OpenWindowOptions): Promise<void>;
  // The `route` this window was opened with, or null. Absent in shells without routes.
  readonly initialRoute?: WindowRoute | null;
};

// Built-in behaviours a menu item can have instead of an `id` the app handles.
export type MenuRole =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "pasteAndMatchStyle"
  | "selectAll"
  | "delete"
  | "minimize"
  | "close"
  | "quit"
  | "about"
  | "hide"
  | "hideOthers"
  | "unhide"
  | "front"
  | "zoom"
  | "togglefullscreen"
  | "toggleDevTools"
  | "reload"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "appMenu"
  | "fileMenu"
  | "editMenu"
  | "viewMenu"
  | "windowMenu";

export type MenuItem =
  | { type: "separator" }
  | {
      type?: "normal" | "checkbox";
      // Reported to `onAction` when chosen. Items with a role need none.
      id?: string;
      label?: string;
      role?: MenuRole;
      // Electron accelerator syntax, e.g. "CmdOrCtrl+Shift+P".
      accelerator?: string;
      enabled?: boolean;
      checked?: boolean;
      submenu?: MenuItem[];
    };

export type Menus = {
  // Replaces this window's application menu (shown while the window is focused on macOS).
  setApplicationMenu(items: MenuItem[]): void;
  // Fires with the `id` of an application menu item the user chose.
  onAction(listener: (id: string) => void): Unsubscribe;
  // Shows a context menu at the pointer (or `position`) and resolves the chosen `id`, or null.
  showContextMenu(items: MenuItem[], position?: { x: number; y: number }): Promise<string | null>;
};

// System-wide keyboard shortcuts that fire while the app is in the background. Accelerators use
// Electron's syntax ("CommandOrControl+Shift+Space").
export type GlobalShortcuts = {
  // Registers `accelerator` for this window until it closes or `unregister`. Resolves false when
  // the system, another app or another window holds it.
  register(accelerator: string, listener: () => void): Promise<boolean>;
  unregister(accelerator: string): Promise<void>;
  // The quick-capture shortcut (owned by the shell): it focuses a window, opening one if needed,
  // and sends it the menu action "quick-capture.open". null when turned off.
  quickCapture(): Promise<string | null>;
  // Resolves false, keeping the current one, when `accelerator` cannot be registered.
  setQuickCapture(accelerator: string | null): Promise<boolean>;
};

// Privacy mode: the system leaves the app's windows out of screenshots, screen recordings, screen
// sharing and window previews. `supported` is false where it cannot (Linux).
export type ScreenCaptureState = { readonly blocked: boolean; readonly supported: boolean };

export type ScreenCapture = {
  state(): Promise<ScreenCaptureState>;
  // Applies to every window of the app at once, and to new ones.
  setBlocked(blocked: boolean): Promise<void>;
};

// The app lock (desktop): a PIN or password (and Touch ID where the Mac has it) before any window
// shows notes. A lock on the app, not encryption.
export type AppLockState = {
  readonly enabled: boolean;
  readonly locked: boolean;
  // Locks after this many minutes without input on the computer; null: only when the app starts,
  // the screen locks, the computer sleeps, or on "Lock now".
  readonly idleMinutes: number | null;
  readonly touchId: { readonly available: boolean; readonly enabled: boolean };
  // After too many wrong tries, when the next one is allowed (ms since the epoch).
  readonly retryAt: number | null;
  // Where the lock is kept: deleting it while the app is closed removes a forgotten lock.
  readonly file: string;
};

export type AppLock = {
  state(): Promise<AppLockState>;
  onChange(listener: (state: AppLockState) => void): Unsubscribe;
  // A secret is a PIN or a password of at least 4 characters. Rejects with a reason otherwise.
  setUp(input: { secret: string; idleMinutes: number | null; touchId: boolean }): Promise<void>;
  // While unlocked.
  update(input: { idleMinutes?: number | null; touchId?: boolean }): Promise<void>;
  // Resolve false when `current` is wrong.
  changeSecret(input: { current: string; secret: string }): Promise<boolean>;
  remove(current: string): Promise<boolean>;
  lock(): Promise<void>;
  // Resolve false when the secret is wrong, a wait applies (`retryAt`) or Touch ID was cancelled.
  unlock(secret: string): Promise<boolean>;
  unlockWithTouchId(): Promise<boolean>;
};

export type DeepLinks = {
  // The URL scheme the app is registered for, e.g. "lydie".
  readonly scheme: string | null;
  // Links received before a listener was attached are replayed to the first listener.
  onOpen(listener: (url: string) => void): Unsubscribe;
};

export type Clipboard = {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  write(data: { text: string; html?: string }): Promise<void>;
};

// Small secrets such as auth tokens. Values are encrypted with an OS-backed key on desktop.
export type SecretStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type UpdateState =
  | { readonly status: "disabled"; readonly reason: string }
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "available"; readonly version: string }
  | { readonly status: "not-available" }
  | {
      readonly status: "downloading";
      readonly percent: number;
      readonly transferred: number;
      readonly total: number;
      readonly bytesPerSecond: number;
    }
  | { readonly status: "downloaded"; readonly version: string }
  | { readonly status: "error"; readonly message: string };

export type Updater = {
  state(): UpdateState;
  onStateChange(listener: (state: UpdateState) => void): Unsubscribe;
  check(): Promise<void>;
  download(): Promise<void>;
  // Quits and installs a downloaded update.
  restartToUpdate(): void;
};

// The object the React app talks to. One implementation per shell; tests use `createTestPlatform`.
export type Platform = {
  readonly capabilities: Capabilities;
  readonly app: AppInfo;
  // Fixed for the lifetime of the window.
  readonly scope: WorkspaceScope;
  // The window's local folder; null unless `scope.kind === "local"`.
  readonly files: WorkspaceFiles | null;
  readonly folders: Folders;
  readonly dialogs: Dialogs;
  readonly windows: Windows;
  readonly menus: Menus;
  readonly deepLinks: DeepLinks;
  readonly clipboard: Clipboard;
  readonly secrets: SecretStorage;
  readonly updater: Updater;
  // Backend services hosted outside the UI thread (desktop main process, a web worker); null when
  // the shell hosts none.
  readonly services: ServiceChannel | null;
  // Absent (or null) where the shell has none, such as the browser.
  readonly shortcuts?: GlobalShortcuts | null;
  // The app lock (desktop); absent or null elsewhere.
  readonly appLock?: AppLock | null;
  // Privacy mode (desktop); absent or null where the shell cannot keep windows out of captures.
  readonly screenCapture?: ScreenCapture | null;
  // Trackpad gestures with their phases (`capabilities.trackpad`); absent or null elsewhere.
  readonly trackpad?: Trackpad | null;
  // Absent (or null) where the shell has none: the app then hands the link to the browser.
  readonly downloads?: Downloads | null;
  // Opens an http(s) or mailto URL in the system browser or mail client.
  openExternal(url: string): Promise<void>;
  // The app's colour scheme, for native UI the page cannot style (context and app menus, dialogs).
  // Absent where the shell has no native UI of its own, such as the browser.
  setColorScheme?(scheme: ColorScheme): void;
};

export type ColorScheme = "light" | "dark" | "system";
