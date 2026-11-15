import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";

import type {
  AppInfo,
  Capabilities,
  MenuItem,
  TitleBar,
  UpdateState,
  WindowRoute,
  WindowState,
  WorkspaceScope,
} from "@lydie/platform";
import { app, BrowserWindow, nativeTheme, screen, shell } from "electron";

import { encodeBootstrap } from "../shared/bootstrap.ts";
import type { WindowBootstrap } from "../shared/bootstrap.ts";
import type { EventChannel, EventContract } from "../shared/ipc-contract.ts";
import type { StateStore, WindowBounds } from "./state-store.ts";
import { toTrackpadScroll } from "./trackpad.ts";
import type { TrackpadAddon } from "./trackpad.ts";
import { WorkspaceFs } from "./workspace-fs.ts";

// "app" windows load the web app; "diagnostics" windows load the dev-only diagnostic page.
export type WindowKind = "app" | "diagnostics";

export type WindowContext = {
  readonly id: string;
  readonly kind: WindowKind;
  readonly win: BrowserWindow;
  readonly scope: WorkspaceScope;
  readonly key: string;
  readonly fs: WorkspaceFs | null;
  menu: MenuItem[] | null;
  // Stops the folder watcher; set while one runs.
  stopWatching: (() => void) | null;
  // Per-document resources (service subscriptions, the watcher); released when the page
  // navigates or reloads, since the new document starts with no listeners.
  readonly documentCleanups: Set<() => void>;
  // Menu actions wait here until the page listens (`menu:take-pending`), so an action sent to a
  // window that is still loading (quick capture opening one) is not lost.
  pendingActions: string[];
  listening: boolean;
};

export type OpenOptions = {
  // Always a new window, showing this first (see `windows.initialRoute`).
  route?: WindowRoute;
};

const MAX_PENDING_ACTIONS = 20;
// New windows for a scope that already has one are offset so they do not hide it.
const CASCADE = 24;

export type WindowEnvironment = {
  store: StateStore;
  preload: string;
  urlFor(kind: WindowKind): string;
  capabilities: Capabilities;
  appInfo: AppInfo;
  updateState(): UpdateState;
  deepLinkScheme: string | null;
  // Windows appear without taking focus and keep rendering while covered (LYDIE_BACKGROUND, e2e).
  background?: boolean;
  onFocus(context: WindowContext): void;
  // Trackpad scroll phases for two-finger swipes (macOS, when the addon loaded).
  trackpad?: TrackpadAddon | null;
  // A window was created (before its page loads) / closed.
  onOpened?(context: WindowContext): void;
  onClosed?(context: WindowContext): void;
};

const isMac = process.platform === "darwin";
const DEFAULT_SIZE = { width: 1200, height: 800 };
const TRAFFIC_LIGHTS = { x: 16, y: 14 };

function scopeKey(scope: WorkspaceScope): string {
  switch (scope.kind) {
    case "none":
      return "none";
    case "local":
      return `local:${scope.folder.id}`;
    case "hosted":
      return `hosted:${scope.serverUrl}#${scope.accountId}`;
  }
}

function titleBar(win: BrowserWindow | null): TitleBar {
  if (!isMac) return { style: "native", height: 0, insetLeft: 0, insetRight: 0 };
  const fullscreen = win?.isFullScreen() ?? false;
  // Three 12 px buttons with 8 px gaps after the 16 px offset, plus breathing room.
  return { style: "hidden-inset", height: 40, insetLeft: fullscreen ? 0 : 80, insetRight: 0 };
}

function windowState(win: BrowserWindow | null): WindowState {
  return {
    focused: win?.isFocused() ?? true,
    maximized: win?.isMaximized() ?? false,
    fullscreen: win?.isFullScreen() ?? false,
    titleBar: titleBar(win),
  };
}

