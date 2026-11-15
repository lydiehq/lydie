// The trackpad addon (native/trackpad.mm): scroll events with their phases, which Chromium drops
// before the page sees them. macOS only; null elsewhere or when the addon was not built.
import { createRequire } from "node:module";
import { join, sep } from "node:path";

import type { ScrollPhase, TrackpadScroll } from "@lydie/platform";

// What the addon reports, in AppKit's terms: points, and scrollingDelta positive left/up.
export type NativeScroll = {
  phase: ScrollPhase;
  momentumPhase: ScrollPhase;
  scrollingDeltaX: number;
  scrollingDeltaY: number;
  x: number;
  y: number;
  timeStamp: number;
  inverted: boolean;
  swipeEnabled: boolean;
};

// CGScrollPhase / CGMomentumScrollPhase values, for `simulate`.
export type SimulatedScroll = {
  phase: number;
  momentumPhase: number;
  deltaX: number;
  deltaY: number;
};

export type TrackpadAddon = {
  observe(windowHandle: Buffer, listener: (event: NativeScroll) => void): number;
  unobserve(id: number): void;
  simulate(windowHandle: Buffer, events: SimulatedScroll[]): void;
};

// `mainDir`: the main bundle's directory (out/main), two levels below the addon's native/build;
// a packaged app loads it from app.asar.unpacked.
export function loadTrackpad(mainDir: string): TrackpadAddon | null {
  if (process.platform !== "darwin") return null;
  const path = join(mainDir, "..", "..", "native", "build", "trackpad.node").replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  );
  try {
    return createRequire(import.meta.url)(path) as TrackpadAddon;
  } catch (error) {
    console.warn(
      "[lydie] trackpad addon unavailable, no two-finger swipes:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// In the page's terms: CSS pixels at `zoom`, and deltas as a wheel event's (positive right/down).
export function toTrackpadScroll(event: NativeScroll, zoom: number): TrackpadScroll {
  return {
    phase: event.phase,
    momentumPhase: event.momentumPhase,
    deltaX: -event.scrollingDeltaX / zoom,
    deltaY: -event.scrollingDeltaY / zoom,
    swipeEnabled: event.swipeEnabled,
    timeStamp: event.timeStamp,
    x: event.x / zoom,
    y: event.y / zoom,
  };
}
