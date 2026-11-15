import { useLayoutEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";

export type FloatingCardProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  // The rectangle to sit next to, re-read on scroll and resize (e.g. a link's client rect).
  anchor: () => DOMRect | null;
  // "right": beside the anchor, top edges aligned (the left side when there is no room), e.g. a
  // card for a sidebar row.
  placement?: "bottom" | "top" | "right";
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
};

const GAP = 6;
const MARGIN = 8;

// A non-modal card anchored to a rectangle: hover previews and inline editors. Unlike Popover it
// neither traps focus nor blocks the page, so typing and pointer moves carry on underneath. Once
// placed it has `data-placed`, so a class like `data-placed:transition-transform` glides it to a
// new anchor without animating in from the corner, and `data-placed:opacity-100` fades it in.
export function FloatingCard({
  anchor,
  placement = "bottom",
  className,
  style,
  children,
  ref: outerRef,
  ...props
}: FloatingCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const show = (left: number, top: number) => {
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      if ("placed" in el.dataset) return;
      el.style.visibility = "visible";
      // Commit the first position before `data-placed` switches transitions on: measuring above
      // already computed a style at (0, 0), and the card would otherwise glide in from there.
      void el.offsetWidth;
      el.dataset.placed = "";
    };
    const place = () => {
      const rect = anchor();
      if (!rect) return;
      const { width, height } = el.getBoundingClientRect();
      if (placement === "right") {
        const right = rect.right + GAP;
        const left = right + width <= window.innerWidth - MARGIN ? right : rect.left - GAP - width;
        const top = Math.min(rect.top, window.innerHeight - height - MARGIN);
        show(Math.max(MARGIN, left), Math.max(MARGIN, top));
        return;
      }
      const below = rect.bottom + GAP;
      const above = rect.top - GAP - height;
      const fitsBelow = below + height <= window.innerHeight - MARGIN;
      const fitsAbove = above >= MARGIN;
      const top =
        placement === "top"
          ? fitsAbove || !fitsBelow
            ? above
            : below
          : fitsBelow || !fitsAbove
            ? below
            : above;
      const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN);
      show(left, Math.max(MARGIN, top));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [anchor, placement]);

  return createPortal(
    <div
      ref={(el) => {
        ref.current = el;
        if (typeof outerRef === "function") outerRef(el);
        else if (outerRef) outerRef.current = el;
      }}
      {...props}
      style={{ visibility: "hidden", ...style }}
      className={twMerge(
        "fixed top-0 left-0 z-50 flex max-h-[min(420px,70vh)] w-[380px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg bg-elevated text-gray-700 shadow-popover",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
