// The motion behind elastic panels (use-elastic-panel.ts): drag resolution with rubber-banding,
// and springs and tweens driven by requestAnimationFrame. No React and no animation library, so a
// drag or a settle writes widths straight to the DOM.

export type Transition =
  | { type: "spring"; visualDuration: number; bounce: number }
  | { type: "tween"; duration: number; ease: readonly [number, number, number, number] };

// Toggles from a button or shortcut ease in and out; drag snaps and releases keep their springs.
export const TOGGLE_TRANSITION: Transition = {
  type: "tween",
  duration: 0.35,
  ease: [0.4, 0, 0.2, 1],
};
export const COLLAPSE_SPRING: Transition = { type: "spring", visualDuration: 0.26, bounce: 0 };
export const EXPAND_SPRING: Transition = { type: "spring", visualDuration: 0.32, bounce: 0.1 };
export const RELEASE_SPRING: Transition = { type: "spring", visualDuration: 0.3, bounce: 0.15 };

// A drag must cross the snap point by this much to flip back, so it does not flicker on the line.
export const SNAP_HYSTERESIS = 10;

// Overshoot meets growing resistance and never exceeds `range`.
export function rubberBand(overshoot: number, range: number, stiffness = 0.55): number {
  return Math.sign(overshoot) * (1 - 1 / ((Math.abs(overshoot) * stiffness) / range + 1)) * range;
}

export type PanelBounds = { collapsedWidth: number; minWidth: number; maxWidth: number };

// Where the edge goes for a raw (pointer-following) width, and whether that reads as collapsed.
// Dragging past the midpoint between the collapsed and minimum widths flips the panel.
export function resolveDragWidth(
  raw: number,
  collapsedNow: boolean,
  { collapsedWidth, minWidth, maxWidth }: PanelBounds,
): { collapsed: boolean; width: number } {
  const snap = (collapsedWidth + minWidth) / 2;
  const threshold = collapsedNow ? snap + SNAP_HYSTERESIS : snap - SNAP_HYSTERESIS;
  if (raw < threshold) {
    // No give below the collapsed width: there is nothing further to reveal.
    return {
      collapsed: true,
      width: collapsedWidth + rubberBand(Math.max(0, raw - collapsedWidth), 60),
    };
  }
  // Below the minimum the edge keeps following closely, so the snap into the collapsed width is a
  // short hop rather than a jump.
  if (raw < minWidth) {
    return { collapsed: false, width: minWidth + rubberBand(raw - minWidth, 160, 0.8) };
  }
  if (raw > maxWidth) {
    return { collapsed: false, width: maxWidth + rubberBand(raw - maxWidth, 80) };
  }
  return { collapsed: false, width: raw };
}

// Motion's mapping from a perceived duration and bounce to a unit-mass spring.
export function springConstants(visualDuration: number, bounce: number) {
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  const stiffness = root * root;
  const damping = 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * Math.sqrt(stiffness);
  return { stiffness, damping };
}

export type SpringState = { x: number; v: number };

// Advances a spring towards 0 by `dt` seconds (semi-implicit Euler in steps of at most 4 ms, which
// stays stable for these stiffnesses).
export function stepSpring(
  state: SpringState,
  { stiffness, damping }: { stiffness: number; damping: number },
  dt: number,
): SpringState {
  let { x, v } = state;
  for (let left = dt; left > 0; left -= 0.004) {
    const h = Math.min(0.004, left);
    v += (-stiffness * x - damping * v) * h;
    x += v * h;
  }
  return { x, v };
}

export function springAtRest({ x, v }: SpringState): boolean {
  return Math.abs(x) < 0.25 && Math.abs(v) < 4;
}

// CSS cubic-bezier timing: solves x(t) = progress by Newton's method, falling back to bisection.
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (sampleX(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (progress: number) => (progress <= 0 ? 0 : progress >= 1 ? 1 : sampleY(solve(progress)));
}

export type Animation = {
  stop(): void;
  // Current velocity in px/s, so an interrupting animation can carry it on.
  velocity(): number;
  finished: Promise<void>;
};

type Frame = (callback: (now: number) => void) => number;

// Animates a value from `from` to 0, calling `onUpdate` every frame.
export function animateToZero(
  from: number,
  velocity: number,
  transition: Transition,
  onUpdate: (value: number) => void,
  frame: Frame = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): Animation {
  let handle = 0;
  let stopped = false;
  let current = { x: from, v: velocity };
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const done = () => {
    stopped = true;
    onUpdate(0);
    current = { x: 0, v: 0 };
    resolve();
  };

  if (transition.type === "spring") {
    const constants = springConstants(transition.visualDuration, transition.bounce);
    let last: number | null = null;
    const tick = (now: number) => {
      if (stopped) return;
      // Clamp long gaps (a background tab) so the spring does not jump.
      const dt = last === null ? 1 / 60 : Math.min(0.064, (now - last) / 1000);
      last = now;
      current = stepSpring(current, constants, dt);
      if (springAtRest(current)) return done();
      onUpdate(current.x);
      handle = frame(tick);
    };
    handle = frame(tick);
  } else {
    const ease = cubicBezier(...transition.ease);
    let start: number | null = null;
    let previous = { t: 0, x: from };
    const tick = (now: number) => {
      if (stopped) return;
      start ??= now;
      const progress = Math.min(1, (now - start) / 1000 / transition.duration);
      if (progress >= 1) return done();
      const x = from * (1 - ease(progress));
      const dt = (now - previous.t) / 1000;
      current = { x, v: previous.t && dt > 0 ? (x - previous.x) / dt : 0 };
      previous = { t: now, x };
      onUpdate(x);
      handle = frame(tick);
    };
    handle = frame(tick);
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancel(handle);
      resolve();
    },
    velocity: () => current.v,
    finished,
  };
}
