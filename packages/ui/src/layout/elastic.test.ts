import { describe, expect, test } from "bun:test";

import {
  animateToZero,
  cubicBezier,
  RELEASE_SPRING,
  resolveDragWidth,
  rubberBand,
  SNAP_HYSTERESIS,
  springAtRest,
  springConstants,
  stepSpring,
  TOGGLE_TRANSITION,
} from "./elastic.ts";
import type { Transition } from "./elastic.ts";

const bounds = { collapsedWidth: 52, minWidth: 200, maxWidth: 420 };
const snap = (bounds.collapsedWidth + bounds.minWidth) / 2;

// Runs an animation to the end on a fake 60 Hz clock; returns every value it reported.
async function run(from: number, velocity: number, transition: Transition) {
  const values: number[] = [];
  const queue: ((now: number) => void)[] = [];
  let now = 0;
  const animation = animateToZero(
    from,
    velocity,
    transition,
    (x) => values.push(x),
    (callback) => queue.push(callback),
    () => {},
  );
  for (let i = 0; i < 600 && queue.length; i++) {
    now += 1000 / 60;
    queue.shift()!(now);
  }
  await animation.finished;
  return { values, frames: values.length };
}

describe("rubberBand", () => {
  test("grows with the overshoot but never reaches the range", () => {
    expect(rubberBand(0, 60)).toBe(0);
    expect(rubberBand(10, 60)).toBeGreaterThan(0);
    expect(rubberBand(100, 60)).toBeGreaterThan(rubberBand(10, 60));
    expect(rubberBand(1e6, 60)).toBeLessThan(60);
    expect(rubberBand(-50, 60)).toBe(-rubberBand(50, 60));
  });
});

describe("resolveDragWidth", () => {
  test("follows the pointer between the limits", () => {
    expect(resolveDragWidth(300, false, bounds)).toEqual({ collapsed: false, width: 300 });
  });

  test("resists past the maximum and below the minimum", () => {
    const wide = resolveDragWidth(600, false, bounds);
    expect(wide.collapsed).toBe(false);
    expect(wide.width).toBeGreaterThan(420);
    expect(wide.width).toBeLessThan(420 + 80);
    const narrow = resolveDragWidth(160, false, bounds);
    expect(narrow.collapsed).toBe(false);
    expect(narrow.width).toBeLessThan(200);
    expect(narrow.width).toBeGreaterThan(160);
  });

  test("snaps collapsed past the midpoint, with hysteresis both ways", () => {
    expect(resolveDragWidth(snap - SNAP_HYSTERESIS + 1, false, bounds).collapsed).toBe(false);
    expect(resolveDragWidth(snap - SNAP_HYSTERESIS - 1, false, bounds).collapsed).toBe(true);
    expect(resolveDragWidth(snap + SNAP_HYSTERESIS - 1, true, bounds).collapsed).toBe(true);
    expect(resolveDragWidth(snap + SNAP_HYSTERESIS + 1, true, bounds).collapsed).toBe(false);
  });

  test("a collapsed panel gives a little when pulled, none when pushed", () => {
    const pulled = resolveDragWidth(80, true, bounds);
    expect(pulled.width).toBeGreaterThan(52);
    expect(pulled.width).toBeLessThan(80);
    expect(resolveDragWidth(0, true, bounds).width).toBe(52);
  });
});

describe("springs", () => {
  test("Motion's mapping: no bounce is critically damped", () => {
    const { stiffness, damping } = springConstants(0.3, 0);
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness));
  });

  test("a spring without bounce settles without overshooting", () => {
    const constants = springConstants(0.26, 0);
    let state = { x: 100, v: 0 };
    let min = 100;
    for (let i = 0; i < 120 && !springAtRest(state); i++) {
      state = stepSpring(state, constants, 1 / 60);
      min = Math.min(min, state.x);
    }
    expect(springAtRest(state)).toBe(true);
    expect(min).toBeGreaterThan(-0.5);
  });

  test("a bouncy spring overshoots a little", () => {
    const constants = springConstants(0.3, 0.15);
    let state = { x: 100, v: 0 };
    let min = 100;
    for (let i = 0; i < 120; i++) {
      state = stepSpring(state, constants, 1 / 60);
      min = Math.min(min, state.x);
    }
    expect(min).toBeLessThan(0);
    expect(min).toBeGreaterThan(-15);
  });
});

describe("cubicBezier", () => {
  test("ends at 0 and 1, and matches the CSS curve in the middle", () => {
    const ease = cubicBezier(0.4, 0, 0.2, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // cubic-bezier(0.4, 0, 0.2, 1) at x = 0.5 is about 0.774.
    expect(ease(0.5)).toBeCloseTo(0.774, 2);
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe("animateToZero", () => {
  test("a tween reaches 0 after its duration", async () => {
    const { values, frames } = await run(200, 0, TOGGLE_TRANSITION);
    expect(values.at(-1)).toBe(0);
    // 0.35 s at 60 Hz.
    expect(frames).toBeGreaterThanOrEqual(20);
    expect(frames).toBeLessThanOrEqual(23);
    expect(values.every((x, i) => i === 0 || x <= values[i - 1]!)).toBe(true);
  });

  test("a spring ends exactly at 0 and carries the release velocity", async () => {
    const still = await run(50, 0, RELEASE_SPRING);
    const thrown = await run(50, 3000, RELEASE_SPRING);
    expect(still.values.at(-1)).toBe(0);
    // Thrown outwards, the edge first moves further out before coming back.
    expect(Math.max(...thrown.values)).toBeGreaterThan(50);
    expect(Math.max(...still.values)).toBeLessThanOrEqual(50);
  });

  test("stop ends it without reporting 0", async () => {
    const values: number[] = [];
    const queue: ((now: number) => void)[] = [];
    const animation = animateToZero(
      100,
      0,
      TOGGLE_TRANSITION,
      (x) => values.push(x),
      (callback) => queue.push(callback),
      () => {},
    );
    queue.shift()!(16);
    queue.shift()!(32);
    animation.stop();
    await animation.finished;
    expect(values.at(-1)).toBeGreaterThan(0);
  });
});
