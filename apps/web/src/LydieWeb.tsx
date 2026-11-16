import { LydieApp } from "@lydie/app";
import type { Host } from "@lydie/app";
import { HostedBanner } from "@lydie/plugin-account";
import type { WebStoreOpenError } from "@lydie/store/web";
import { Button, EmptyState, ErrorState, LoadingState } from "@lydie/ui";
import { lazy, Suspense, useEffect, useState } from "react";

import { removeBootShell } from "./boot-shell.ts";
import { bootLabel, bootOnce, onBootProgress } from "./boot.ts";
import { NoWorkspaceError } from "./desktop.ts";
import { DesktopStart } from "./DesktopStart.tsx";
import { EMBED, onDatabaseLost, stealDatabase } from "./early.ts";
import { OtherTabError } from "./single-tab.ts";

// Only after the database failed to open: it brings the database driver, which a desktop window
// never loads otherwise.
const StorageRecovery = lazy(() =>
  import("./StorageRecovery.tsx").then((m) => ({ default: m.StorageRecovery })),
);

// `instanceof` would import the driver for its class.
function isStoreOpenError(error: unknown): error is WebStoreOpenError {
  return error instanceof Error && error.name === "WebStoreOpenError";
}

type Boot =
  | { state: "loading"; label: string }
  | { state: "other-tab" }
  | { state: "lost" }
  | { state: "ready"; host: Host }
  | { state: "error"; error: unknown }
  | { state: "start"; start: NoWorkspaceError };

export function LydieWeb() {
  const [boot_, setBoot] = useState<Boot>(() => ({ state: "loading", label: bootLabel() }));

  useEffect(() => {
    let cancelled = false;
    const offProgress = onBootProgress((label) => {
      if (!cancelled) setBoot({ state: "loading", label });
    });
    bootOnce()
      .then((host) => {
        if (cancelled) return;
        setBoot({ state: "ready", host });
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
    const offLost = onDatabaseLost(() => {
      if (!cancelled) setBoot({ state: "lost" });
    });
    return () => {
      cancelled = true;
      offProgress();
      offLost();
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
          action={<Button onPress={stealDatabase}>Use Lydie here</Button>}
        />
      </div>
    );
  }
  if (boot_.state === "start") return <DesktopStart start={boot_.start} />;
  if (boot_.state === "error") {
    if (isStoreOpenError(boot_.error)) {
      return (
        <Suspense>
          <StorageRecovery error={boot_.error} />
        </Suspense>
      );
    }
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
