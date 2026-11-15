// The database views load on first use (they are most of this plugin's code); `preload` fetches
// them once the app is idle, so opening a database does not wait for the network or disk.
import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

import { ScreenSkeleton } from "./skeleton.tsx";

const load = () => import("./DatabaseScreen.tsx");

const Screen = lazy(() => load().then((m) => ({ default: m.DatabaseScreen })));

export function DatabaseScreen(props: ComponentProps<typeof Screen>) {
  return (
    <Suspense
      fallback={
        <ScreenSkeleton compact={props.compact ?? false} fullWidth={props.fullWidth ?? false} />
      }
    >
      <Screen {...props} />
    </Suspense>
  );
}

export function preloadDatabaseViews() {
  const idle =
    (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
    ((fn: () => void) => setTimeout(fn, 1500));
  idle(() => void load().catch(() => {}));
}
