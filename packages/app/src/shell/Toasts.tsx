import {
  AlertOctagonRegular,
  AlertRegular,
  Button,
  CheckCircleRegular,
  CloseRegular,
  focusRingClass,
  InformationRegular,
  WithTooltip,
} from "@lydie/ui";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FocusEvent, PointerEvent } from "react";

import type { Toast } from "../host/host.ts";
import { useHostInternal } from "./context.ts";

// Sonner's behaviour and numbers: a stack of the newest three, older ones peeking above the front
// one and scaled down; hovering (or keyboard focus) fans them out and pauses every timer.
const VISIBLE = 3;
const GAP = 14;
const PEEK = 14;
const SCALE_STEP = 0.05;
const EXIT_MS = 200;
const SWIPE_DISTANCE = 45;
// px per ms, measured over the whole drag.
const SWIPE_VELOCITY = 0.11;
const DURATION = 4000;
const ERROR_DURATION = 6000;

type Exit = "fade" | "swipe";

const ICONS = {
  info: <InformationRegular className="text-blue-500" />,
  success: <CheckCircleRegular className="text-green-600" />,
  warning: <AlertRegular className="text-amber-500" />,
  error: <AlertOctagonRegular className="text-red-500" />,
};

const subscribeVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};

export function Toasts() {
  const host = useHostInternal();
  const toasts = useSyncExternalStore(host.toasts.subscribe, host.toasts.get);
  const [exits, setExits] = useState<ReadonlyMap<number, Exit>>(new Map());
  const [heights, setHeights] = useState<ReadonlyMap<number, number>>(new Map());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const pageHidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );

  const dismiss = (id: number, exit: Exit) => {
    setExits((map) => new Map(map).set(id, exit));
    setTimeout(() => {
      host.toasts.set((list) => list.filter((t) => t.id !== id));
      setExits((map) => withoutKey(map, id));
      setHeights((map) => withoutKey(map, id));
      // The pointer or focus may have left with the last toast without a leave or blur event.
      if (host.toasts.get().length === 0) {
        setHovered(false);
        setFocused(false);
      }
    }, EXIT_MS);
  };

  const active = toasts.filter((t) => !exits.has(t.id));
  const expanded = (hovered || focused) && active.length > 1;
  const paused = hovered || focused || swiping || pageHidden;
  const front = active.at(-1);
  const frontHeight = front ? (heights.get(front.id) ?? 0) : 0;

  const items = stackPositions(toasts, exits, heights);
  const shown = items.filter((i) => !exits.has(i.toast.id) && i.index < VISIBLE);
  const last = shown.at(-1);
  const stackHeight = expanded
    ? last
      ? last.offset + (heights.get(last.toast.id) ?? 0) + last.index * GAP
      : 0
    : frontHeight;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover and focus only expand the stack
    <section
      aria-label="Notifications"
      className="fixed right-4 bottom-4 z-50 w-[356px] max-w-[calc(100vw-2rem)]"
      style={{ height: stackHeight }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event: FocusEvent) => {
        if ((event.target as HTMLElement).matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {items.map(({ toast, index, offset: above, z }) => {
        const exit = exits.get(toast.id) ?? null;
        const height = heights.get(toast.id);
        const behind = !expanded && index > 0;
        return (
          <ToastItem
            key={toast.id}
            toast={toast}
            exit={exit}
            hidden={index >= VISIBLE}
            behind={behind}
            y={expanded ? -(above + index * GAP) : -index * PEEK}
            scale={expanded ? 1 : 1 - index * SCALE_STEP}
            height={behind ? frontHeight : height}
            z={z}
            paused={paused}
            onHeight={(h) => setHeights((map) => new Map(map).set(toast.id, h))}
            onSwipe={setSwiping}
            onDismiss={(how) => dismiss(toast.id, how)}
          />
        );
      })}
    </section>
  );
}

type Props = {
  toast: Toast;
  exit: Exit | null;
  // Past the third: kept (and timing out) but not drawn.
  hidden: boolean;
  // Collapsed behind the front toast: its size, its content faded out.
  behind: boolean;
  y: number;
  scale: number;
  height: number | undefined;
  z: number;
  paused: boolean;
  onHeight: (height: number) => void;
  onSwipe: (swiping: boolean) => void;
  onDismiss: (exit: Exit) => void;
};

