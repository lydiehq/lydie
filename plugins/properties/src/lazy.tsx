// The panel (and the shared value editors it uses) loads on first use, fetched at idle after
// start; the editor does not wait for it.
import type { DocumentSlotProps } from "@lydie/plugin-api";
import { lazy, Suspense } from "react";

const load = () => import("./PropertiesPanel.tsx");
const Panel = lazy(() => load().then((m) => ({ default: m.PropertiesPanel })));

export function LazyPropertiesPanel(props: DocumentSlotProps) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
}

export function preloadPropertiesPanel() {
  const idle =
    (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ??
    ((fn: () => void) => setTimeout(fn, 1500));
  idle(() => void load().catch(() => {}));
}