// Saved bounds are reused only if they still overlap a connected display.
function visibleBounds(saved: WindowBounds | undefined): Partial<WindowBounds> {
  if (!saved) return DEFAULT_SIZE;
  const area = screen.getDisplayMatching(saved).workArea;
  const overlaps =
    saved.x < area.x + area.width - 50 &&
    saved.x + saved.width > area.x + 50 &&
    saved.y < area.y + area.height - 50 &&
    saved.y + saved.height > area.y;
  return overlaps ? saved : { width: saved.width, height: saved.height };
}

export class WindowManager {
  private readonly byContents = new Map<number, WindowContext>();
  private lastFocusedId: string | null = null;

  constructor(private readonly env: WindowEnvironment) {}

  all(): WindowContext[] {
    return [...this.byContents.values()];
  }

  // Privacy mode for every open window; new ones read it from the store.
  setContentProtection(blocked: boolean) {
    for (const context of this.all()) {
      if (!context.win.isDestroyed()) context.win.setContentProtection(blocked);
    }
  }

  fromContents(id: number): WindowContext | undefined {
    return this.byContents.get(id);
  }

  focused(): WindowContext | undefined {
    const win = BrowserWindow.getFocusedWindow();
    return win ? this.byContents.get(win.webContents.id) : undefined;
  }

  send<C extends EventChannel>(context: WindowContext, channel: C, payload: EventContract[C]) {
    if (!context.win.isDestroyed()) context.win.webContents.send(channel, payload);
  }

  broadcast<C extends EventChannel>(channel: C, payload: EventContract[C]) {
    for (const context of this.byContents.values()) this.send(context, channel, payload);
  }

  // The app window focused last (also while the app is in the background), else the newest.
  lastFocused(kind: WindowKind = "app"): WindowContext | undefined {
    const windows = this.all().filter((c) => c.kind === kind && !c.win.isDestroyed());
    return windows.find((c) => c.id === this.lastFocusedId) ?? windows.at(-1);
  }

  // Sends a menu action now if the page listens, else when it starts to.
  deliverAction(context: WindowContext, id: string) {
    if (context.listening) {
      this.send(context, "menu:action", id);
    } else if (context.pendingActions.length < MAX_PENDING_ACTIONS) {
      context.pendingActions.push(id);
    }
  }

  // The page attached its first menu-action listener.
  takeActions(context: WindowContext): string[] {
    context.listening = true;
    return context.pendingActions.splice(0);
  }

  // Resolves a folder to a local scope, or throws if it cannot be opened.
  async localScope(folder: string): Promise<{ scope: WorkspaceScope; fs: WorkspaceFs }> {
    const fs = await WorkspaceFs.open(folder, { trash: (path) => shell.trashItem(path) });
    const ref = { id: fs.root, name: basename(fs.root), path: fs.root };
    return { scope: { kind: "local", folder: ref }, fs };
  }