function ToastItem({
  toast,
  exit,
  hidden,
  behind,
  y,
  scale,
  height,
  z,
  paused,
  onHeight,
  onSwipe,
  onDismiss,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const remaining = useRef(toast.duration ?? (toast.kind === "error" ? ERROR_DURATION : DURATION));
  const drag = useRef<{ x: number; y: number; at: number; axis: "x" | "y" | null; delta: number }>(
    null,
  );

  // Measured before the first paint, at its natural height; reading it also commits the starting
  // style, so the switch to `mounted` animates.
  useLayoutEffect(() => {
    if (ref.current) onHeight(ref.current.offsetHeight);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (paused || exit || !Number.isFinite(remaining.current)) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss("fade"), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, exit, onDismiss]);

  // Swipe right or down to dismiss, as Sonner does at the bottom right. Written to the DOM per
  // move; `data-swiping` turns the transitions off until release.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || exit || (event.target as HTMLElement).closest("button")) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      axis: null,
      delta: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) return;
      d.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      el.dataset.swiping = "";
      onSwipe(true);
    }
    const raw = d.axis === "x" ? dx : dy;
    // The other way it only gives a little.
    d.delta = raw >= 0 ? raw : raw / (1.5 + Math.abs(raw) / 20);
    el.style.setProperty(`--swipe-${d.axis}`, `${d.delta}px`);
  };
  const endDrag = (dismiss: boolean) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d?.axis || !el) return;
    delete el.dataset.swiping;
    onSwipe(false);
    const velocity = d.delta / (performance.now() - d.at);
    if (dismiss && (d.delta >= SWIPE_DISTANCE || (d.delta > 0 && velocity > SWIPE_VELOCITY))) {
      el.style.setProperty(`--swipe-${d.axis}`, "100%");
      onDismiss("swipe");
    } else el.style.removeProperty(`--swipe-${d.axis}`);
  };

  const icon = toast.kind ? ICONS[toast.kind] : null;
  const lift = !mounted || exit === "fade" ? " translateY(100%)" : "";
  return (
    <div
      ref={ref}
      role={toast.kind === "error" ? "alert" : "status"}
      aria-hidden={exit || hidden ? true : undefined}
      className={clsx(
        "group absolute inset-x-0 bottom-0 flex origin-top touch-none items-center gap-1.5 rounded-lg bg-elevated p-4 text-sm shadow-dialog select-none",
        "transition-[transform,opacity,height] duration-400 data-swiping:transition-none",
        (hidden || exit) && "pointer-events-none",
      )}
      style={{
        zIndex: z,
        height,
        opacity: !mounted || exit || hidden ? 0 : 1,
        transform: `translateY(${y}px)${lift} translate(var(--swipe-x, 0px), var(--swipe-y, 0px)) scale(${scale})`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
    >
      {/* Sonner's close badge on the corner, not a button look. */}
      <WithTooltip label="Dismiss">
        <button
          type="button"
          aria-label="Dismiss"
          className={clsx(
            "absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-elevated text-gray-500 shadow-sm ring ring-gray-950/10 transition-opacity hover:text-gray-900",
            focusRingClass,
            behind ? "opacity-0" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={() => onDismiss("fade")}
        >
          <CloseRegular className="size-3" />
        </button>
      </WithTooltip>
      <div
        className={clsx(
          "flex min-w-0 flex-1 items-center gap-1.5 transition-opacity duration-400",
          behind && "opacity-0",
        )}
      >
        {icon && (
          <span className="-ml-[3px] mr-1 flex size-4 shrink-0 items-center [&>svg]:size-5 [&>svg]:shrink-0">
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="leading-snug font-medium break-words text-gray-900">{toast.title}</div>
          {toast.description && (
            <div className="leading-snug break-words text-gray-600">{toast.description}</div>
          )}
        </div>
        {toast.action && (
          <Button
            size="xs"
            className="ml-auto"
            onPress={() => {
              toast.action?.onPress();
              onDismiss("fade");
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// Newest first: how many staying toasts are in front of each and their summed height. A leaving
// toast keeps the place it had; the ones behind it move up at once.
function stackPositions(
  toasts: readonly Toast[],
  exits: ReadonlyMap<number, Exit>,
  heights: ReadonlyMap<number, number>,
) {
  const items: { toast: Toast; index: number; offset: number; z: number }[] = [];
  let index = 0;
  let offset = 0;
  for (let i = toasts.length - 1; i >= 0; i--) {
    const toast = toasts[i]!;
    items.push({ toast, index, offset, z: i + 1 });
    if (exits.has(toast.id)) continue;
    index += 1;
    offset += heights.get(toast.id) ?? 0;
  }
  return items;
}

function withoutKey<V>(map: ReadonlyMap<number, V>, key: number): ReadonlyMap<number, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
