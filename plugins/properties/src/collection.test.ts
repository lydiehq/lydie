import { describe, expect, test } from "bun:test";

import type { DatabaseDefinition, DatabaseProperty } from "@lydie/plugin-api/databases";

import {
  adoptedProperty,
  canAdopt,
  catalogueOf,
  copiedConfig,
  describeEntry,
  strayEntries,
  suggest,
} from "./collection.ts";

const prop = (name: string, type: string, key = name, config = {}) =>
  ({ id: `id-${name}`, databaseId: "db", name, type, key, config }) as unknown as DatabaseProperty;

const properties = [
  prop("Name", "title", "name"),
  prop("Status", "select"),
  prop("Score", "formula"),
  prop("Created", "createdTime", "ctime"),
];

describe("keys a collection does not list", () => {
  test("are the page's keys no stored property uses", () => {
    expect(
      strayEntries(properties, { Status: "Todo", Mood: "ok", Score: 3, name: "x" }).map(([k]) => k),
    ).toEqual(["Mood", "Score", "name"]);
  });

  test("leave out page options", () => {
    expect(
      strayEntries(properties, { icon: "👋", "full-width": true, Mood: "ok" }).map(([k]) => k),
    ).toEqual(["Mood"]);
    expect(canAdopt("icon", properties)).toBe(false);
    expect(canAdopt("cover-position", properties)).toBe(false);
  });

  test("can be added unless the key is fixed, taken or reserved", () => {
    expect(canAdopt("Mood", properties)).toBe(true);
    // Formulas live in another namespace of the .base file.
    expect(canAdopt("Score", properties)).toBe(true);
    expect(canAdopt("name", properties)).toBe(false);
    expect(canAdopt("ctime", properties)).toBe(false);
    expect(canAdopt("Status", properties)).toBe(false);
    expect(canAdopt("file.name", properties)).toBe(false);
    expect(canAdopt(" padded", properties)).toBe(false);
  });

  test("keep their key and get the type their value implies", () => {
    expect(adoptedProperty("Due", "2026-01-01/2026-01-03")).toEqual({
      name: "Due",
      key: "Due",
      type: "date",
      config: { range: true },
    });
    expect(adoptedProperty("Tags", ["a", "a", "b"])).toEqual({
      name: "Tags",
      key: "Tags",
      type: "multiSelect",
      config: {
        options: [
          { name: "a", color: "default" },
          { name: "b", color: "default" },
        ],
      },
    });
    expect(adoptedProperty("Phone", "", "phone").type).toBe("phone");
  });
});

describe("the catalogue", () => {
  const def = (id: string, props: DatabaseProperty[]) =>
    ({ database: { id }, properties: props, views: [] }) as unknown as DatabaseDefinition;
  const entries = catalogueOf(
    [
      {
        title: "Projects",
        definition: def("p", [
          prop("Status", "status", "Status", {
            options: [{ id: "o1", name: "Todo", color: "gray", group: "todo" }],
          }),
          prop("Rating", "formula"),
        ]),
      },
      { title: "Tasks", definition: def("t", [prop("Start", "date"), prop("Status", "select")]) },
      { title: "Self", definition: def("self", [prop("Stage", "text")]) },
    ],
    "self",
  );

  test("lists copyable properties of other collections", () => {
    expect(entries.map((e) => `${e.collection}/${e.name}`)).toEqual([
      "Projects/Status",
      "Tasks/Start",
      "Tasks/Status",
    ]);
  });

  test("matches by name prefix and describes where a property comes from", () => {
    expect(suggest(entries, "")).toEqual([]);
    expect(suggest(entries, "sta").map(describeEntry)).toEqual([
      "Start · from Tasks · Date",
      "Status · from Projects · 1 option",
      "Status · from Tasks · Select",
    ]);
  });

  test("copies settings with new option ids", () => {
    expect(copiedConfig(entries[0]!)).toEqual({
      options: [{ name: "Todo", color: "gray", group: "todo" }],
    });
  });
});
