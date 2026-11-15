// Two-finger trackpad swipes to go back and forward, as in Safari and Chrome. The platform reports
// each scroll event with its finger phase (`platform.trackpad`), which wheel events lack, so a
// swipe is one touch of the fingers: it counts when its first movement is clearly horizontal and
// nothing under the pointer scrolls that way, the arrow follows the fingers, and lifting them
// decides. Past SWIPE_DISTANCE, or after a quick flick, it navigates; otherwise the arrow retracts.
// Momentum after the lift is never part of a swipe.
//
// The direction follows the content, as in Chrome: scrolling left past the start goes back. With
// natural scrolling that is fingers moving right; without it, fingers moving left.
import type { TrackpadScroll } from "@lydie/platform";

export type SwipeDirection = "back" | "forward";

export type SwipeFrame =
  // `progress`: travel over SWIPE_DISTANCE, 1 and above once lifting would navigate.
  | { type: "progress"; direction: SwipeDirection; progress: number }
  | { type: "commit"; direction: SwipeDirection }
  | { type: "cancel" };

export type SwipeRecognizerOptions = {
  canGo: (direction: SwipeDirection) => boolean;
  // Something at the point (CSS pixels) would scroll horizontally by `deltaX`.
  scrolls: (x: number, y: number, deltaX: number) => boolean;
};

// Movement before the axis is decided, and how much more horizontal than vertical it must be.
const LOCK_DISTANCE = 8;
const AXIS_RATIO = 1.3;
// Travel at which lifting the fingers navigates.
export const SWIPE_DISTANCE = 140;
// A shorter swipe still navigates when the fingers were this fast over the last FLICK_WINDOW_MS
// before lifting (px/ms) and travelled at least FLICK_DISTANCE.
const FLICK_DISTANCE = 50;
const FLICK_VELOCITY = 0.8;
const FLICK_WINDOW_MS = 100;

export function createSwipeRecognizer({ canGo, scrolls }: SwipeRecognizerOptions) {
  let state: "idle" | "pending" | "tracking" = "idle";
  let sumX = 0;
  let sumY = 0;
  let direction: SwipeDirection = "back";
  let travel = 0;
  let samples: { time: number; travel: number }[] = [];

  const reset = () => {
    state = "idle";
    sumX = 0;
    sumY = 0;
    travel = 0;
    samples = [];
  };

  // Over the movement in the last FLICK_WINDOW_MS before `now`: fingers that rested before lifting
  // have none.
  const velocity = (now: number) => {
    const recent = samples.filter((s) => s.time >= now - FLICK_WINDOW_MS);
    const first = recent[0];
    const latest = recent.at(-1);
    if (!first || !latest || latest.time <= first.time) return 0;
    return (latest.travel - first.travel) / (latest.time - first.time);
  };

  const end = (event: TrackpadScroll): SwipeFrame | null => {
    const wasTracking = state === "tracking";
    const flick = travel >= FLICK_DISTANCE && velocity(event.timeStamp) >= FLICK_VELOCITY;
    const commit = wasTracking && (travel >= SWIPE_DISTANCE || flick);
    const go = direction;
    reset();
    if (commit) return { type: "commit", direction: go };
    return wasTracking ? { type: "cancel" } : null;
  };

  return {
    scroll(event: TrackpadScroll): SwipeFrame | null {
      // Momentum belongs to whatever the fingers did before lifting.
      if (event.momentumPhase !== "none") return null;
      switch (event.phase) {
        case "began":
          reset();
          if (!event.swipeEnabled) return null;
          state = "pending";
          break;
        case "changed":
          break;
        case "ended":
          return end(event);
        case "cancelled": {
          const wasTracking = state === "tracking";
          reset();
          return wasTracking ? { type: "cancel" } : null;
        }
        // Fingers resting ("stationary") hold the arrow where it is.
        default:
          return null;
      }

      if (state === "pending") {
        sumX += event.deltaX;
        sumY += event.deltaY;
        if (Math.abs(sumX) + Math.abs(sumY) < LOCK_DISTANCE) return null;
        direction = sumX < 0 ? "back" : "forward";
        if (
          Math.abs(sumX) < Math.abs(sumY) * AXIS_RATIO ||
          !canGo(direction) ||
          scrolls(event.x, event.y, sumX)
        ) {
          // A scroll, for the rest of this touch.
          state = "idle";
          return null;
        }
        state = "tracking";
        travel = Math.abs(sumX);
      } else if (state === "tracking") {
        travel = Math.max(0, travel + (direction === "back" ? -event.deltaX : event.deltaX));
      } else {
        return null;
      }

      samples.push({ time: event.timeStamp, travel });
      if (samples.length > 32) samples.shift();
      return { type: "progress", direction, progress: travel / SWIPE_DISTANCE };
    },
  };
}

type ScrollStyle = (element: Element) => { overflowX: string; direction: string };

// Whether `target` or an ancestor would scroll horizontally by `deltaX`: it overflows, allows
// scrolling and is not already at that edge.
export function scrollsHorizontally(
  target: EventTarget | null,
  deltaX: number,
  style: ScrollStyle = (element) => getComputedStyle(element),
): boolean {
  let element = target instanceof Element ? target : null;
  while (element) {
    const max = element.scrollWidth - element.clientWidth;
    if (max > 1) {
      const { overflowX, direction } = style(element);
      // Text fields scroll their text whatever their overflow style says.
      if (overflowX === "auto" || overflowX === "scroll" || element.matches("input, textarea")) {
        // In right-to-left boxes scrollLeft runs from 0 down to -max.
        const left = direction === "rtl" ? max + element.scrollLeft : element.scrollLeft;
        if (deltaX < 0 ? left > 1 : left < max - 1) return true;
      }
    }
    element = element.parentElement;
  }
  return false;
}
