// The one composition point: which Platform and which Backend this window runs on.
//   - Inside Electron the preload injected a Platform whose `services` reach the main process,
//     where the database lives: the backend is remote (`compose-desktop.ts`).
//   - In a plain browser the database runs here (SQLite WASM on OPFS, in PowerSync's worker): the
//     backend is local, in "local browser mode", with no login (`compose-browser.ts`).
//   - A browser window whose startup scope is a hosted workspace opens the signed-in user's synced
//     database instead, with the sync engine and the collab pool (`@lydie/sync`). The URL says
//     which: `w/<workspaceId>/…` is that hosted workspace, the app's base is the workspace opened
//     last, any other URL is this browser's own. The scope never changes while the window is open:
//     switching goes to the other workspace's URL.
// Each side is its own chunk, so a desktop window never loads the in-page database and runtime.
import { getInjectedPlatform } from "@lydie/platform";
import type { Platform } from "@lydie/platform";
import type { Backend, HostServices } from "@lydie/plugin-api";

export type Composition = {
  platform: Platform;
  backend: Backend;
  // The Getting started page of a workspace opened for the first time, to open first (in a hosted
  // window, once it has synced).
  welcomeDocId: string | null;
  // Set when this window owns the database (the web): for seeding and diagnostics.
  local: { seedLarge(onProgress: (done: number, total: number) => void): Promise<void> } | null;
  // What plugins get besides the backend (`app.services`).
  services: HostServices;
  // Why the workspace the URL names is not the one that opened, to tell the user.
  notice?: string;
};

export type ComposeOptions = {
  benchmark?: boolean;
  // Inside the marketing site's iframe: do not ask the browser to keep storage.
  embed?: boolean;
};

export const ABOUT = {
  licence: "AGPL-3.0-only",
  sourceUrl: "https://github.com/lydiehq/lydie",
};

export async function compose(options: ComposeOptions = {}): Promise<Composition> {
  const injected = getInjectedPlatform();
  if (injected?.services) {
    const { composeDesktop } = await import("./compose-desktop.ts");
    return composeDesktop(injected, injected.services);
  }
  const { composeBrowser } = await import("./compose-browser.ts");
  return composeBrowser(injected, options);
}
