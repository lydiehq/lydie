import { afterEach, describe, expect, test } from "bun:test";

import type { AppApi } from "@lydie/plugin-api";

import { applyPreferences, PREFS } from "./preferences.ts";

// The parts of AppApi that applyPreferences uses.
function fakeApp() {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const schemes: string[] = [];
  const app = {
    storage: {
      get: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
      set(key: string, value: unknown) {
        values.set(key, value);
        for (const fn of listeners.get(key) ?? []) fn();
      },
      subscribe(key: string, fn: () => void) {
        const set = listeners.get(key) ?? new Set();
        set.add(fn);
        listeners.set(key, set);
        return () => set.delete(fn);
      },
    },
    setColorScheme: (scheme: string) => schemes.push(scheme),
  } as unknown as AppApi;
  return { app, schemes };
}

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.documentElement.className = "";
});

describe("applyPreferences", () => {
  test("the theme sets .dark on <html> and tells the shell, now and on change", () => {
    const { app, schemes } = fakeApp();
    app.storage.set(PREFS.theme, "dark");
    stops.push(applyPreferences(app));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(schemes).toEqual(["dark"]);

    app.storage.set(PREFS.theme, "light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("system")).toBe(false);
    expect(schemes.at(-1)).toBe("light");

    app.storage.set(PREFS.theme, "system");
    expect(document.documentElement.classList.contains("system")).toBe(true);
    expect(schemes.at(-1)).toBe("system");
  });

  test("defaults to light, even when the system is dark", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("dark"),
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const { app, schemes } = fakeApp();
      stops.push(applyPreferences(app));
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(schemes).toEqual(["light"]);
    } finally {
      window.matchMedia = original;
    }
  });
});
