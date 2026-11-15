import { afterEach, describe, expect, test } from "bun:test";

import type { TrackpadScroll } from "@lydie/platform";

import { createSwipeRecognizer, scrollsHorizontally, SWIPE_DISTANCE } from "./swipe.ts";
import type { SwipeDirection, SwipeFrame } from "./swipe.ts";

type Options = {
  swipeEnabled?: boolean;
  canGo?: (d: SwipeDirection) => boolean;
  scrolls?: () => boolean;
};

// A touch: began, `moves` changed events scrolling `deltaX` px each (negative scrolls left) 16 ms
// apart, then `end` ("ended", "cancelled" or none), then a few momentum events.
function touch(
  moves: number,
  deltaX: number,
  { end = "ended", deltaY = 0, ...options }: Options & { end?: string; deltaY?: number } = {},
) {
  const recognizer = createSwipeRecognizer({
    canGo: options.canGo ?? (() => true),
    scrolls: options.scrolls ?? (() => false),
  });
  const event = (phase: string, momentumPhase: string, dx: number, time: number) =>
    ({
      phase,
      momentumPhase,
      deltaX: dx,
      deltaY,
      swipeEnabled: options.swipeEnabled ?? true,
      timeStamp: time,
      x: 10,
      y: 10,
    }) as TrackpadScroll;
  const frames: SwipeFrame[] = [];
  const push = (frame: SwipeFrame | null) => frame && frames.push(frame);
  let time = 0;
  push(recognizer.scroll(event("began", "none", 0, time)));
  for (let i = 0; i < moves; i++)
    push(recognizer.scroll(event("changed", "none", deltaX, (time += 16))));
  if (end) push(recognizer.scroll(event(end, "none", 0, (time += 16))));
  for (let i = 0; i < 5; i++)
    push(recognizer.scroll(event("none", "changed", deltaX, (time += 16))));
  return frames;
}

const last = (frames: SwipeFrame[]) => frames.at(-1);

describe("swipe recognizer", () => {
  test("scrolling left past the distance goes back on lift, not before", () => {
    const frames = touch(Math.ceil(SWIPE_DISTANCE / 10) + 2, -10, { end: "" });
    expect(frames.every((f) => f.type === "progress")).toBe(true);
    const progress = frames.map((f) => (f.type === "progress" ? f.progress : -1));
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBeGreaterThan(1);
    expect(last(touch(Math.ceil(SWIPE_DISTANCE / 10) + 2, -10))).toEqual({
      type: "commit",
      direction: "back",
    });
  });

  // As in Chrome: with natural scrolling that is fingers moving right, without it fingers moving
  // left. The scroll deltas already carry the user's setting.
  test("the direction follows the content: scrolling right goes forward", () => {
    expect(last(touch(20, 10))).toEqual({ type: "commit", direction: "forward" });
  });

  test("a short, slow swipe retracts; a short, fast flick navigates", () => {
    expect(last(touch(10, -3))).toEqual({ type: "cancel" });
    expect(last(touch(4, -16))).toEqual({ type: "commit", direction: "back" });
  });

  test("pulling back before lifting cancels", () => {
    const recognizer = createSwipeRecognizer({ canGo: () => true, scrolls: () => false });
    const at = (phase: string, deltaX: number, time: number) =>
      recognizer.scroll({
        phase,
        momentumPhase: "none",
        deltaX,
        deltaY: 0,
        swipeEnabled: true,
        timeStamp: time,
        x: 0,
        y: 0,
      } as TrackpadScroll);
    at("began", 0, 0);
    for (let i = 1; i <= 20; i++) at("changed", -10, i * 16);
    for (let i = 21; i <= 40; i++) at("changed", 10, i * 16);
    expect(at("ended", 0, 41 * 16)).toEqual({ type: "cancel" });
  });

  test("vertical scrolls, sideways scrollers, no history and the system setting leave it alone", () => {
    expect(touch(20, -4, { deltaY: 10 })).toEqual([]);
    expect(touch(20, -10, { scrolls: () => true })).toEqual([]);
    expect(touch(20, -10, { canGo: (d) => d === "forward" })).toEqual([]);
    expect(touch(20, -10, { swipeEnabled: false })).toEqual([]);
  });

  test("momentum alone never swipes, and a cancelled touch retracts", () => {
    expect(touch(0, -30, { end: "" })).toEqual([]);
    expect(last(touch(20, -10, { end: "cancelled" }))).toEqual({ type: "cancel" });
  });
});

describe("scrollsHorizontally", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function scroller(scrollLeft: number) {
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.append(inner);
    document.body.append(outer);
    Object.defineProperties(outer, {
      scrollWidth: { value: 500 },
      clientWidth: { value: 200 },
      scrollLeft: { value: scrollLeft },
    });
    return { outer, inner };
  }

  const auto = () => ({ overflowX: "auto", direction: "ltr" });

  test("scrolls unless already at the edge it moves towards", () => {
    const { inner } = scroller(0);
    expect(scrollsHorizontally(inner, -10, auto)).toBe(false);
    expect(scrollsHorizontally(inner, 10, auto)).toBe(true);
    const end = scroller(300);
    expect(scrollsHorizontally(end.inner, 10, auto)).toBe(false);
    expect(scrollsHorizontally(end.inner, -10, auto)).toBe(true);
  });

  test("overflow that does not scroll does not count", () => {
    const { inner } = scroller(100);
    expect(scrollsHorizontally(inner, 10, () => ({ overflowX: "hidden", direction: "ltr" }))).toBe(
      false,
    );
    expect(scrollsHorizontally(null, 10)).toBe(false);
  });
});
