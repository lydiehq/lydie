import { PlatformError } from "./errors.ts";
import { baseName, isWithin, normalizePath, parentPath } from "./paths.ts";
import { createLocalServiceChannel } from "./services.ts";
import type { LocalServiceChannel } from "./services.ts";
import { DEFAULT_QUICK_CAPTURE, isAccelerator, QUICK_CAPTURE_ACTION } from "./shortcuts.ts";
import type {
  Capabilities,
  ColorScheme,
  FileChange,
  FileEntry,
  FileStat,
  FolderRef,
  MenuItem,
  OpenWindowOptions,
  Platform,
  RecentFolder,
  TrackpadScroll,
  Unsubscribe,
  UpdateState,
  WindowRoute,
  WindowState,
  WorkspaceFiles,
  WorkspaceScope,
  WriteOptions,
} from "./types.ts";

type Node =
  | { kind: "directory"; mtime: number }
  | { kind: "file"; mtime: number; data: Uint8Array };

export type TestPlatformOptions = {
  scope?: WorkspaceScope;
  // Initial files of the local folder, by workspace path. Implies a local scope.
  files?: Record<string, string | Uint8Array>;
  capabilities?: Partial<Capabilities>;
  // What `folders.pick()` resolves.
  pickFolder?: FolderRef | null;
  recent?: RecentFolder[];
  // `windows.initialRoute` of this window.
  initialRoute?: WindowRoute | null;
};

// Hooks for driving the fake from a test and inspecting what the app did.
export type TestPlatformControls = {
  // Changes the folder as another program would; the change reaches `files.watch` listeners.
  external: {
    write(path: string, content: string | Uint8Array): void;
    delete(path: string): void;
  };
  // Resolves pending watcher batches (they are delivered on a microtask).
  flush(): Promise<void>;
  // Answers for the next `dialogs.message` / `dialogs.confirm` calls, in order.
  dialogAnswers: (number | boolean)[];
  menuAction(id: string): void;
  // Presses a global shortcut: its listener runs, or the quick-capture action is sent.
  globalShortcut(accelerator: string): void;
  // Accelerators held through `shortcuts`, and ones the "system" holds (register resolves false).
  readonly globalShortcuts: ReadonlySet<string>;
  readonly takenShortcuts: Set<string>;
  contextMenuAnswer: string | null;
  deepLink(url: string): void;
  setWindowState(state: Partial<WindowState>): void;
  setUpdateState(state: UpdateState): void;
  // Sends a trackpad scroll event to `trackpad` listeners (with `capabilities.trackpad`).
  trackpadScroll(event: TrackpadScroll): void;
  readonly applicationMenu: MenuItem[];
  readonly openedExternal: string[];
  // Every `setColorScheme` call, in order.
  readonly colorSchemes: ColorScheme[];
  readonly openedWindows: OpenWindowOptions[];
  readonly clipboard: { text: string; html?: string };
  readonly secrets: Map<string, string>;
  readonly title: string;
};

export type TestPlatform = Omit<Platform, "services"> & {
  readonly services: LocalServiceChannel;
  readonly test: TestPlatformControls;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBytes(content: string | Uint8Array) {
  return typeof content === "string" ? encoder.encode(content) : content.slice();
}

function listeners<T>() {
  const set = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void): Unsubscribe {
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(value: T) {
      for (const listener of set) listener(value);
    },
    get size() {
      return set.size;
    },
  };
}

