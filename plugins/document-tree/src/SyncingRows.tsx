/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a live region on <div>: <output> is for form results */
import { useStatus } from "@lydie/plugin-api";
import { Skeleton } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

const WIDTHS = ["w-28", "w-20", "w-32"] as const;
// The status says the first sync is in a moment before the tree's query has re-read the rows it
// brought: without the wait, a new workspace's first page comes in after a flash of "empty".
const LINGER_MS = 500;

// True while a hosted window's first sync is on its way (a new workspace, a new device), and for
// a moment after. Never in local and folder windows.
export function useAwaitingFirstSync(): boolean {
  const awaiting = useStatus().awaitingFirstSync === true;
  const [was, setWas] = useState(awaiting);
  const [lingering, setLingering] = useState(false);
  if (was !== awaiting) {
    setWas(awaiting);
    if (!awaiting) setLingering(true);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = setTimeout(() => setLingering(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [lingering]);
  return awaiting || lingering;
}

// An empty tree during the first sync: the pages have not arrived, so "Seems empty here." would
// be wrong. The outline of a few rows, laid out as the tree's (32 px slots, the icon, then the
// title); the skeleton fades in after a moment, so a quick sync shows nothing.
export function SyncingRows({ padded }: { padded: boolean }) {
  return (
    <div
      role="status"
      aria-label="Syncing documents"
      data-testid="document-tree-syncing"
      className={padded ? "px-2" : ""}
    >
      {WIDTHS.map((width) => (
        <div key={width} className="flex h-8 items-center gap-1 pl-2">
          <span className="-ml-1 flex size-5 shrink-0 items-center justify-center">
            <Skeleton className="size-4" />
          </span>
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}
