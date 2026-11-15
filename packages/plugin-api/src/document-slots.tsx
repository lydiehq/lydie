// Renders the `documentSlot` contributions inside a document view. "actions", "top" and "header"
// slots render side by side or stacked where the view puts them; "body" slots chain: each gets the next one (finally `fallback`, the editor) to show for
// documents it does not handle.
import type { ReactNode } from "react";

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
          <s.component key={s.id} docId={docId} tab={info} fallback={null} />
        ))}
      </>
    );
  }
  let node: ReactNode = fallback;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i]!;
    node = <s.component key={s.id} docId={docId} tab={info} fallback={node} />;
  }
  return <>{node}</>;
}
