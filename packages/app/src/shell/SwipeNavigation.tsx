import { ArrowLeftRegular, ArrowRightRegular } from "@lydie/ui";
import clsx from "clsx";
import { useEffect, useRef } from "react";

import { useHostInternal } from "./context.ts";
import { createSwipeRecognizer, scrollsHorizontally } from "./swipe.ts";
import type { SwipeFrame } from "./swipe.ts";

// Hidden just past the window edge; fully swiped, 16 px inside it.
const HIDDEN = -56;
const SHOWN = 16;

const ARROW =
  "pointer-events-none fixed top-[calc(50%-1.25rem)] z-50 flex size-10 items-center justify-center rounded-full bg-elevated text-lg text-gray-700 opacity-0 shadow-popover transition-colors duration-100 data-[armed]:bg-gray-800 data-[armed]:text-surface";

// Two-finger swipe navigation (swipe.ts) where the platform reports trackpad phases, with an arrow
// that follows the fingers in from the window edge and turns solid once lifting would navigate,
// as in Chrome. Styles are written to the DOM once per frame, never through React state.
export function SwipeNavigation() {
  const host = useHostInternal();
  const trackpad = host.platform.trackpad;
  const backRef = useRef<HTMLDivElement>(null);
  const forwardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trackpad) return;
    const recognizer = createSwipeRecognizer({
      canGo: (direction) =>
        host.overlay.get() === null &&
        host.confirms.get().length === 0 &&
        host.app.commands().some((c) => c.id === `core.${direction}` && c.enabled),
      scrolls: (x, y, deltaX) => scrollsHorizontally(document.elementFromPoint(x, y), deltaX),
    });

    const paint = (frame: SwipeFrame) => {
      for (const [direction, ref] of [
        ["back", backRef],
        ["forward", forwardRef],
      ] as const) {
        const el = ref.current;
        if (!el) continue;
        const side = direction === "back" ? 1 : -1;
        const active = frame.type !== "cancel" && frame.direction === direction;
        if (frame.type === "progress" && active) {
          const p = Math.min(1, frame.progress);
          const eased = 1 - (1 - p) ** 2;
          el.style.transition = "none";
          el.style.opacity = String(Math.min(1, p * 1.5));
          el.style.transform = `translateX(${side * (HIDDEN + (SHOWN - HIDDEN) * eased)}px) scale(${0.8 + 0.2 * p})`;
          el.toggleAttribute("data-armed", frame.progress >= 1);
        } else if (frame.type === "commit" && active) {
          el.style.transition = "opacity 180ms ease-out, transform 180ms ease-out";
          el.style.opacity = "0";
          el.style.transform = `translateX(${side * SHOWN}px) scale(1.15)`;
        } else if (el.style.opacity !== "" && el.style.opacity !== "0") {
          el.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
          el.style.opacity = "0";
          el.style.transform = `translateX(${side * HIDDEN}px) scale(0.8)`;
          el.removeAttribute("data-armed");
        }
      }
    };

    // Trackpads report up to 120 events a second: paint the latest once per frame.
    let pending: SwipeFrame | null = null;
    let raf = 0;
    const off = trackpad.onScroll((event) => {
      const frame = recognizer.scroll(event);
      if (!frame) return;
      if (frame.type === "commit") void host.app.runCommand(`core.${frame.direction}`);
      pending = frame;
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        if (pending) paint(pending);
        pending = null;
      });
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [host, trackpad]);

  if (!trackpad) return null;
  return (
    <>
      <div ref={backRef} aria-hidden data-testid="swipe-back" className={clsx(ARROW, "left-0")}>
        <ArrowLeftRegular />
      </div>
      <div
        ref={forwardRef}
        aria-hidden
        data-testid="swipe-forward"
        className={clsx(ARROW, "right-0")}
      >
        <ArrowRightRegular />
      </div>
    </>
  );
}
