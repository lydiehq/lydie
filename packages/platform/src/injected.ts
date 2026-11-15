import type { Platform } from "./types.ts";

// Global under which a shell that loads the shared web bundle (the Electron preload) exposes its
// `Platform` before any page script runs.
export const INJECTED_PLATFORM_KEY = "lydiePlatform";

// The platform a native shell injected, or null in a plain browser.
export function getInjectedPlatform(): Platform | null {
  const value = (globalThis as Record<string, unknown>)[INJECTED_PLATFORM_KEY];
  return value && typeof value === "object" ? (value as Platform) : null;
}
