import { basename, join, resolve } from "node:path";

import { createMcpControl } from "@lydie/mcp-local";
import { DEFAULT_QUICK_CAPTURE, QUICK_CAPTURE_ACTION } from "@lydie/platform";
import type { AppInfo, Capabilities, OperatingSystem, WorkspaceScope } from "@lydie/platform";
import { app, BrowserWindow, dialog, globalShortcut, Menu, shell } from "electron";

import { APP_SCHEME, DEEP_LINK_SCHEME, DIAGNOSTICS_HOST, WEB_HOST } from "../shared/bootstrap.ts";
import { createAppLock } from "./app-lock-system.ts";
import { registerDiagnosticsService } from "./diagnostics-service.ts";
import { DownloadTracker } from "./downloads.ts";
import { saveExportDialog } from "./export-dialog.ts";
import { registerHandlers } from "./handlers.ts";
import { HostedManager } from "./hosted.ts";
import { checkDownloadUrl, createOriginPolicy } from "./ipc-validation.ts";
import { reportMeasurements } from "./measure.ts";
import { applyMenu, attachEditContextMenu, defaultMenu, setDockMenu } from "./menus.ts";
import { handleAppScheme, registerAppScheme } from "./protocol.ts";
import { SecretStore, secureStorageExpected } from "./secrets.ts";
import { hardenSessions } from "./security.ts";
import { ServiceRegistry } from "./services.ts";
import { ShortcutRegistry } from "./shortcuts.ts";
import { StateStore } from "./state-store.ts";
import { loadTrackpad } from "./trackpad.ts";
import { createUpdater } from "./updater.ts";
import { noFolder, registerVaultServices, VaultManager } from "./vaults.ts";
import { preloadPath, WindowManager } from "./windows.ts";
import type { WindowContext, WindowKind } from "./windows.ts";
import type { WorkspaceFs } from "./workspace-fs.ts";

// Bundled into one file, so this runs right after Electron loads the main script.
const mainStartedAt = Date.now();
const mainDir = import.meta.dirname;
const devWebUrl = app.isPackaged ? undefined : process.env.LYDIE_WEB_URL;
const devRendererUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const diagnosticsAllowed = !app.isPackaged;
// Test runs: no Dock icon and windows never take focus, so they do not interrupt whoever is
// working on the machine. Playwright drives the pages over CDP, which needs no OS focus.
const background = !app.isPackaged && !!process.env.LYDIE_BACKGROUND;
if (background && process.platform === "darwin") app.setActivationPolicy("accessory");

// Tests and the dev script point userData elsewhere so they never touch a real profile.
if (process.env.LYDIE_USER_DATA) app.setPath("userData", resolve(process.env.LYDIE_USER_DATA));
else if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "Lydie Dev"));

registerAppScheme();

// `restoring`: the folder is the last workspace, not one the user asked for; if it cannot be opened,
// the start screen shows instead of an error.
type LaunchRequest = {
  folder?: string;
  deepLink?: string;
  diagnostics: boolean;
  restoring?: boolean;
};