  // Opens a window bound to `scope`, or focuses the one already bound to it.
  async open(
    scope: WorkspaceScope,
    kind: WindowKind,
    options: OpenOptions = {},
  ): Promise<WindowContext> {
    let fs: WorkspaceFs | null = null;
    if (scope.kind === "local") {
      const local = await this.localScope(scope.folder.id);
      fs = local.fs;
      scope = local.scope;
    }
    const key = scopeKey(scope);
    const siblings = this.all().filter((c) => c.key === key && c.kind === kind);
    if (scope.kind !== "none" && !options.route) {
      const existing = siblings[0];
      if (existing) {
        if (existing.win.isMinimized()) existing.win.restore();
        if (!this.env.background) existing.win.focus();
        return existing;
      }
    }
    if (scope.kind === "local") this.env.store.addRecent(scope.folder);
    if (scope.kind === "local") app.addRecentDocument(scope.folder.id);

    const id = randomUUID();
    let saved = this.env.store.bounds(key);
    const last = siblings.at(-1);
    if (last && !last.win.isDestroyed()) {
      const b = last.win.getNormalBounds();
      saved = { ...b, x: b.x + CASCADE, y: b.y + CASCADE, maximized: false };
    }
    const bootstrap: WindowBootstrap = {
      windowId: id,
      scope: Object.freeze(scope),
      capabilities: this.env.capabilities,
      app: this.env.appInfo,
      window: windowState(null),
      update: this.env.updateState(),
      deepLinkScheme: this.env.deepLinkScheme,
      route: options.route ?? null,
    };
    const win = new BrowserWindow({
      ...visibleBounds(saved),
      minWidth: 480,
      minHeight: 360,
      show: false,
      // The app shell's gray-100 in each theme (packages/ui/src/styles/dark.css); the renderer applies
      // the saved theme before its first paint.
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0b0b" : "#faf9f6",
      title: scope.kind === "local" ? scope.folder.name : "Lydie",
      ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: TRAFFIC_LIGHTS } : {}),
      webPreferences: {
        preload: this.env.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        spellcheck: true,
        // Covered windows would otherwise count as hidden and stop animation frames.
        ...(this.env.background ? { backgroundThrottling: false } : {}),
        additionalArguments: [encodeBootstrap(bootstrap)],
      },
    });
    if (saved?.maximized) win.maximize();
    // Privacy mode, before the window is first shown. macOS and Windows; Linux ignores it.
    if (this.env.store.blockScreenCapture()) win.setContentProtection(true);

    const context: WindowContext = {
      id,
      kind,
      win,
      scope,
      key,
      fs,
      menu: null,
      stopWatching: null,
      documentCleanups: new Set(),
      pendingActions: [],
      listening: false,
    };
    const contentsId = win.webContents.id;
    this.byContents.set(contentsId, context);
    this.env.onOpened?.(context);

    const releaseDocument = () => {
      for (const cleanup of context.documentCleanups) cleanup();
      context.documentCleanups.clear();
      context.listening = false;
    };
    win.webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) releaseDocument();
    });
    win.webContents.on("render-process-gone", releaseDocument);

    const pushState = () => this.send(context, "window:state", windowState(win));
    for (const event of [
      "maximize",
      "unmaximize",
      "enter-full-screen",
      "leave-full-screen",
      "blur",
    ] as const) {
      win.on(event as "maximize", pushState);
    }
    // Two-finger swipes: every trackpad scroll goes to the page with its phases, which decides
    // (SwipeNavigation in @lydie/app).
    const trackpad = kind === "app" ? this.env.trackpad : null;
    if (trackpad) {
      const observer = trackpad.observe(win.getNativeWindowHandle(), (event) => {
        if (win.isDestroyed()) return;
        this.send(
          context,
          "trackpad:scroll",
          toTrackpadScroll(event, win.webContents.getZoomFactor()),
        );
      });
      win.on("closed", () => trackpad.unobserve(observer));
    }
    // Three-finger swipes, when "Swipe between pages" includes three fingers. "left" is back, as
    // in Safari.
    win.on("swipe", (_event, direction) => {
      if (kind !== "app") return;
      if (direction === "left") this.deliverAction(context, "core.back");
      else if (direction === "right") this.deliverAction(context, "core.forward");
    });
    win.on("focus", () => {
      this.lastFocusedId = id;
      pushState();
      this.env.onFocus(context);
    });

    const saveBounds = () => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      this.env.store.setBounds(key, { ...win.getNormalBounds(), maximized: win.isMaximized() });
    };
    win.on("resized", saveBounds);
    win.on("moved", saveBounds);
    win.on("maximize", saveBounds);
    win.on("unmaximize", saveBounds);
    win.on("close", saveBounds);
    win.on("closed", () => {
      releaseDocument();
      this.byContents.delete(contentsId);
      this.env.onClosed?.(context);
    });

    win.once("ready-to-show", () => (this.env.background ? win.showInactive() : win.show()));
    await win.loadURL(this.env.urlFor(kind));
    return context;
  }
}

export function preloadPath(mainDir: string) {
  return join(mainDir, "../preload/index.cjs");
}
