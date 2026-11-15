import { describe, expect, test } from "bun:test";

import { menuGroups } from "./PageMenu.tsx";

const item = (id: string, group?: string, order?: number) => ({
  id,
  def: {
    id,
    pluginId: "p",
    label: id,
    run: () => {},
    ...(group ? { group } : {}),
    ...(order !== undefined ? { order } : {}),
  },
});

describe("menuGroups", () => {
  test("groups follow their first item's order, items their own", () => {
    const groups = menuGroups([
      item("collection", "database", 20),
      item("stop-template", "database", 20),
      item("move", "move", 50),
      item("share", "share", 10),
      item("template", "new", 15),
    ]);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([
      ["share"],
      ["template"],
      ["collection", "stop-template"],
      ["move"],
    ]);
  });

  test("an item without a group stands alone", () => {
    const groups = menuGroups([item("a"), item("b")]);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([["a"], ["b"]]);
  });
});
