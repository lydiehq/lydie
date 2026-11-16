import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  animateToZero,
  COLLAPSE_SPRING,
  EXPAND_SPRING,
  RELEASE_SPRING,
  resolveDragWidth,
  TOGGLE_TRANSITION,
} from "./elastic.ts";
import type { Animation, PanelBounds, Transition } from "./elastic.ts";

const KEYBOARD_STEP = 16;

export type ElasticPanelState = { collapsed: boolean; width: number };

export type ElasticPanelOptions = PanelBounds &
  ElasticPanelState & {
    // Screen edge the panel sits against; its handle is on the inner edge.
    side: "left" | "right";
    // Width a double-click on the handle returns to.
    defaultWidth: number;
    // Whether the handle can drag a collapsed panel back open.
    resizableWhenCollapsed?: boolean;
    // Called when a drag or key press settles. `width` is the expanded width, kept while
    // collapsed. The panel follows the props afterwards, so a commit the caller declines springs
    // back.
    onCommit: (next: ElasticPanelState) => void;
  };

export type ElasticPanel = {
  // The panel's outer element: its width animates (clip its overflow).
  attachPanel: (element: HTMLElement | null) => void;
  // The element holding the contents. It keeps its width while the panel collapses and takes the
  // destination width as it expands, so the contents clip rather than reflow.
  attachContent: (element: HTMLElement | null) => void;
  // Collapsed as displayed, which leads the props during a drag.
  collapsed: boolean;
  // True while animating between collapsed and expanded.
  switching: boolean;
  handleProps: {
    role: "separator";
    "aria-orientation": "vertical";
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    "aria-disabled": boolean;
    tabIndex: number;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
};

type Drag = {
  pointerId: number;
  startX: number;
  startRaw: number;
  startCollapsed: boolean;
  element: HTMLElement;
  cursor: string;
  userSelect: string;
  // Recent [time, base] samples for the release velocity.
  samples: [number, number][];
  onKey: (event: globalThis.KeyboardEvent) => void;
};

// Per-frame state lives here, outside React. The rendered width is `base + offset`: `base`
// follows the pointer 1:1, and a snap or settle moves `base` to its new value and springs only
// `offset` back to zero, so the edge never lags the pointer while a snap plays out.
type Engine = {
  base: number;
  offset: number;
  // A floor for the content width while switching (see `attachContent`).
  locked: number | null;
  collapsed: boolean;
  rest: number;
  animation: Animation | null;
  drag: Drag | null;
  panel: HTMLElement | null;
  content: HTMLElement | null;
};

type Ctx = {
  e: Engine;
  minWidth: number;
  setCollapsed: (collapsed: boolean) => void;
  setSwitching: (switching: boolean) => void;
};

const visualWidth = (e: Engine) => Math.max(0, e.base + e.offset);
// While locked, collapsing keeps the contents at their old width, and an expand drag that runs
// past the destination keeps following the pointer (`base` leaves out the spring's overshoot).
const contentWidth = (e: Engine) =>
  e.locked === null ? visualWidth(e) : Math.max(e.locked, e.base);

function write(e: Engine) {
  if (e.panel) e.panel.style.width = `${visualWidth(e)}px`;
  if (e.content) e.content.style.width = `${contentWidth(e)}px`;
}

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function settle({ e, setSwitching }: Ctx) {
  e.animation = null;
  e.offset = 0;
  e.locked = null;
  write(e);
  setSwitching(false);
}

function rebase(ctx: Ctx, nextBase: number, transition: Transition, velocity: number) {
  const { e } = ctx;
  const visual = visualWidth(e);
  e.animation?.stop();
  e.base = nextBase;
  e.offset = visual - nextBase;
  write(e);
  if (reducedMotion() || Math.abs(e.offset) < 0.5) return settle(ctx);
  const animation = animateToZero(e.offset, velocity, transition, (x) => {
    e.offset = x;
    write(e);
  });
  e.animation = animation;
  void animation.finished.then(() => {
    if (e.animation === animation) settle(ctx);
  });
}

function switchMode(ctx: Ctx, nextCollapsed: boolean, nextWidth: number) {
  const { e } = ctx;
  e.collapsed = nextCollapsed;
  // A drag can already be below minWidth; don't widen the contents at the snap.
  e.locked = nextCollapsed ? contentWidth(e) : Math.max(nextWidth, ctx.minWidth);
  ctx.setCollapsed(nextCollapsed);
  ctx.setSwitching(true);
}

function releaseVelocity(drag: Drag, now: number): number {
  const recent = drag.samples.filter(([t]) => now - t < 80);
  if (recent.length < 2) return 0;
  const [t0, b0] = recent[0]!;
  const [t1, b1] = recent.at(-1)!;
  return t1 > t0 ? ((b1 - b0) / (t1 - t0)) * 1000 : 0;
}

// Elastic resizing and collapsing for a side panel: the edge follows the pointer, resists past the
// limits, snaps collapsed or open past the midpoint, and springs into place with the release
// velocity. Toggles from elsewhere (props) ease. Escape cancels a drag; a double-click resets the
// width.
export function useElasticPanel({
  side,
  collapsed,
  width: expandedWidth,
  collapsedWidth,
  minWidth,
  maxWidth,
  defaultWidth,
  resizableWhenCollapsed = true,
  onCommit,
}: ElasticPanelOptions): ElasticPanel {
  const restingWidth = collapsed ? collapsedWidth : expandedWidth;
  const direction = side === "left" ? 1 : -1;
  const bounds = { collapsedWidth, minWidth, maxWidth };
  const engine = useRef<Engine | null>(null);
  const [displayCollapsed, setCollapsed] = useState(collapsed);
  const [switching, setSwitching] = useState(false);
  const [commitVersion, setCommitVersion] = useState(0);

  const ctx = (): Ctx => {
    // Not `??=`, which the React Compiler cannot compile: it would skip the whole hook.
    if (engine.current === null) {
      engine.current = {
        base: restingWidth,
        offset: 0,
        locked: null,
        collapsed,
        rest: restingWidth,
        animation: null,
        drag: null,
        panel: null,
        content: null,
      };
    }
    return { e: engine.current, minWidth, setCollapsed, setSwitching };
  };

  const commit = (next: ElasticPanelState) => {
    onCommit(next);
    setCommitVersion((version) => version + 1);
  };

  const clampWidth = (value: number) => Math.min(Math.max(value, minWidth), maxWidth);

  const releaseDrag = (e: Engine) => {
    const drag = e.drag;
    if (!drag) return null;
    e.drag = null;
    document.body.style.cursor = drag.cursor;
    document.body.style.userSelect = drag.userSelect;
    delete drag.element.dataset.dragging;
    window.removeEventListener("keydown", drag.onKey, true);
    if (drag.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
    return drag;
  };

  const endDrag = (pointerId?: number, cancel = false) => {
    const c = ctx();
    const { e } = c;
    if (!e.drag || (pointerId !== undefined && e.drag.pointerId !== pointerId)) return;
    const drag = releaseDrag(e)!;
    const velocity = releaseVelocity(drag, performance.now()) + (e.animation?.velocity() ?? 0);

    if (cancel) {
      if (e.collapsed !== drag.startCollapsed) switchMode(c, drag.startCollapsed, drag.startRaw);
      e.rest = drag.startRaw;
      rebase(c, drag.startRaw, RELEASE_SPRING, velocity);
      return;
    }

    const nextCollapsed = e.collapsed;
    const nextExpanded = nextCollapsed ? expandedWidth : Math.round(clampWidth(e.base));
    const target = nextCollapsed ? collapsedWidth : nextExpanded;
    e.rest = target;
    if (Math.abs(visualWidth(e) - target) >= 0.5) {
      rebase(c, target, nextCollapsed ? COLLAPSE_SPRING : RELEASE_SPRING, velocity);
    } else {
      e.base = target;
      write(e);
    }
    commit({ collapsed: nextCollapsed, width: nextExpanded });
  };

  // Follows the props: toggles from elsewhere, and commits that settled differently from what the
  // drag showed.
  useEffect(() => {
    const c = ctx();
    const { e } = c;
    if (e.drag) return;
    const target = collapsed ? collapsedWidth : expandedWidth;
    if (collapsed === e.collapsed && Math.abs(e.rest - target) < 0.5) return;
    e.rest = target;
    if (collapsed !== e.collapsed) switchMode(c, collapsed, target);
    rebase(c, target, TOGGLE_TRANSITION, e.animation?.velocity() ?? 0);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- ctx() reads the engine ref, not state
  }, [collapsed, expandedWidth, collapsedWidth, commitVersion]);

  useEffect(() => {
    const onBlur = () => endDrag();
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      const e = engine.current;
      if (!e) return;
      releaseDrag(e);
      e.animation?.stop();
      e.animation = null;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- installed once; endDrag reads the engine
  }, []);

  const disabled = collapsed && !resizableWhenCollapsed;

  return {
    attachPanel: (element) => {
      const { e } = ctx();
      e.panel = element;
      write(e);
    },
    attachContent: (element) => {
      const { e } = ctx();
      e.content = element;
      write(e);
    },
    collapsed: displayCollapsed,
    switching,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuemin": collapsedWidth,
      "aria-valuemax": maxWidth,
      "aria-valuenow": Math.round(restingWidth),
      "aria-disabled": disabled,
      tabIndex: disabled ? -1 : 0,
      onPointerDown: (event) => {
        const { e } = ctx();
        if (disabled || event.button !== 0 || e.drag) return;
        event.preventDefault();
        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);
        const onKey = (key: globalThis.KeyboardEvent) => {
          if (key.key !== "Escape") return;
          key.preventDefault();
          key.stopPropagation();
          endDrag(undefined, true);
        };
        window.addEventListener("keydown", onKey, true);
        e.drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startRaw: e.rest,
          startCollapsed: e.collapsed,
          element,
          cursor: document.body.style.cursor,
          userSelect: document.body.style.userSelect,
          samples: [[performance.now(), e.base]],
          onKey,
        };
        element.dataset.dragging = "";
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
      },
      onPointerMove: (event) => {
        const c = ctx();
        const { e } = c;
        const drag = e.drag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        // Recover if the release happened outside the window and was not delivered.
        if (event.buttons === 0) return endDrag(event.pointerId);
        const next = resolveDragWidth(
          drag.startRaw + (event.clientX - drag.startX) * direction,
          e.collapsed,
          bounds,
        );
        const now = performance.now();
        drag.samples.push([now, next.width]);
        if (drag.samples.length > 8) drag.samples.shift();
        if (next.collapsed === e.collapsed) {
          e.base = next.width;
          write(e);
          return;
        }
        switchMode(c, next.collapsed, next.width);
        rebase(
          c,
          next.width,
          next.collapsed ? COLLAPSE_SPRING : EXPAND_SPRING,
          e.animation?.velocity() ?? 0,
        );
      },
      onPointerUp: (event) => endDrag(event.pointerId),
      onPointerCancel: (event) => endDrag(event.pointerId),
      onLostPointerCapture: (event) => endDrag(event.pointerId),
      onKeyDown: (event) => {
        if (disabled) return;
        const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
        const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
        const step = event.shiftKey ? KEYBOARD_STEP * 4 : KEYBOARD_STEP;
        if (event.key === "Enter") {
          commit({ collapsed: !collapsed, width: expandedWidth });
        } else if (event.key === grow) {
          commit(
            collapsed
              ? { collapsed: false, width: expandedWidth }
              : { collapsed: false, width: clampWidth(expandedWidth + step) },
          );
        } else if (event.key === shrink) {
          if (collapsed) return;
          commit(
            expandedWidth - step < minWidth
              ? { collapsed: true, width: expandedWidth }
              : { collapsed: false, width: expandedWidth - step },
          );
        } else {
          return;
        }
        event.preventDefault();
      },
      onDoubleClick: () => {
        if (!disabled) commit({ collapsed: false, width: defaultWidth });
      },
    },
  };
}
