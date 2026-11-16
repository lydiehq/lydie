// Opening the workspace: compose the window, then start the app host. It starts as soon as the
// app's code is in (`main.tsx`), before React renders anything, and runs once per page: StrictMode
// runs effects twice, and two hosts would fight over one layout. What is shown meanwhile is
// `LydieWeb`'s business (and the app lock's, which only decides what is shown).
import { startApp, syncUrl } from "@lydie/app";
import type { Host } from "@lydie/app";
import { docIdOf } from "@lydie/plugin-api";

import { compose } from "./compose.ts";
import { EMBED, SEED } from "./early.ts";
import { webBase } from "./hosted.ts";
import { plugins } from "./plugins.ts";
import { openWelcome } from "./welcome.ts";

let booting: Promise<Host> | null = null;
let label = "Opening your notes";
const progress = new Set<(label: string) => void>();

// What the boot is doing, for the loading state ("Seeding…").
export function bootLabel(): string {
  return label;
}

export function onBootProgress(listener: (label: string) => void): () => void {
  progress.add(listener);
  return () => progress.delete(listener);
}

export function bootOnce(): Promise<Host> {
  if (!booting) {
    const started = performance.now();
    booting = boot((next) => {
      label = next;
      for (const listener of progress) listener(next);
    });
    void booting.then(
      (host) => {
        performance.mark("lydie:ready");
        (window as { __lydie?: unknown }).__lydie = { host, bootMs: performance.now() - started };
      },
      () => {},
    );
  }
  return booting;
}

async function boot(onProgress: (label: string) => void): Promise<Host> {
  const tc = performance.now();
  const composition = await compose({ benchmark: SEED === "large", embed: EMBED });
  performance.measure("lydie:compose", { start: tc });
  if (SEED === "large" && composition.local) {
    onProgress("Seeding 15,000 documents…");
    const ts = performance.now();
    await composition.local.seedLarge((done, total) =>
      onProgress(`Seeding ${done.toLocaleString()} / ${total.toLocaleString()}`),
    );
    performance.measure("lydie:seed", { start: ts });
  }
  const t0 = performance.now();
  const host = await startApp({
    backend: composition.backend,
    platform: composition.platform,
    plugins,
    services: composition.services,
  });
  performance.measure("lydie:start-app", { start: t0 });
  const welcome = composition.welcomeDocId;
  if (welcome) {
    // A hosted page arrives with the first sync: the shell paints now and the page opens then.
    if (composition.backend.info.mode === "synced") openWelcome(host, welcome);
    // A restored layout (a reload) already shows what the user had open.
    else if (docIdOf(host.app.activeTab()?.path) === null) host.app.openDoc(welcome);
  }
  if (EMBED) host.shell.set((s) => ({ ...s, sidebarWidth: 220, panelOpen: false }));
  // The address bar follows the focused tab. Not in the site's embed: a frame's history entries
  // land in the page around it. Not while a workspace waits for sign-in either: the URL is what
  // the window comes back to.
  const waiting = composition.services.account?.wanted;
  if (composition.platform.capabilities.browserTab && !EMBED && !waiting) {
    const { mode, workspaceId } = composition.backend.info;
    syncUrl(host, { base: webBase(), workspaceId: mode === "synced" ? workspaceId : null });
  }
  if (composition.notice) host.app.notify({ title: composition.notice, kind: "warning" });
  return host;
}
