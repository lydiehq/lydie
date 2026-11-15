import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { PlatformError, toPlatformError } from "@lydie/platform";
import type { FolderRef } from "@lydie/platform";
import { app, clipboard, ClipboardItem, dialog, ipcMain, nativeTheme, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";

import type { InvokeChannel, InvokeOutput } from "../shared/ipc-contract.ts";
import type { AppLock } from "./app-lock.ts";
import { downloadName } from "./downloads.ts";
import type { DownloadTracker } from "./downloads.ts";
import { checkDownloadUrl, checkExternalUrl, checkSender, parseInput } from "./ipc-validation.ts";
import type { OriginPolicy, ParsedInput } from "./ipc-validation.ts";
import { applyMenu, popupMenu } from "./menus.ts";
import type { SecretStore } from "./secrets.ts";
import type { ServiceRegistry } from "./services.ts";
import type { ShortcutRegistry } from "./shortcuts.ts";
import type { StateStore } from "./state-store.ts";
import type { UpdaterController } from "./updater.ts";
import { watchFolder } from "./watcher.ts";
import type { WindowContext, WindowManager } from "./windows.ts";

export type HandlerDeps = {
  policy: OriginPolicy;
  windows: WindowManager;
  store: StateStore;
  secrets: SecretStore;
  updater: UpdaterController;
  services: ServiceRegistry;
  // Folders the user chose (picker, recent list, command line). A page can only open a window on
  // one of these, so a compromised page cannot bind itself to an arbitrary directory.
  grantedFolders: Set<string>;
  takeDeepLinks(): string[];
  shortcuts: ShortcutRegistry;
  defaultMenu: MenuItemConstructorOptions[];
  // The hosted API, the only origin `downloads:save` fetches from.
  apiUrl: string;
  downloads: DownloadTracker;
  appLock: AppLock;
};

const MAX_PICKED_BYTES = 200 * 1024 * 1024;

export function registerHandlers(deps: HandlerDeps) {
  const { windows, policy } = deps;

  function handle<C extends InvokeChannel>(
    channel: C,
    handler: (
      input: ParsedInput<C>,
      context: WindowContext,
    ) => Promise<InvokeOutput<C>> | InvokeOutput<C>,
  ) {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      try {
        const context = windows.fromContents(event.sender.id);
        const frame = event.senderFrame;
        checkSender(
          {
            frameUrl: frame?.url ?? null,
            isMainFrame: !!frame && frame.parent === null,
            knownWindow: !!context,
          },
          policy,
        );
        return await handler(parseInput(channel, raw), context as WindowContext);
      } catch (error) {
        // Only the message crosses IPC; PlatformError carries its code in it.
        throw toPlatformError(error);
      }
    });
  }

  const files = (context: WindowContext) => {
    if (!context.fs) throw new PlatformError("no-workspace", "This window has no local folder");
    return context.fs;
  };

  handle("folders:pick", async ({ title }, context) => {
    const result = await dialog.showOpenDialog(context.win, {
      title,
      properties: ["openDirectory", "createDirectory"],
    });
    const chosen = result.filePaths[0];
    if (result.canceled || !chosen) return null;
    const real = await realpath(chosen);
    deps.grantedFolders.add(real);
    return { id: real, name: basename(real), path: real } satisfies FolderRef;
  });
  handle("folders:recent", () => deps.store.recentFolders());
  handle("folders:forget", ({ id }) => {
    deps.store.forgetRecent(id);
    deps.grantedFolders.delete(id);
  });

  handle("fs:stat", ({ path }, c) => files(c).stat(path));
  handle("fs:list", ({ path, recursive }, c) => files(c).list(path, recursive));
  handle("fs:read-text", ({ path }, c) => files(c).readText(path));
  handle("fs:read-bytes", ({ path }, c) => files(c).readBytes(path));
  handle("fs:write-text", ({ path, content, ...options }, c) =>
    files(c).write(path, content, options),
  );
  handle("fs:write-bytes", ({ path, content, ...options }, c) =>
    files(c).write(path, content, options),
  );
  handle("fs:mkdir", ({ path }, c) => files(c).mkdir(path));
  handle("fs:rename", ({ from, to, overwrite }, c) => files(c).rename(from, to, overwrite));
  handle("fs:delete", ({ path, ...options }, c) => files(c).delete(path, options));
  handle("fs:watch", async (_input, context) => {
    const fs = files(context);
    if (context.stopWatching) return;
    const watch = watchFolder(fs, (changes) => windows.send(context, "workspace:changes", changes));
    const stop = () => {
      if (context.stopWatching !== stop) return;
      context.stopWatching = null;
      context.documentCleanups.delete(stop);
      void watch.then((handle) => handle.close()).catch(() => {});
    };
    context.stopWatching = stop;
    context.documentCleanups.add(stop);
    try {
      await watch;
    } catch (error) {
      stop();
      throw error;
    }
  });
  handle("fs:unwatch", (_input, context) => context.stopWatching?.());

  handle("dialogs:message", async (options, context) => {
    const result = await dialog.showMessageBox(context.win, {
      ...options,
      buttons: options.buttons ?? ["OK"],
    });
    return result.response;
  });
  handle("dialogs:open-files", async ({ title, multiple, filters }, context) => {
    const result = await dialog.showOpenDialog(context.win, {
      title,
      filters,
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    });
    if (result.canceled) return [];
    let total = 0;
    const picked = [];
    for (const path of result.filePaths) {
      total += (await stat(path)).size;
      if (total > MAX_PICKED_BYTES) throw new PlatformError("invalid-argument", "Files too large");
      picked.push({ name: basename(path), data: new Uint8Array(await readFile(path)) });
    }
    return picked;
  });
  handle("dialogs:save-file", async ({ defaultName, content, filters }, context) => {
    const result = await dialog.showSaveDialog(context.win, { defaultPath: defaultName, filters });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, content);
    return true;
  });

  handle("downloads:save", async ({ id, url, filename }, context) => {
    const link = checkDownloadUrl(url, deps.apiUrl).href;
    const picked = await dialog.showSaveDialog(context.win, {
      defaultPath: join(app.getPath("downloads"), downloadName(filename)),
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (picked.canceled || !picked.filePath) return { status: "cancelled" } as const;
    const contents = context.win.webContents;
    return deps.downloads.expect(
      {
        contentsId: contents.id,
        url: link,
        path: picked.filePath,
        onProgress: (progress) => windows.send(context, "downloads:progress", { id, ...progress }),
      },
      () => contents.downloadURL(link),
    );
  });

  handle("window:minimize", (_input, c) => c.win.minimize());
  handle("window:toggle-maximize", (_input, c) =>
    c.win.isMaximized() ? c.win.unmaximize() : c.win.maximize(),
  );
  handle("window:toggle-fullscreen", (_input, c) => c.win.setFullScreen(!c.win.isFullScreen()));
  handle("window:close", (_input, c) => c.win.close());
  handle("window:set-title", ({ title }, c) => c.win.setTitle(title));
  handle("window:open", async ({ scope, replace, route }, context) => {
    if (scope.kind === "local") {
      const real = await realpath(scope.folder.id).catch(() => null);
      if (!real) throw new PlatformError("not-found", "The folder was moved or deleted");
      if (!deps.grantedFolders.has(real)) {
        throw new PlatformError("permission-denied", "Pick the folder before opening it");
      }
    }
    const opened = await windows.open(scope, context.kind, route ? { route } : {});
    if (replace && opened !== context) context.win.close();
  });

  const onMenuAction = (context: WindowContext, id: string) => windows.deliverAction(context, id);
  handle("menu:set-application", ({ items }, context) => {
    context.menu = items;
    if (process.platform !== "darwin" || windows.focused() === context) {
      applyMenu(context, deps.defaultMenu, onMenuAction);
    }
  });
  handle("menu:popup", ({ items, position }, context) => popupMenu(context.win, items, position));

  handle("shell:open-external", ({ url }) => shell.openExternal(checkExternalUrl(url).toString()));
  // App-wide: native menus and dialogs, and new windows' background, follow the app's theme.
  handle("app:set-color-scheme", ({ scheme }) => {
    nativeTheme.themeSource = scheme;
  });
  handle("clipboard:read-text", () => clipboard.readText());
  handle("clipboard:write", ({ text, html }) =>
    clipboard.write([
      new ClipboardItem(html ? { "text/plain": text, "text/html": html } : { "text/plain": text }),
    ]),
  );

  handle("secrets:get", ({ key }) => deps.secrets.get(key));
  handle("secrets:set", ({ key, value }) => deps.secrets.set(key, value));
  handle("secrets:delete", ({ key }) => deps.secrets.delete(key));

  handle("updater:check", () => deps.updater.check());
  handle("updater:download", () => deps.updater.download());
  handle("updater:restart", () => deps.updater.restart());

  handle("deep-links:take", () => deps.takeDeepLinks());
  handle("menu:take-pending", (_input, context) => windows.takeActions(context));

  handle("shortcuts:register", ({ accelerator }, context) => {
    const ok = deps.shortcuts.register(context.id, accelerator, () =>
      windows.send(context, "shortcuts:triggered", accelerator),
    );
    // A reloaded page has no listener: its shortcuts go with the old document.
    if (ok) context.documentCleanups.add(() => deps.shortcuts.unregister(context.id, accelerator));
    return ok;
  });
  handle("shortcuts:unregister", ({ accelerator }, context) =>
    deps.shortcuts.unregister(context.id, accelerator),
  );
  const lock = deps.appLock;
  handle("app-lock:state", () => lock.state());
  handle("app-lock:set-up", (input) => lock.setUp(input));
  handle("app-lock:update", (input) => lock.update(input));
  handle("app-lock:change-secret", (input) => lock.changeSecret(input));
  handle("app-lock:remove", ({ current }) => lock.remove(current));
  handle("app-lock:lock", () => lock.lock());
  handle("app-lock:unlock", ({ secret }) => lock.unlock(secret));
  handle("app-lock:unlock-touch-id", () => lock.unlockWithTouchId());
  handle("privacy:screen-capture", () => ({
    blocked: deps.store.blockScreenCapture(),
    // Electron's content protection does nothing on Linux.
    supported: process.platform === "darwin" || process.platform === "win32",
  }));
  handle("privacy:set-screen-capture", ({ blocked }) => {
    deps.store.setBlockScreenCapture(blocked);
    windows.setContentProtection(blocked);
  });
  handle("shortcuts:quick-capture", () => deps.shortcuts.quickCapture());
  handle("shortcuts:set-quick-capture", ({ accelerator }) => {
    const ok = deps.shortcuts.setQuickCapture(accelerator);
    if (ok) deps.store.setQuickCaptureShortcut(accelerator);
    return ok;
  });

  const subscriptions = new Map<string, () => void>();
  handle("services:request", ({ service, method, input }, context) =>
    deps.services.request(service, method, input, { windowId: context.id }),
  );
  handle("services:subscribe", ({ id, service, stream, params }, context) => {
    const key = `${context.id}:${id}`;
    if (subscriptions.has(key)) throw new PlatformError("exists", `Subscription ${id} exists`);
    const off = deps.services.subscribe(
      service,
      stream,
      params,
      (event) => windows.send(context, "services:event", { id, event }),
      { windowId: context.id },
    );
    const release = () => {
      subscriptions.delete(key);
      context.documentCleanups.delete(release);
      off();
    };
    subscriptions.set(key, release);
    context.documentCleanups.add(release);
  });
  handle("services:unsubscribe", ({ id }, context) => {
    subscriptions.get(`${context.id}:${id}`)?.();
  });
}
