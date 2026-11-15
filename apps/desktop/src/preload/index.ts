import { INJECTED_PLATFORM_KEY, toPlatformError } from "@lydie/platform";
import type {
  AppLockState,
  DownloadProgress,
  FileChange,
  Platform,
  ServiceChannel,
  TrackpadScroll,
  Unsubscribe,
  UpdateState,
  WindowState,
  WorkspaceFiles,
} from "@lydie/platform";
// Runs sandboxed before every page of our windows. Builds the desktop `Platform` on top of the IPC
// contract and exposes it to the page as `window.lydiePlatform`, so the same web bundle runs in the
// browser and here. Only `import type` from the contract: zod stays out of this bundle.
import { contextBridge, ipcRenderer } from "electron";

import { decodeBootstrap } from "../shared/bootstrap.ts";
import type {
  EventChannel,
  EventContract,
  InvokeChannel,
  InvokeInput,
  InvokeOutput,
} from "../shared/ipc-contract.ts";

const bootstrap = decodeBootstrap(process.argv);

async function invoke<C extends InvokeChannel>(
  channel: C,
  ...[input]: InvokeInput<C> extends Record<string, never> ? [] : [InvokeInput<C>]
): Promise<InvokeOutput<C>> {
  try {
    return (await ipcRenderer.invoke(channel, input ?? {})) as InvokeOutput<C>;
  } catch (error) {
    throw toPlatformError(error);
  }
}

function on<C extends EventChannel>(channel: C, listener: (payload: EventContract[C]) => void) {
  const wrapped = (_event: unknown, payload: EventContract[C]) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => void ipcRenderer.off(channel, wrapped);
}

function listenerSet<T>() {
  const set = new Set<(value: T) => void>();
  return {
    set,
    add(listener: (value: T) => void, onFirst?: () => void, onLast?: () => void): Unsubscribe {
      set.add(listener);
      if (set.size === 1) onFirst?.();
      return () => {
        if (set.delete(listener) && set.size === 0) onLast?.();
      };
    },
    emit(value: T) {
      for (const listener of set) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    },
  };
}

// One main-process watcher per window, shared by every `watch()` listener.
const fileChanges = listenerSet<FileChange[]>();
on("workspace:changes", (changes) => fileChanges.emit(changes));

const files: WorkspaceFiles | null =
  bootstrap.scope.kind === "local"
    ? {
        folder: bootstrap.scope.folder,
        stat: (path) => invoke("fs:stat", { path }),
        list: (path = "", options) => invoke("fs:list", { path, recursive: options?.recursive }),
        readText: (path) => invoke("fs:read-text", { path }),
        readBytes: (path) => invoke("fs:read-bytes", { path }),
        writeText: (path, content, options) =>
          invoke("fs:write-text", { path, content, ...options }),
        writeBytes: (path, content, options) =>
          invoke("fs:write-bytes", { path, content, ...options }),
        mkdir: (path) => invoke("fs:mkdir", { path }),
        rename: (from, to, options) => invoke("fs:rename", { from, to, ...options }),
        delete: (path, options) => invoke("fs:delete", { path, ...options }),
        watch: (listener) =>
          fileChanges.add(
            listener,
            () => void invoke("fs:watch").catch((error: Error) => console.error(error)),
            () => void invoke("fs:unwatch").catch(() => {}),
          ),
      }
    : null;

let windowState: WindowState = bootstrap.window;
const windowChanges = listenerSet<WindowState>();
on("window:state", (state) => {
  windowState = state;
  windowChanges.emit(state);
});

const lockChanges = listenerSet<AppLockState>();
on("app-lock:state", (state) => lockChanges.emit(state));

let updateState: UpdateState = bootstrap.update;
const updateChanges = listenerSet<UpdateState>();
on("updater:state", (state) => {
  updateState = state;
  updateChanges.emit(state);
});

const menuActions = listenerSet<string>();
on("menu:action", (id) => menuActions.emit(id));

