// Renders the `documentSlot` contributions inside a document view. "actions", "top" and "header"
// slots render side by side or stacked where the view puts them; "body" slots chain: each gets the next one (finally `fallback`, the editor) to show for
// documents it does not handle. Each slot is a contribution of its own (`ContributionBoundary`).
import type { ReactNode } from "react";

import { ContributionBoundary, ContributionError } from "./contribution-boundary.tsx";
import type { TabInfo } from "./plugin.ts";
import { useContributions, useTab } from "./react.tsx";

export function DocumentSlots({
  slot,
  docId,
  tab,
  fallback = null,
}: {
  slot: "actions" | "top" | "header" | "body";
  docId: string;
  // Default: the tab this renders in.
  tab?: TabInfo | null;
  fallback?: ReactNode;
}) {
  const current = useTab();
  const info = tab === undefined ? current : tab;
  const slots = useContributions("documentSlot").filter((s) => s.slot === slot);
  if (slot !== "body") {
    return (
      <>
        {slots.map((s) => (
          <ContributionBoundary key={s.id} pluginId={s.pluginId} label="Page slot" compact>
            <s.component docId={docId} tab={info} fallback={null} />
          </ContributionBoundary>
        ))}
      </>
    );
  }
  let node: ReactNode = fallback;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i]!;
    const next = node;
    // A body slot that crashes says so and shows the rest of the chain (finally the editor), not
    // only an error: a slot that fails for every page (before it even decides it does not handle
    // one) would otherwise leave no page readable. On a page the slot does handle (a collection)
    // the person sees what failed above the page's text.
    node = (
      <ContributionBoundary
        key={s.id}
        pluginId={s.pluginId}
        fallback={(error, retry) => (
          <>
            <ContributionError name={`Page (${s.pluginId})`} error={error} retry={retry} compact />
            {next}
          </>
        )}
      >
        <s.component docId={docId} tab={info} fallback={next} />
      </ContributionBoundary>
    );
  }
  return <>{node}</>;
}
