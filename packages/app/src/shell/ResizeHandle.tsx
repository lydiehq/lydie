// A focusable window splitter (role separator with a value); <hr> cannot be focused or dragged.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import clsx from "clsx";
import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type Props = {
  // "vertical": a bar between side-by-side panes (drags along x).
  orientation: "vertical" | "horizontal";
  label: string;
  // Called with the pointer delta in px since the drag started; return nothing.
  onDrag: (delta: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  // Keyboard resizing: called with ±step px.
  onStep?: (delta: number) => void;
  onReset?: () => void;
  value?: number;
  className?: string;
};

// A focusable separator that resizes by pointer drag or arrow keys (WAI-ARIA window splitter).
export function ResizeHandle({
  orientation,
  label,
  onDrag,
  onDragStart,
  onDragEnd,
  onStep,
  onReset,
  value,
  className,
}: Props) {
  const start = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = orientation === "vertical" ? event.clientX : event.clientY;
    onDragStart?.();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    const delta = (orientation === "vertical" ? event.clientX : event.clientY) - start.current;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onDrag(delta);
    });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    start.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd?.();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const back = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const forward = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (event.key === back) onStep?.(-step);
    else if (event.key === forward) onStep?.(step);
    else if (event.key === "Enter" && onReset) onReset();
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={clsx(
        "group relative z-10 shrink-0 outline-none",
        // The gap between two panes' cards.
        orientation === "vertical" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        className,
      )}
    >
      <div
        className={clsx(
          "absolute rounded-full bg-gray-950/15 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:bg-blue-400 group-focus-visible:opacity-100",
          orientation === "vertical"
            ? "top-1/2 left-1/2 h-8 w-[3px] -translate-1/2"
            : "top-1/2 left-1/2 h-[3px] w-8 -translate-1/2",
        )}
      />
    </div>
  );
}
