// What a browser window starts before the app's code has loaded (`main.tsx` runs it first): the
// single-tab lock, the database worker's files and, when the window opens this browser's own
// workspace, its database. The database then opens while the rest of the app downloads and runs,
// instead of after it. `compose-browser.ts` takes what was started here. Not in Electron, where the
// database lives in the main process.
import { getInjectedPlatform } from "@lydie/platform";
import type { WebStore } from "@lydie/store/web";
import { parseScope, readProviderReturn } from "@lydie/sync";

import { urlNamesHosted } from "./routes.ts";
import { holdSingleTabLock, multiTabSupported } from "./single-tab.ts";

// `db`: the OPFS database it is in. Absent on the first one a browser made ("lydie-local.db").
export type WorkspaceRecord = { id: string; name: string; db?: string };

export const WORKSPACE_KEY = "lydie:local-workspace";
export const FIRST_DB = "lydie-local.db";
// Databases of local workspaces that were moved to the cloud, to delete once nothing has them
// open (a database cannot be deleted from the window that shows it).
export const DISCARDED_KEY = "lydie:local-discarded";
// The scope preference (`createScopePreference` over `localKv` in hosted.ts).
const SCOPE_KEY = "lydie:lydie.scope";
const STEAL_KEY = "lydie:steal-database";

const params = new URLSearchParams(window.location.search);
export const EMBED = params.get("embed") === "1";
// Seeding is for development and the performance suite (built with VITE_LYDIE_SEED=1).
export const SEED =
  import.meta.env.DEV || import.meta.env.VITE_LYDIE_SEED === "1" ? params.get("seed") : null;

export function discardedDatabases(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISCARDED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function existingLocalWorkspace(): WorkspaceRecord | null {
  const raw = localStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkspaceRecord;
  } catch {
    return null;
  }
}

// Takes the database over from another tab once, after "Use Lydie here" reloaded the page.
export function stealDatabase(): void {
  sessionStorage.setItem(STEAL_KEY, "1");
  window.location.reload();
}

type Early = {
  // Settles once this tab holds the single-tab lock (at once where tabs share the database).
  lock: Promise<void>;
  // The database of this browser's workspace, opening.
  store: { dbFilename: string; opening: Promise<WebStore> } | null;
  // Resolves once the database has started opening (or will not be opened here).
  started: Promise<void>;
};

let early: Early | null = null;
const lost = new Set<() => void>();

// Another tab took the database over (single-tab browsers).
export function onDatabaseLost(listener: () => void): () => void {
  lost.add(listener);
  return () => lost.delete(listener);
}

// The database a window that opens this browser's workspace uses, when nothing is left to decide:
// null when the URL or the preference names a hosted workspace, a provider sign-in is coming back
// (it may point the window at one) or a new workspace needs a database name of its own.
export function expectedLocalDatabase(options: { benchmark: boolean }): string | null {
  if (options.benchmark) return "lydie-bench.db";
  if (readProviderReturn(new URL(window.location.href))) return null;
  const base = import.meta.env.BASE_URL ?? "/";
  const linked = urlNamesHosted(base, window.location.pathname);
  if (linked ?? parseScope(localStorage.getItem(SCOPE_KEY))?.kind === "hosted") return null;
  const record = existingLocalWorkspace();
  if (record) return record.db ?? FIRST_DB;
  return discardedDatabases().includes(FIRST_DB) ? null : FIRST_DB;
}

export function startEarly(options: { benchmark: boolean }): void {
  if (early || getInjectedPlatform()?.services) return;
  preloadDatabaseFiles();
  const steal = sessionStorage.getItem(STEAL_KEY) === "1";
  sessionStorage.removeItem(STEAL_KEY);
  const lock = multiTabSupported()
    ? Promise.resolve()
    : holdSingleTabLock({
        steal,
        onLost: () => {
          for (const listener of lost) listener();
        },
      });
  lock.catch(() => {});
  const dbFilename = expectedLocalDatabase(options);
  let started = () => {};
  const starting = new Promise<void>((resolve) => (started = resolve));
  const store = dbFilename
    ? {
        dbFilename,
        opening: lock.then(async () => {
          const { openWebStore } = await import("@lydie/store/web");
          const opening = openWebStore({ dbFilename });
          started();
          return opening;
        }),
      }
    : null;
  // Whoever takes it reports a failure (`compose-browser.ts`).
  store?.opening.catch(started);
  if (!store) started();
  early = { lock, store, started: starting };
}

// Resolves once the database has started opening, so the app's code (which takes a while to run)
// is evaluated after the database's: its worker then opens the file meanwhile.
export function databaseStarted(): Promise<void> {
  return early?.started ?? Promise.resolve();
}

// What `startEarly` started, for the composition; it starts it now if nothing did (a test, or a
// page that mounts the app itself).
export function takeEarly(options: { benchmark: boolean }): Early {
  startEarly(options);
  return early ?? { lock: Promise.resolve(), store: null, started: Promise.resolve() };
}

// The in-page database's chunks, its worker, SQLite build and WASM, listed by the build in
// index.html (`lydie-preloads`, see vite-startup.ts): fetched now, they arrive while the app's code
// downloads. A data block, not static <link>s, so the desktop app (same index.html) skips them.
function preloadDatabaseFiles(): void {
  const block = document.getElementById("lydie-preloads");
  if (!block?.textContent) return;
  let files: { href: string; rel: "modulepreload" | "preload" }[];
  try {
    files = JSON.parse(block.textContent) as typeof files;
  } catch {
    return;
  }
  for (const file of files) {
    const link = document.createElement("link");
    link.rel = file.rel;
    // The worker fetches them itself: a plain fetch puts them in the HTTP cache it reads. Low
    // priority: the stylesheet and the app's modules come first (the first paint needs them).
    if (file.rel === "preload") {
      link.as = "fetch";
      link.fetchPriority = "low";
    }
    link.href = file.href;
    link.crossOrigin = "anonymous";
    document.head.append(link);
  }
}
