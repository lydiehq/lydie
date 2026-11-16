import { PlatformError } from "@lydie/platform";
import type { OperatingSystem, Platform, UpdateState, WindowState } from "@lydie/platform";

import { createWebDownloads } from "./downloads.ts";

// The browser's Platform: no folder access yet (OPFS-only "private local workspace"), one window,
// native browser frame, dialogs through window.confirm.
function detectOs(): OperatingSystem {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|X11/.test(ua)) return "linux";
  return "other";
}

const WINDOW_STATE: WindowState = {
  focused: true,
  maximized: false,
  fullscreen: false,
  titleBar: { style: "native", height: 0, insetLeft: 0, insetRight: 0 },
};

const UPDATER: UpdateState = { status: "disabled", reason: "The web app updates on reload." };

export function createWebPlatform(): Platform {
  const os = detectOs();
  const unsupported = () =>
    Promise.reject(new PlatformError("unavailable", "Not available in the browser"));
  return {
    capabilities: {
      kind: "web",
      os,
      canOpenFolder: false,
      canWatchFolder: false,
      multipleWindows: false,
      nativeMenus: false,
      customTitleBar: false,
      secureStorage: false,
      updater: false,
      deepLinks: false,
      services: false,
      browserTab: true,
    },
    app: {
      name: "Lydie",
      version: "0.0.0",
      os,
      arch: "web",
      locale: navigator.language,
      packaged: false,
    },
    scope: { kind: "none" },
    files: null,
    folders: { pick: async () => null, recent: async () => [], forget: async () => {} },
    dialogs: {
      async message(options) {
        window.alert([options.message, options.detail].filter(Boolean).join("\n\n"));
        return 0;
      },
      async confirm(options) {
        return window.confirm([options.message, options.detail].filter(Boolean).join("\n\n"));
      },
      openFiles: async () => [],
      async saveFile(options) {
        const blob = new Blob([options.content as BlobPart]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = options.defaultName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      },
    },
    windows: {
      id: "main",
      state: () => WINDOW_STATE,
      onStateChange: () => () => {},
      setTitle: (title) => {
        document.title = title;
      },
      minimize: () => {},
      toggleMaximize: () => {},
      toggleFullscreen: () => void document.documentElement.requestFullscreen?.(),
      close: () => window.close(),
      open: unsupported,
    },
    menus: {
      setApplicationMenu: () => {},
      onAction: () => () => {},
      showContextMenu: async () => null,
    },
    deepLinks: { scheme: null, onOpen: () => () => {} },
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text),
      write: (data) => navigator.clipboard.writeText(data.text),
    },
    secrets: {
      get: async (key) => localStorage.getItem(`lydie:secret:${key}`),
      set: async (key, value) => localStorage.setItem(`lydie:secret:${key}`, value),
      delete: async (key) => localStorage.removeItem(`lydie:secret:${key}`),
    },
    updater: {
      state: () => UPDATER,
      onStateChange: () => () => {},
      check: async () => {},
      download: async () => {},
      restartToUpdate: () => {},
    },
    services: null,
    downloads: createWebDownloads(),
    // Only http(s) and mailto, as the desktop shell's checkExternalUrl.
    async openExternal(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return;
      window.open(parsed.href, "_blank", "noopener,noreferrer");
    },
  };
}
