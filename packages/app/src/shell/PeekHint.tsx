import { useDeviceSetting } from "@lydie/plugin-api";
import clsx from "clsx";
import { useEffect, useState } from "react";

const SHOW_MS = 6000;

type Props = {
  // The sidebar's state as stored (not as animated).
  open: boolean;
  peeking: boolean;
};

// The first time the sidebar is collapsed on a device, a note at the window's left edge says that
// resting the pointer there shows it (`useSidebarPeek`). It goes after a few seconds, when the
// peek opens, or when the sidebar opens again; it never takes the pointer.
export function PeekHint({ open, peeking }: Props) {
  const [seen, setSeen] = useDeviceSetting("shell.peekHintSeen", false);
  const [shown, setShown] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setShown(!open && !seen);
  }
  if (shown && peeking) setShown(false);

  useEffect(() => {
    if (!shown) return;
    setSeen(true);
    const timer = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown, setSeen]);

  if (open) return null;
  return (
    <div className="pointer-events-none fixed top-1/2 left-0 z-40 -translate-y-1/2">
      <output className="sr-only">
        {shown ? "Hover the window's left edge to show the sidebar" : ""}
      </output>
      {/* Drawn while collapsed, so it can fade out; the delay lets the sidebar close first. */}
      <div
        aria-hidden
        data-testid="peek-hint"
        data-shown={shown || undefined}
        className={clsx(
          "flex items-center gap-2 transition-[opacity,translate] ease-out motion-reduce:transition-none",
          shown
            ? "translate-x-0 opacity-100 delay-300 duration-300 starting:-translate-x-2 starting:opacity-0"
            : "-translate-x-2 opacity-0 duration-150",
        )}
      >
        {/* Marks the edge that opens it. */}
        <span className="ml-0.5 h-12 w-1 animate-pulse rounded-full bg-gray-950/25" />
        <span className="rounded-lg bg-elevated px-2.5 py-1.5 text-sm text-gray-700 shadow-popover">
          Hover the edge to show the sidebar
        </span>
      </div>
    </div>
  );
}
