import { LydieApp, startApp, syncUrl } from "@lydie/app";
import type { Host } from "@lydie/app";
import { HostedBanner } from "@lydie/plugin-account";
import { docIdOf } from "@lydie/plugin-api";
import { WebStoreOpenError } from "@lydie/store/web";
import { Button, EmptyState, ErrorState, LoadingState } from "@lydie/ui";
import { useEffect, useState } from "react";

import { removeBootShell } from "./boot-shell.ts";
import { compose } from "./compose.ts";
import { NoWorkspaceError } from "./desktop.ts";
import { DesktopStart } from "./DesktopStart.tsx";
import { webBase } from "./hosted.ts";
import { plugins } from "./plugins.ts";
import { OtherTabError } from "./single-tab.ts";
import { StorageRecovery } from "./StorageRecovery.tsx";
import { openWelcome } from "./welcome.ts";

type Boot =
  | { state: "loading"; label: string }
  | { state: "other-tab" }
  | { state: "lost" }
  | { state: "ready"; host: Host }
  | { state: "error"; error: unknown }
  | { state: "start"; start: NoWorkspaceError };

const params = new URLSearchParams(window.location.search);
const EMBED = params.get("embed") === "1";
// Seeding is for development and the performance suite (built with VITE_LYDIE_SEED=1).
const SEED =
  import.meta.env.DEV || import.meta.env.VITE_LYDIE_SEED === "1" ? params.get("seed") : null;

// Once per page: StrictMode runs effects twice, and two hosts would fight over one layout.
let booting: Promise<Host> | null = null;
const progress = new Set<(label: string) => void>();

function bootOnce(onProgress: (label: string) => void): Promise<Host> {
  progress.add(onProgress);
  booting ??= boot((label) => {
    for (const listener of progress) listener(label);
  });
  return booting;
}

const STEAL_KEY = "lydie:steal-database";
const lost = new Set<() => void>();

async function boot(onProgress: (label: string) => void): Promise<Host> {
  const steal = sessionStorage.getItem(STEAL_KEY) === "1";
  sessionStorage.removeItem(STEAL_KEY);
  const tc = performance.now();
  const composition = await compose({
    benchmark: SEED === "large",
    steal,
    embed: EMBED,
    onLost: () => {
      for (const listener of lost) listener();
    },
  });
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

export function LydieWeb() {
  const [boot_, setBoot] = useState<Boot>({ state: "loading", label: "Opening your notes" });

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    const onProgress = (label: string) => {
      if (!cancelled) setBoot({ state: "loading", label });
    };
    bootOnce(onProgress)
      .then((host) => {
        if (cancelled) return;
        setBoot({ state: "ready", host });
        performance.mark("lydie:ready");
        (window as { __lydie?: unknown }).__lydie = { host, bootMs: performance.now() - started };
        if (EMBED && window.parent !== window) {
          window.parent.postMessage({ type: "lydie:embed-ready" }, "*");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof OtherTabError) return setBoot({ state: "other-tab" });
        if (error instanceof NoWorkspaceError) return setBoot({ state: "start", start: error });
        console.error(error);
        setBoot({ state: "error", error });
      });
    const onLost = () => {
      if (!cancelled) setBoot({ state: "lost" });
    };
    lost.add(onLost);
    return () => {
      cancelled = true;
      progress.delete(onProgress);
      lost.delete(onLost);
    };
  }, []);

  useEffect(() => {
    if (boot_.state !== "loading") removeBootShell();
  }, [boot_.state]);

  // The frame from public/boot-shell.js shows meanwhile; the label only appears if it takes a while.
  if (boot_.state === "loading") {
    return (
      <div className="fixed inset-x-0 top-10 bottom-1.5 flex items-center justify-center">
        <LoadingState
          label={boot_.label}
          className="animate-[boot-label_200ms_ease-out_1.5s_both] motion-reduce:animate-none"
        />
      </div>
    );
  }
  if (boot_.state === "other-tab" || boot_.state === "lost") {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <EmptyState
          title={
            boot_.state === "lost"
              ? "Lydie was opened in another tab"
              : "Lydie is open in another tab"
          }
          description="This browser can only use your notes in one tab at a time."
          action={
            <Button
              onPress={() => {
                sessionStorage.setItem(STEAL_KEY, "1");
                window.location.reload();
              }}
            >
              Use Lydie here
            </Button>
          }
        />
      </div>
    );
  }
  if (boot_.state === "start") return <DesktopStart start={boot_.start} />;
  if (boot_.state === "error") {
    if (boot_.error instanceof WebStoreOpenError) return <StorageRecovery error={boot_.error} />;
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <ErrorState
          title="Lydie could not open your notes"
          error={boot_.error}
          action={<Button onPress={() => window.location.reload()}>Reload</Button>}
        />
      </div>
    );
  }
  return <LydieApp host={boot_.host} banner={<HostedBanner />} />;
}