function parseArgs(argv: readonly string[]): LaunchRequest {
  const request: LaunchRequest = { diagnostics: !!process.env.LYDIE_DIAGNOSTICS };
  for (const arg of argv) {
    if (arg.startsWith("--open-folder=")) request.folder = arg.slice("--open-folder=".length);
    else if (arg === "--diagnostics") request.diagnostics = true;
    else if (arg.startsWith(`${DEEP_LINK_SCHEME}://`)) request.deepLink = arg;
  }
  request.diagnostics &&= diagnosticsAllowed;
  return request;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

async function start() {
  const pendingLinks: string[] = [];
  let windows: WindowManager | null = null;

  // Set once the account service exists: takes provider sign-in returns before window routing.
  let takeSignInLink: ((url: string) => boolean) | null = null;
  const deliverLink = (url: string) => {
    if (takeSignInLink?.(url)) return;
    const target = windows?.focused() ?? windows?.all()[0];
    if (target) {
      windows?.send(target, "deep-links:open", url);
      target.win.focus();
    } else {
      pendingLinks.push(url);
    }
  };
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliverLink(url);
  });
  // macOS "Open With" on a folder (and folders dropped on the Dock icon).
  const pendingFolders: string[] = [];
  let openFolder: ((folder: string) => void) | null = null;
  app.on("open-file", (event, path) => {
    event.preventDefault();
    if (openFolder) openFolder(path);
    else pendingFolders.push(path);
  });
  if (app.isPackaged) app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  await app.whenReady();
  // Unpackaged runs are Electron.app, whose Dock icon is Electron's: show Lydie's instead.
  if (!app.isPackaged && !background) app.dock?.setIcon(join(mainDir, "../../build/icon.png"));

  const os: OperatingSystem =
    process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
        ? "windows"
        : process.platform === "linux"
          ? "linux"
          : "other";
  const appInfo: AppInfo = {
    name: app.getName(),
    version: app.getVersion(),
    os,
    arch: process.arch,
    locale: app.getLocale(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    packaged: app.isPackaged,
  };

  // Unpackaged, LYDIE_WEB_DIST serves another web build (the e2e tests' apps/web/.e2e/desktop).
  const webRoot = app.isPackaged
    ? join(process.resourcesPath, "web")
    : resolve(process.env.LYDIE_WEB_DIST ?? resolve(mainDir, "../../../web/dist"));
  const rendererRoot = resolve(mainDir, "../renderer");
  const roots: Record<string, string> = { [WEB_HOST]: webRoot };
  if (diagnosticsAllowed) roots[DIAGNOSTICS_HOST] = rendererRoot;
  handleAppScheme(roots);

  const devOrigins = [devWebUrl, devRendererUrl].filter((url): url is string => !!url);
  const policy = createOriginPolicy([
    ...Object.keys(roots).map((host) => `${APP_SCHEME}://${host}`),
    ...devOrigins,
  ]);
  // Packaged builds use the hosted service; development runs use the local core.
  const apiUrl =
    process.env.LYDIE_API_URL ??
    (app.isPackaged ? "https://api.lydie.co" : "http://localhost:4100");
  // Hosted exports and backups the windows save (`downloads:save`); every other download is blocked.
  const downloads = new DownloadTracker((url) => {
    try {
      checkDownloadUrl(url, apiUrl);
      return true;
    } catch {
      return false;
    }
  });
  hardenSessions(
    policy,
    devOrigins.map((url) => new URL(url).origin),
    (item, contentsId) => downloads.claim(item, contentsId),
  );

  const store = new StateStore(join(app.getPath("userData"), "state.json"));
  const secrets = new SecretStore(join(app.getPath("userData"), "secrets.json"));
  const services = new ServiceRegistry();
  // Hosted workspaces: the session (token in the keychain) and their synced databases.
  const hosted = new HostedManager({
    dataDir: app.getPath("userData"),
    apiUrl,
    secrets,
    packaged: app.isPackaged,
    openExternal: (url) => shell.openExternal(url),
    // Only a packaged app has the lydie:// scheme registered, so only it can receive the return.
    signInReturn: app.isPackaged ? `${DEEP_LINK_SCHEME}://auth/callback` : null,
  });
  takeSignInLink = (url) => hosted.takeSignInLink(url);
  registerDiagnosticsService(services);
  // Local-folder windows share one vault per folder; its database lives in userData.
  // The local MCP server of a vault is off until the user turns it on (vault service mcpSetEnabled).
  const vaults = new VaultManager({
    dataDir: app.getPath("userData"),
    mcp: (vault) => createMcpControl(vault, { dataDir: app.getPath("userData") }),
    exports: (folder) => saveExportDialog(basename(folder)),
  });

  const updater = createUpdater((state) => windows?.broadcast("updater:state", state));
  const appLock = createAppLock(join(app.getPath("userData"), "app-lock.json"), (state) =>
    windows?.broadcast("app-lock:state", state),
  );

  const trackpad = loadTrackpad(mainDir);
  const capabilities: Capabilities = {
    kind: "desktop",
    os,
    canOpenFolder: true,
    canWatchFolder: true,
    multipleWindows: true,
    nativeMenus: true,
    customTitleBar: os === "macos",
    secureStorage: secureStorageExpected(),
    updater: updater.state().status !== "disabled",
    deepLinks: app.isPackaged,
    services: true,
    globalShortcuts: true,
    ...(trackpad ? { trackpad: true } : {}),
  };

  const urlFor = (kind: WindowKind) => {
    if (kind === "diagnostics") {
      return devRendererUrl
        ? new URL("diagnostics.html", devRendererUrl).toString()
        : `${APP_SCHEME}://${DIAGNOSTICS_HOST}/diagnostics.html`;
    }
    return devWebUrl ?? `${APP_SCHEME}://${WEB_HOST}/`;
  };

  const grantedFolders = new Set(store.recentFolders().map((folder) => folder.id));

  const openWindow = async (scope: WorkspaceScope, kind: WindowKind, fs?: WorkspaceFs) => {
    try {
      return await windows!.open(scope, kind, fs ? { fs } : {});
    } catch (error) {
      console.error("[lydie] could not open window", error);
      dialog.showErrorBox("Could not open window", (error as Error).message);
      return null;
    }
  };
  const openLaunchRequest = async (request: LaunchRequest) => {
    const kind: WindowKind = request.diagnostics ? "diagnostics" : "app";
    let scope: WorkspaceScope = { kind: "none" };
    let fs: WorkspaceFs | undefined;
    if (request.folder) {
      try {
        const local = await windows!.localScope(resolve(request.folder));
        grantedFolders.add(local.fs.root);
        scope = local.scope;
        fs = local.fs;
      } catch (error) {
        if (request.restoring) console.warn("[lydie] could not reopen the last folder", error);
        else dialog.showErrorBox("Could not open folder", (error as Error).message);
      }
    }
    const context = await openWindow(scope, kind, fs);
    if (request.deepLink) deliverLink(request.deepLink);
    return context;
  };
  // A launch or Dock click without a folder reopens the last workspace.
  const withRestore = async (request: LaunchRequest): Promise<LaunchRequest> => {
    if (request.folder || request.diagnostics) return request;
    const folder = store.folderToRestore(await hosted.prefersSynced().catch(() => false));
    return folder ? { ...request, folder, restoring: true } : request;
  };
  const rememberWorkspace = (context: WindowContext) => {
    if (context.kind !== "app") return;
    if (context.scope.kind === "local") {
      store.setLastWorkspace({ kind: "folder", id: context.scope.folder.id });
    } else if (hosted.showsSynced(context.id)) {
      store.setLastWorkspace({ kind: "synced" });
    }
  };

  const menuActions = {
    newWindow: () => void openWindow({ kind: "none" }, "app"),
    openFolder: async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });
      const folder = result.filePaths[0];
      if (!result.canceled && folder) {
        await openLaunchRequest({ folder, diagnostics: false });
      }
    },
    openDiagnostics: diagnosticsAllowed
      ? () => void openWindow({ kind: "none" }, "diagnostics")
      : undefined,
  };
  const fallbackMenu = defaultMenu(menuActions);
  const onMenuAction = (context: WindowContext, id: string) => windows?.deliverAction(context, id);
  Menu.setApplicationMenu(Menu.buildFromTemplate(fallbackMenu));
  setDockMenu(menuActions.newWindow);

  windows = new WindowManager({
    store,
    preload: preloadPath(mainDir),
    urlFor,
    capabilities,
    appInfo,
    updateState: () => updater.state(),
    deepLinkScheme: capabilities.deepLinks ? DEEP_LINK_SCHEME : null,
    background,
    trackpad,
    onFocus: (context) => {
      applyMenu(context, fallbackMenu, onMenuAction);
      rememberWorkspace(context);
    },
    // Start indexing while the page loads.
    onOpened: (context) => {
      rememberWorkspace(context);
      if (context.scope.kind !== "local") return;
      vaults.acquire(context.scope.folder.id, context.id).catch((error: unknown) => {
        console.error("[lydie] could not open the folder's database", error);
      });
    },
    onClosed: (context) => {
      void vaults.release(context.id);
      void hosted.forget(context.id);
    },
  });
  registerVaultServices(
    services,
    async (caller) => {
      const context = windows?.all().find((c) => c.id === caller.windowId);
      if (!context || context.scope.kind !== "local") noFolder();
      // Served from the database while the folder is indexed; writes wait for the index.
      return vaults.acquireServing(context.scope.folder.id, context.id);
    },
    (caller) => hosted.backendFor(caller.windowId),
  );
  hosted.register(services, {
    platformScopeOf: (windowId) => windows?.all().find((c) => c.id === windowId)?.scope ?? null,
    // "Copy to cloud" from a folder window copies the folder's workspace (read only).
    handoffSourceFor: async (windowId) => {
      const context = windows?.all().find((c) => c.id === windowId);
      if (!context || context.scope.kind !== "local") return null;
      const host = await vaults.acquire(context.scope.folder.id, context.id);
      return {
        store: host.vault.store,
        workspaceId: host.vault.workspaceId,
        blob: host.vault.blob,
      };
    },
    openHostedWindow: async () => {
      await openWindow({ kind: "none" }, "app");
    },
    // A window learns it shows a synced workspace after it was focused, when its page loads.
    scopeChosen: (windowId) => {
      const context = windows?.lastFocused("app");
      if (context?.id === windowId) rememberWorkspace(context);
    },
  });

  // Quick capture from anywhere: bring up the last window (or reopen the last workspace) and send
  // it the action; a window still loading gets it once it listens.
  const quickCaptureWindow = async () => {
    const existing = windows?.lastFocused("app");
    if (existing) return existing;
    return openLaunchRequest(await withRestore({ diagnostics: false }));
  };
  const shortcuts = new ShortcutRegistry(globalShortcut, () => {
    void quickCaptureWindow().then((target) => {
      if (!target) return;
      if (target.win.isMinimized()) target.win.restore();
      target.win.show();
      if (process.platform === "darwin") app.focus({ steal: true });
      target.win.focus();
      windows?.deliverAction(target, QUICK_CAPTURE_ACTION);
    });
  });
  const quickCapture = store.quickCaptureShortcut();
  if (quickCapture !== null && !shortcuts.setQuickCapture(quickCapture ?? DEFAULT_QUICK_CAPTURE)) {
    console.warn(
      `[lydie] quick-capture shortcut ${quickCapture ?? DEFAULT_QUICK_CAPTURE} is taken`,
    );
  }

  registerHandlers({
    policy,
    windows,
    store,
    secrets,
    updater,
    services,
    grantedFolders,
    takeDeepLinks: () => pendingLinks.splice(0),
    shortcuts,
    defaultMenu: fallbackMenu,
    apiUrl,
    downloads,
    appLock,
  });
  updater.startAutomaticChecks();

  app.on("browser-window-created", (_event, win) => attachEditContextMenu(win));

  app.on("second-instance", (_event, argv) => {
    const request = parseArgs(argv);
    if (request.folder) void openLaunchRequest(request);
    else if (request.deepLink) deliverLink(request.deepLink);
    else (windows?.focused() ?? windows?.all()[0])?.win.focus();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void withRestore({ diagnostics: false }).then(openLaunchRequest);
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => void store.flush());
  // Close databases and watchers before exit; queued file writes finish first.
  let quitting: Promise<void> | null = null;
  // A terminate signal (logout, `kill`, a process manager) quits the same way as Cmd+Q, so the
  // databases are closed and queued file writes finish.
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => app.quit());
  app.on("will-quit", (event) => {
    shortcuts.dispose();
    if (quitting || (!vaults.busy() && !hosted.busy())) return;
    event.preventDefault();
    quitting = Promise.all([vaults.closeAll(), hosted.closeAll()])
      .then(() => console.info("[lydie] databases closed"))
      .finally(() => app.quit());
  });

  const launch = parseArgs(process.argv);
  if (!launch.folder && pendingFolders.length > 0) launch.folder = pendingFolders.shift();
  const first = await openLaunchRequest(await withRestore(launch));
  openFolder = (folder) => void openLaunchRequest({ folder, diagnostics: false });
  for (const folder of pendingFolders.splice(0)) openFolder(folder);
  if (process.env.LYDIE_MEASURE && first) {
    void reportMeasurements(first.win, mainStartedAt);
  }
}
