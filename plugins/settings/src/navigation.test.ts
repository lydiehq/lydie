import { describe, expect, test } from "bun:test";

import {
  groupPages,
  orderedPages,
  parseSettingsPath,
  resolvePage,
  searchPages,
  settingsPath,
} from "./navigation.ts";
import type { PageEntry } from "./navigation.ts";
import { bindingOf, conflictsOf, isUsableBinding, normaliseBinding } from "./shortcuts.ts";

const page = (id: string, extra: Partial<PageEntry> = {}): PageEntry => ({
  id,
  title: id[0]!.toUpperCase() + id.slice(1),
  pluginId: "p",
  ...extra,
});

const pages = [
  page("about", { group: "App", order: 90 }),
  page("members", { group: "Team", order: 10, keywords: ["people", "roles"] }),
  page("shortcuts", { order: 20, description: "Change the keys" }),
  page("general", { order: 10 }),
  page("plugins", { group: "App", order: 10 }),
  page("connections", { group: "Integrations" }),
  page("custom", { group: "Zebra" }),
];

describe("settings navigation", () => {
  test("groups pages in the fixed group order, then by order and title", () => {
    expect(groupPages(pages).map((g) => [g.title, g.pages.map((p) => p.id)])).toEqual([
      ["General", ["general", "shortcuts"]],
      ["Team", ["members"]],
      ["Integrations", ["connections"]],
      ["App", ["plugins", "about"]],
      ["Zebra", ["custom"]],
    ]);
  });

  test("search matches titles first, and descriptions, groups and keywords", () => {
    expect(searchPages(pages, "").map((p) => p.id)).toEqual(orderedPages(pages).map((p) => p.id));
    expect(searchPages(pages, "roles").map((p) => p.id)).toEqual(["members"]);
    expect(searchPages(pages, "keys").map((p) => p.id)).toEqual(["shortcuts"]);
    expect(searchPages(pages, "app").map((p) => p.id)).toEqual(["plugins", "about"]);
    expect(searchPages(pages, "nothing here")).toEqual([]);
  });

  test("an unknown or missing page id falls back to the first page", () => {
    expect(resolvePage(pages, "members")?.id).toBe("members");
    expect(resolvePage(pages, "gone")?.id).toBe("general");
    expect(resolvePage(pages, null)?.id).toBe("general");
    expect(resolvePage([], "x")).toBeNull();
  });

  test("parses and builds deep links below the app's base", () => {
    expect(parseSettingsPath("settings")).toEqual({ page: null, path: null });
    expect(parseSettingsPath("settings/team/")).toEqual({ page: "team", path: null });
    expect(parseSettingsPath("settings/team/members/u%201")).toEqual({
      page: "team",
      path: "members/u 1",
    });
    expect(parseSettingsPath("")).toBeNull();
    expect(parseSettingsPath("s/token")).toBeNull();
    expect(parseSettingsPath("p/files/settings")).toBeNull();
    expect(parseSettingsPath("settings/%E0%A4%A")).toBeNull();
    expect(settingsPath("team", "members/u 1")).toBe("settings/team/members/u%201");
    expect(settingsPath("general", null)).toBe("settings/general");
    expect(settingsPath(null, null)).toBe("settings");
  });
});

describe("shortcut recording", () => {
  const key = (k: Partial<KeyboardEvent>) =>
    ({
      key: "",
      code: "",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...k,
    }) as KeyboardEvent;

  test("records keys as bindings", () => {
    expect(bindingOf(key({ key: "k", code: "KeyK", metaKey: true }), true)).toBe("Mod+K");
    expect(bindingOf(key({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }), false)).toBe(
      "Mod+Shift+K",
    );
    expect(bindingOf(key({ key: "Meta", code: "MetaLeft", metaKey: true }), true)).toBeNull();
    expect(bindingOf(key({ key: "F2", code: "F2" }), true)).toBe("F2");
  });

  test("finds commands already using a binding, in any spelling", () => {
    const commands = [
      {
        id: "a",
        title: "A",
        group: null,
        keybindings: ["Mod+Shift+K"],
        bindable: true,
        source: "plugin",
        scope: null,
        enabled: true,
      },
      {
        id: "b",
        title: "B",
        group: null,
        keybindings: ["Mod+B"],
        bindable: true,
        source: "plugin",
        scope: null,
        enabled: true,
      },
    ] as const;
    expect(conflictsOf([...commands], "Shift+Mod+k", "b").map((c) => c.id)).toEqual(["a"]);
    expect(conflictsOf([...commands], "Mod+Shift+K", "a")).toEqual([]);
    expect(normaliseBinding("mod+shift+k")).toBe(normaliseBinding("Shift+Mod+K"));
  });

  test("bare characters are not usable bindings", () => {
    expect(isUsableBinding("K")).toBe(false);
    expect(isUsableBinding("F2")).toBe(true);
    expect(isUsableBinding("Alt+K")).toBe(true);
  });
});
