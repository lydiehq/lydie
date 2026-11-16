import { describe, expect, test } from "bun:test";

import { linkMode } from "./page-link.tsx";
import type { AppApi } from "./plugin.ts";

const app = (linkClicks: AppApi["linkClicks"]) =>
  ({
    linkClicks,
    modeFor: (g: { metaKey?: boolean; altKey?: boolean; button?: number }) =>
      g.button === 1 ? "tab" : g.metaKey && g.altKey ? "split" : g.metaKey ? "tab" : "replace",
  }) as unknown as AppApi;

const click = (
  extra: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {},
  button = 0,
) => ({
  button,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

describe("linkMode", () => {
  test("on the web only a plain left click is the app's", () => {
    const web = app("browser");
    expect(linkMode(web, click())).toBe("replace");
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(linkMode(web, click({ [key]: true }))).toBeNull();
    }
    expect(linkMode(web, click({}, 1))).toBeNull();
    expect(linkMode(web, click({}, 2))).toBeNull();
  });

  test("in the app every left and middle click is, as tabs and splits", () => {
    const desktop = app("app");
    expect(linkMode(desktop, click())).toBe("replace");
    expect(linkMode(desktop, click({ metaKey: true }))).toBe("tab");
    expect(linkMode(desktop, click({ metaKey: true, altKey: true }))).toBe("split");
    expect(linkMode(desktop, click({}, 1))).toBe("tab");
    expect(linkMode(desktop, click({}, 2))).toBeNull();
  });
});
