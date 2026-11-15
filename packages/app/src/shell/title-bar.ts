import type { Platform, WindowState } from "@lydie/platform";
import { useSyncExternalStore } from "react";

export type TitleBarInset = {
  // Whether the window has no native title bar and the app draws a drag region.
  custom: boolean;
  // Height of the title-bar row (0 with a native frame).
  height: number;
  // Left space for the OS window buttons, given to whichever element is leftmost in the top row:
  // the sidebar when it is open, otherwise the content header. 0 on the web, with native frames
  // and in full screen.
  left: number;
  right: number;
};

// The icon buttons of the top row (sidebar and panel toggles, back and forward, new tab): a
// squircle where the browser draws one, which takes a larger radius than a round corner to look
// slightly rounder; elsewhere a plain rounded square.
export const topRowButtonClass =
  "[--button-radius:var(--radius-lg)] supports-[corner-shape:squircle]:[--button-radius:0.875rem] supports-[corner-shape:squircle]:[corner-shape:squircle]";

const NONE: TitleBarInset = { custom: false, height: 0, left: 0, right: 0 };
const cache = new WeakMap<WindowState, TitleBarInset>();

export function titleBarInset(platform: Platform, state: WindowState): TitleBarInset {
  if (!platform.capabilities.customTitleBar || state.titleBar.style === "native") return NONE;
  let inset = cache.get(state);
  if (!inset) {
    inset = {
      custom: true,
      height: state.titleBar.height,
      left: state.fullscreen ? 0 : state.titleBar.insetLeft,
      right: state.fullscreen ? 0 : state.titleBar.insetRight,
    };
    cache.set(state, inset);
  }
  return inset;
}

// Title-bar metrics from the platform; shell components never check the OS themselves.
export function useTitleBarInset(platform: Platform): TitleBarInset {
  const subscribe = (listener: () => void) => platform.windows.onStateChange(() => listener());
  const get = () => titleBarInset(platform, platform.windows.state());
  return useSyncExternalStore(subscribe, get, get);
}

// Inline style for a drag region (Electron); interactive children use `noDrag`.
export const dragStyle = { WebkitAppRegion: "drag" } as Record<string, string>;
export const noDragStyle = { WebkitAppRegion: "no-drag" } as Record<string, string>;