// An in-memory `Platform` for unit and component tests. Behaves like the desktop shell where it can
// (path validation, error codes, watcher batches) so code tested against it runs unchanged there.
export function createTestPlatform(options: TestPlatformOptions = {}): TestPlatform {
  const folder: FolderRef = { id: "/test/workspace", name: "workspace", path: "/test/workspace" };
  const scope: WorkspaceScope =
    options.scope ?? (options.files ? { kind: "local", folder } : { kind: "none" });

  let clock = 1_700_000_000_000;
  const now = () => (clock += 1);

  const nodes = new Map<string, Node>([["", { kind: "directory", mtime: now() }]]);
  const changes = listeners<FileChange[]>();
  let pending: FileChange[] = [];
  let scheduled: Promise<void> | null = null;

  function record(change: FileChange) {
    pending.push(change);
    scheduled ??= Promise.resolve().then(() => {
      const batch = pending;
      pending = [];
      scheduled = null;
      if (batch.length) changes.emit(batch);
    });
  }

  function stat(path: string, node: Node): FileStat {
    return {
      path,
      kind: node.kind,
      size: node.kind === "file" ? node.data.byteLength : 0,
      mtime: node.mtime,
    };
  }

  function ensureParents(path: string, create: boolean) {
    const parent = parentPath(path);
    const node = nodes.get(parent);
    if (node?.kind === "directory") return;
    if (node) throw new PlatformError("not-a-directory", `Not a directory: ${parent}`);
    if (!create) throw new PlatformError("not-found", `No such directory: ${parent}`);
    ensureParents(parent, true);
    nodes.set(parent, { kind: "directory", mtime: now() });
    record({ type: "create", path: parent });
  }

  function writeNode(path: string, data: Uint8Array, options: WriteOptions = {}) {
    if (path === "") throw new PlatformError("is-a-directory", "Cannot write the workspace root");
    const existing = nodes.get(path);
    if (existing?.kind === "directory") throw new PlatformError("is-a-directory", path);
    if (options.expectedMtime !== undefined && existing?.mtime !== options.expectedMtime) {
      throw new PlatformError("conflict", `${path} changed on disk`);
    }
    ensureParents(path, options.createParents ?? true);
    const node: Node = { kind: "file", mtime: now(), data };
    nodes.set(path, node);
    record({ type: existing ? "update" : "create", path });
    return stat(path, node);
  }

  function getFile(path: string) {
    const node = nodes.get(path);
    if (!node) throw new PlatformError("not-found", `No such file: ${path}`);
    if (node.kind !== "file") throw new PlatformError("is-a-directory", path);
    return node;
  }

  function descendants(dir: string) {
    return [...nodes.keys()].filter((path) => path !== dir && isWithin(dir, path));
  }

  function remove(path: string, recursive: boolean) {
    if (path === "") throw new PlatformError("invalid-path", "Cannot delete the workspace root");
    const node = nodes.get(path);
    if (!node) throw new PlatformError("not-found", `No such file: ${path}`);
    const children = node.kind === "directory" ? descendants(path) : [];
    if (children.length && !recursive) throw new PlatformError("not-empty", path);
    for (const child of children) nodes.delete(child);
    nodes.delete(path);
    for (const child of children) record({ type: "delete", path: child });
    record({ type: "delete", path });
  }

  for (const [path, content] of Object.entries(options.files ?? {})) {
    writeNode(normalizePath(path), toBytes(content));
  }
  pending = [];

  const files: WorkspaceFiles | null =
    scope.kind === "local"
      ? {
          folder: scope.folder,
          async stat(path) {
            const p = normalizePath(path);
            const node = nodes.get(p);
            return node ? stat(p, node) : null;
          },
          async list(dir = "", listOptions = {}) {
            const d = normalizePath(dir);
            const node = nodes.get(d);
            if (!node) throw new PlatformError("not-found", `No such directory: ${d}`);
            if (node.kind !== "directory") throw new PlatformError("not-a-directory", d);
            const out: FileEntry[] = [];
            for (const path of descendants(d)) {
              if (!listOptions.recursive && parentPath(path) !== d) continue;
              out.push({ ...stat(path, nodes.get(path) as Node), name: baseName(path) });
            }
            return out.sort((a, b) => a.path.localeCompare(b.path));
          },
          async readText(path) {
            return decoder.decode(getFile(normalizePath(path)).data);
          },
          async readBytes(path) {
            return getFile(normalizePath(path)).data.slice();
          },
          async writeText(path, content, writeOptions) {
            return writeNode(normalizePath(path), encoder.encode(content), writeOptions);
          },
          async writeBytes(path, content, writeOptions) {
            return writeNode(normalizePath(path), content.slice(), writeOptions);
          },
          async mkdir(path) {
            const p = normalizePath(path);
            const node = nodes.get(p);
            if (node?.kind === "directory") return;
            if (node) throw new PlatformError("exists", `A file exists at ${p}`);
            ensureParents(p, true);
            nodes.set(p, { kind: "directory", mtime: now() });
            record({ type: "create", path: p });
          },
          async rename(from, to, renameOptions = {}) {
            const a = normalizePath(from);
            const b = normalizePath(to);
            const node = nodes.get(a);
            if (!node || a === "") throw new PlatformError("not-found", `No such file: ${a}`);
            if (isWithin(a, b) && a !== b) {
              throw new PlatformError("invalid-argument", "Cannot move a folder into itself");
            }
            if (nodes.has(b) && !renameOptions.overwrite) throw new PlatformError("exists", b);
            ensureParents(b, false);
            const moved = [a, ...descendants(a)];
            for (const path of moved) {
              const target = b + path.slice(a.length);
              nodes.set(target, nodes.get(path) as Node);
              nodes.delete(path);
              record({ type: "delete", path });
              record({ type: "create", path: target });
            }
          },
          async delete(path, deleteOptions = {}) {
            remove(normalizePath(path), deleteOptions.recursive ?? false);
          },
          watch(listener) {
            return changes.add(listener);
          },
        }
      : null;

  const capabilities: Capabilities = {
    kind: "web",
    os: "other",
    canOpenFolder: true,
    canWatchFolder: true,
    multipleWindows: false,
    nativeMenus: false,
    customTitleBar: false,
    secureStorage: false,
    updater: false,
    deepLinks: false,
    services: true,
    ...options.capabilities,
  };

  let windowState: WindowState = {
    focused: true,
    maximized: false,
    fullscreen: false,
    titleBar: { style: "native", height: 0, insetLeft: 0, insetRight: 0 },
  };
  const windowChanges = listeners<WindowState>();
  let updateState: UpdateState = { status: "disabled", reason: "Test platform" };
  const updateChanges = listeners<UpdateState>();
  const menuActions = listeners<string>();
  const deepLinkListeners = listeners<string>();
  const trackpadListeners = listeners<TrackpadScroll>();
  const queuedLinks: string[] = [];
  const shortcutListeners = new Map<string, () => void>();
  const takenShortcuts = new Set<string>();
  let quickCapture: string | null = DEFAULT_QUICK_CAPTURE;
  const checkAccelerator = (accelerator: string) => {
    if (!isAccelerator(accelerator)) {
      throw new PlatformError("invalid-argument", `Not a shortcut: ${accelerator}`);
    }
  };
  let recent = [...(options.recent ?? [])];

  const control = {
    dialogAnswers: [] as (number | boolean)[],
    contextMenuAnswer: null as string | null,
    applicationMenu: [] as MenuItem[],
    openedExternal: [] as string[],
    colorSchemes: [] as ColorScheme[],
    openedWindows: [] as OpenWindowOptions[],
    clipboard: { text: "" } as { text: string; html?: string },
    secrets: new Map<string, string>(),
    title: "",
  };

  const test: TestPlatformControls = {
    external: {
      write(path, content) {
        writeNode(normalizePath(path), toBytes(content));
      },
      delete(path) {
        remove(normalizePath(path), true);
      },
    },
    async flush() {
      await scheduled;
    },
    get dialogAnswers() {
      return control.dialogAnswers;
    },
    set dialogAnswers(value) {
      control.dialogAnswers = value;
    },
    menuAction: (id) => menuActions.emit(id),
    globalShortcut(accelerator) {
      if (accelerator === quickCapture) menuActions.emit(QUICK_CAPTURE_ACTION);
      else shortcutListeners.get(accelerator)?.();
    },
    get globalShortcuts() {
      return new Set([...shortcutListeners.keys(), ...(quickCapture ? [quickCapture] : [])]);
    },
    takenShortcuts,
    get contextMenuAnswer() {
      return control.contextMenuAnswer;
    },
    set contextMenuAnswer(value) {
      control.contextMenuAnswer = value;
    },
    deepLink(url) {
      if (deepLinkListeners.size) deepLinkListeners.emit(url);
      else queuedLinks.push(url);
    },
    setWindowState(state) {
      windowState = { ...windowState, ...state };
      windowChanges.emit(windowState);
    },
    setUpdateState(state) {
      updateState = state;
      updateChanges.emit(state);
    },
    trackpadScroll: (event) => trackpadListeners.emit(event),
    get applicationMenu() {
      return control.applicationMenu;
    },
    get openedExternal() {
      return control.openedExternal;
    },
    get colorSchemes() {
      return control.colorSchemes;
    },
    get openedWindows() {
      return control.openedWindows;
    },
    get clipboard() {
      return control.clipboard;
    },
    get secrets() {
      return control.secrets;
    },
    get title() {
      return control.title;
    },
  };

  return {
    capabilities,
    app: {
      name: "Lydie",
      version: "0.0.0-test",
      os: capabilities.os,
      arch: "test",
      locale: "en-US",
      packaged: false,
    },
    scope: Object.freeze(scope),
    files,
    folders: {
      async pick() {
        return options.pickFolder ?? null;
      },
      async recent() {
        return recent;
      },
      async forget(id) {
        recent = recent.filter((entry) => entry.id !== id);
      },
    },
    dialogs: {
      async message(dialog) {
        const answer = control.dialogAnswers.shift();
        return typeof answer === "number" ? answer : (dialog.defaultId ?? 0);
      },
      async confirm() {
        const answer = control.dialogAnswers.shift();
        return typeof answer === "boolean" ? answer : answer === 0;
      },
      async openFiles() {
        return [];
      },
      async saveFile() {
        return false;
      },
    },
    windows: {
      id: "test-window",
      state: () => windowState,
      onStateChange: (listener) => windowChanges.add(listener),
      setTitle(title) {
        control.title = title;
      },
      minimize() {},
      toggleMaximize() {
        test.setWindowState({ maximized: !windowState.maximized });
      },
      toggleFullscreen() {
        test.setWindowState({ fullscreen: !windowState.fullscreen });
      },
      close() {},
      async open(openOptions) {
        control.openedWindows.push(openOptions);
      },
      initialRoute: options.initialRoute ?? null,
    },
    trackpad: capabilities.trackpad ? { onScroll: (l) => trackpadListeners.add(l) } : null,
    shortcuts: {
      async register(accelerator, listener) {
        checkAccelerator(accelerator);
        const held = shortcutListeners.has(accelerator) || accelerator === quickCapture;
        if (held || takenShortcuts.has(accelerator)) return false;
        shortcutListeners.set(accelerator, listener);
        return true;
      },
      async unregister(accelerator) {
        shortcutListeners.delete(accelerator);
      },
      async quickCapture() {
        return quickCapture;
      },
      async setQuickCapture(accelerator) {
        if (accelerator !== null) {
          checkAccelerator(accelerator);
          if (takenShortcuts.has(accelerator) || shortcutListeners.has(accelerator)) return false;
        }
        quickCapture = accelerator;
        return true;
      },
    },
    menus: {
      setApplicationMenu(items) {
        control.applicationMenu = items;
      },
      onAction: (listener) => menuActions.add(listener),
      async showContextMenu() {
        return control.contextMenuAnswer;
      },
    },
    deepLinks: {
      scheme: null,
      onOpen(listener) {
        const off = deepLinkListeners.add(listener);
        for (const url of queuedLinks.splice(0)) listener(url);
        return off;
      },
    },
    clipboard: {
      async readText() {
        return control.clipboard.text;
      },
      async writeText(text) {
        control.clipboard = { text };
      },
      async write(data) {
        control.clipboard = { ...data };
      },
    },
    secrets: {
      async get(key) {
        return control.secrets.get(key) ?? null;
      },
      async set(key, value) {
        control.secrets.set(key, value);
      },
      async delete(key) {
        control.secrets.delete(key);
      },
    },
    updater: {
      state: () => updateState,
      onStateChange: (listener) => updateChanges.add(listener),
      async check() {},
      async download() {},
      restartToUpdate() {},
    },
    services: createLocalServiceChannel(),
    async openExternal(url) {
      control.openedExternal.push(url);
    },
    setColorScheme(scheme) {
      control.colorSchemes.push(scheme);
    },
    test,
  };
}
