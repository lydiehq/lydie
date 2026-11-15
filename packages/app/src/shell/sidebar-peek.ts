import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

// What opens the peek on hover: the ledge along the window's left edge. Not the sidebar toggle,
// whose press expands the sidebar for good.
const PEEK_TRIGGER = "data-sidebar-peek-trigger";

export type PeekPhase = "closed" | "open" | "leaving";

// A short rest before opening, so passing over the edge on the way elsewhere does not open it;
// a longer one before closing, so the pointer can stray off the card for a moment.
const OPEN_DELAY = 100;
const CLOSE_DELAY = 300;
const ENTER = { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
const EXIT = { duration: 150, easing: "ease-in" };

function instant(element: HTMLElement | null) {
  return (
    typeof element?.animate !== "function" ||
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

// The collapsed sidebar shown over the content while the pointer is on the window's left edge,
// and on the card it opens (as in Linear and Notion). One document listener
// decides from what is under the pointer. What is drawn outside the shell (menus, their
// underlays, hover cards) holds the peek as it is, so a menu opened from it keeps it open.
export function useSidebarPeek({
  enabled,
  shell,
  card,
}: {
  // The sidebar is collapsed and at rest.
  enabled: boolean;
  shell: RefObject<HTMLElement | null>;
  card: RefObject<HTMLElement | null>;
}): PeekPhase {
  const [phase, setPhase] = useState<PeekPhase>("closed");
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) setPhase("closed");
  }

  useEffect(() => {
    if (!enabled) return;
    let open = false;
    let pending: "open" | "close" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Collapsing by dragging the sidebar's edge leaves the pointer on the ledge: it opens the
    // peek only once the pointer has been elsewhere.
    let armed = false;
    const cancel = () => {
      clearTimeout(timer);
      pending = null;
    };
    const go = (next: boolean) => {
      cancel();
      open = next;
      setPhase(next ? "open" : instant(card.current) ? "closed" : "leaving");
    };
    const schedule = (next: "open" | "close", delay: number) => {
      if (pending === next) return;
      cancel();
      pending = next;
      timer = setTimeout(() => go(next === "open"), delay);
    };
    const onPointer = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !shell.current?.contains(target)) return;
      if (open && card.current?.contains(target)) return cancel();
      if (target.closest(`[${PEEK_TRIGGER}]`)) {
        if (open) cancel();
        else if (armed) schedule("open", OPEN_DELAY);
        return;
      }
      armed = true;
      if (open) schedule("close", CLOSE_DELAY);
      else cancel();
    };
    const onOut = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      if (open) schedule("close", CLOSE_DELAY);
      else cancel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (open && event.key === "Escape" && !event.defaultPrevented) go(false);
    };
    document.addEventListener("pointermove", onPointer);
    // A document dragged from the peek closes it on the way to a tab row or a split; one dragged
    // onto the ledge opens it.
    document.addEventListener("dragover", onPointer);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("keydown", onKey);
    return () => {
      cancel();
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("dragover", onPointer);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, shell, card]);

  // Slides in from the left edge and back out; the card stays drawn until it is out of view.
  useLayoutEffect(() => {
    const element = card.current;
    if (phase === "closed" || !element) return;
    if (instant(element)) return;
    const hidden = { transform: "translateX(calc(-100% - 12px))", opacity: 0 };
    const shown = { transform: "none", opacity: 1 };
    // Cancelled when the phase moves on, so a sidebar that opens for good is not left sliding.
    const animation =
      phase === "open"
        ? element.animate([hidden, shown], ENTER)
        : element.animate([shown, hidden], { ...EXIT, fill: "forwards" });
    // Cancelling rejects it; browsers mark it handled, happy-dom does not.
    animation.finished.catch(() => {});
    if (phase === "leaving") {
      animation.onfinish = () =>
        setPhase((current) => (current === "leaving" ? "closed" : current));
    }
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [phase, card]);

  return phase;
}