// Global shortcuts this window registered, by accelerator as registered.
const shortcutListeners = new Map<string, () => void>();
on("shortcuts:triggered", (accelerator) => shortcutListeners.get(accelerator)?.());

const deepLinks = listenerSet<string>();
on("deep-links:open", (url) => deepLinks.emit(url));

const trackpadScrolls = listenerSet<TrackpadScroll>();
on("trackpad:scroll", (event) => trackpadScrolls.emit(event));

let nextDownload = 0;
const downloadProgress = new Map<string, (progress: DownloadProgress) => void>();
on("downloads:progress", ({ id, ...progress }) => downloadProgress.get(id)?.(progress));

let nextSubscription = 0;
const serviceListeners = new Map<
  string,
  { listener: (event: unknown) => void; onError?: (error: Error) => void }
>();
on("services:event", (message) => {
  const entry = serviceListeners.get(message.id);
  if (!entry) return;
  if ("error" in message) entry.onError?.(toPlatformError(new Error(message.error)));
  else entry.listener(message.event);
});

const services: ServiceChannel = {
  request: (service, method, input) => invoke("services:request", { service, method, input }),
  subscribe(service, stream, params, listener, onError) {
    const id = `s${++nextSubscription}`;
    serviceListeners.set(id, { listener, onError });
    invoke("services:subscribe", { id, service, stream, params }).catch((error: Error) => {
      serviceListeners.delete(id);
      onError?.(error);
    });
    return () => {
      if (!serviceListeners.delete(id)) return;
      void invoke("services:unsubscribe", { id }).catch(() => {});
    };
  },
};

const platform: Platform = {
  capabilities: bootstrap.capabilities,
  app: bootstrap.app,
  scope: bootstrap.scope,
  files,
  folders: {
    pick: (options) => invoke("folders:pick", { title: options?.title }),
    recent: () => invoke("folders:recent"),
    forget: (id) => invoke("folders:forget", { id }),
  },
  dialogs: {
    message: (options) => invoke("dialogs:message", options),
    async confirm({ message, detail, confirmLabel }) {
      const response = await invoke("dialogs:message", {
        type: "question",
        message,
        detail,
        buttons: [confirmLabel ?? "OK", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });
      return response === 0;
    },
    openFiles: (options) => invoke("dialogs:open-files", options ?? {}),
    saveFile: (options) => invoke("dialogs:save-file", options),
  },
  windows: {
    id: bootstrap.windowId,
    state: () => windowState,
    onStateChange: (listener) => windowChanges.add(listener),
    setTitle: (title) => void invoke("window:set-title", { title }),
    minimize: () => void invoke("window:minimize"),
    toggleMaximize: () => void invoke("window:toggle-maximize"),
    toggleFullscreen: () => void invoke("window:toggle-fullscreen"),
    close: () => void invoke("window:close"),
    // The main process validates the route (a JSON object).
    open: (options) => invoke("window:open", options as InvokeInput<"window:open">),
    initialRoute: bootstrap.route ?? null,
  },
  menus: {
    setApplicationMenu: (items) => void invoke("menu:set-application", { items }),
    onAction(listener) {
      const off = menuActions.add(listener);
      if (menuActions.set.size === 1) {
        void invoke("menu:take-pending").then((ids) => ids.forEach((id) => listener(id)));
      }
      return off;
    },
    showContextMenu: (items, position) =>
      invoke("menu:popup", {
        items,
        position: position && { x: Math.round(position.x), y: Math.round(position.y) },
      }),
  },
  deepLinks: {
    scheme: bootstrap.deepLinkScheme,
    onOpen(listener) {
      const off = deepLinks.add(listener);
      if (deepLinks.set.size === 1) {
        void invoke("deep-links:take").then((urls) => urls.forEach((url) => listener(url)));
      }
      return off;
    },
  },
  clipboard: {
    readText: () => invoke("clipboard:read-text"),
    writeText: (text) => invoke("clipboard:write", { text }),
    write: (data) => invoke("clipboard:write", data),
  },
  secrets: {
    get: (key) => invoke("secrets:get", { key }),
    set: (key, value) => invoke("secrets:set", { key, value }),
    delete: (key) => invoke("secrets:delete", { key }),
  },
  updater: {
    state: () => updateState,
    onStateChange: (listener) => updateChanges.add(listener),
    check: () => invoke("updater:check"),
    download: () => invoke("updater:download"),
    restartToUpdate: () => void invoke("updater:restart"),
  },
  services,
  downloads: {
    async save({ url, filename, onProgress }) {
      const id = `d${++nextDownload}`;
      if (onProgress) downloadProgress.set(id, onProgress);
      try {
        return await invoke("downloads:save", { id, url, filename });
      } finally {
        downloadProgress.delete(id);
      }
    },
  },
  trackpad: bootstrap.capabilities.trackpad
    ? { onScroll: (listener) => trackpadScrolls.add(listener) }
    : null,
  shortcuts: {
    async register(accelerator, listener) {
      if (shortcutListeners.has(accelerator)) return false;
      const ok = await invoke("shortcuts:register", { accelerator });
      if (ok) shortcutListeners.set(accelerator, listener);
      return ok;
    },
    async unregister(accelerator) {
      shortcutListeners.delete(accelerator);
      await invoke("shortcuts:unregister", { accelerator });
    },
    quickCapture: () => invoke("shortcuts:quick-capture"),
    setQuickCapture: (accelerator) => invoke("shortcuts:set-quick-capture", { accelerator }),
  },
  appLock: {
    state: () => invoke("app-lock:state"),
    onChange: (listener) => lockChanges.add(listener),
    setUp: (input) => invoke("app-lock:set-up", input),
    update: (input) => invoke("app-lock:update", input),
    changeSecret: (input) => invoke("app-lock:change-secret", input),
    remove: (current) => invoke("app-lock:remove", { current }),
    lock: () => invoke("app-lock:lock"),
    unlock: (secret) => invoke("app-lock:unlock", { secret }),
    unlockWithTouchId: () => invoke("app-lock:unlock-touch-id"),
  },
  screenCapture: {
    state: () => invoke("privacy:screen-capture"),
    setBlocked: (blocked) => invoke("privacy:set-screen-capture", { blocked }),
  },
  openExternal: (url) => invoke("shell:open-external", { url }),
  setColorScheme: (scheme) => void invoke("app:set-color-scheme", { scheme }),
};

// contextBridge copies every value a function returns, so `windows.state()` and `updater.state()`
// would be a new object on each call. The Platform contract (and React's useSyncExternalStore,
// which loops forever otherwise) needs the same object until the state changes. So the bridged
// object is wrapped in the page's world, keeping those snapshots' identity while their value holds.
const BRIDGE_KEY = "__lydiePlatformBridge";
contextBridge.exposeInMainWorld(BRIDGE_KEY, platform);
contextBridge.executeInMainWorld({
  func: (bridgeKey: string, key: string) => {
    const g = globalThis as unknown as Record<string, unknown>;
    const raw = g[bridgeKey] as Platform;
    try {
      delete g[bridgeKey];
    } catch {
      // Not configurable in some Electron versions; harmless.
    }
    const stable = <T>(read: () => T): (() => T) => {
      let last: T | undefined;
      let json: string | undefined;
      return () => {
        const next = read();
        const text = JSON.stringify(next);
        if (text !== json) {
          json = text;
          last = next;
        }
        return last as T;
      };
    };
    const freeze = (value: unknown): unknown => {
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
      }
      return value;
    };
    const wrapped: Platform = {
      ...raw,
      windows: { ...raw.windows, state: stable(() => raw.windows.state()) },
      updater: { ...raw.updater, state: stable(() => raw.updater.state()) },
    };
    Object.defineProperty(g, key, { value: freeze(wrapped), enumerable: true });
  },
  args: [BRIDGE_KEY, INJECTED_PLATFORM_KEY],
});
