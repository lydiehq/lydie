import { describe, expect, it } from "bun:test";

import { fromBase, toBase } from "./base-file.ts";
import { DatabaseConfig, PropertyConfig, ViewConfig } from "./entities.ts";
import type { PropertyInput } from "./entities.ts";
import { conditionExpr, exprCondition } from "./filters.ts";
import { groupable, operatorsFor, sortable } from "./types.ts";
import {
  checkValue,
  convertValue,
  formatUniqueId,
  parseUniqueId,
  splitUniqueId,
} from "./values.ts";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
let next = 500;
const newId = () => id(next++);

const ISSUE_ID = {
  id: id(2),
  name: "ID",
  type: "uniqueId",
  key: "ID",
  config: { prefix: "LYD" },
} as const;

describe("uniqueId values", () => {
  it("formats and parses ids", () => {
    expect(formatUniqueId(12, "LYD")).toBe("LYD-12");
    expect(formatUniqueId(12)).toBe("12");
    expect(formatUniqueId(12, null)).toBe("12");
    for (const v of ["LYD-12", "lyd-12", " LYD-12 ", "12", 12])
      expect(parseUniqueId(v, "LYD")).toBe(12);
    expect(parseUniqueId("12")).toBe(12);
    // A prefix must match the property's; without one only the number reads.
    expect(parseUniqueId("ABC-12", "LYD")).toBeNull();
    expect(parseUniqueId("LYD-12")).toBeNull();
    for (const v of [0, -1, 1.5, "0", "LYD-", "LYD-1.5", "", Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseUniqueId(v, "LYD")).toBeNull();
    }
    expect(splitUniqueId(" lyd-7 ")).toEqual({ prefix: "lyd", n: 7 });
    expect(splitUniqueId("LYD 7")).toBeNull();
    expect(splitUniqueId("7")).toBeNull();
    expect(splitUniqueId("LYD-0")).toBeNull();
  });

  it("checks values: positive whole numbers or the id as shown", () => {
    expect(checkValue(ISSUE_ID, 3)).toEqual({ ok: true, value: 3 });
    expect(checkValue(ISSUE_ID, "LYD-3")).toEqual({ ok: true, value: 3 });
    expect(checkValue(ISSUE_ID, "3")).toEqual({ ok: true, value: 3 });
    expect(checkValue(ISSUE_ID, null)).toEqual({ ok: true, value: null });
    for (const bad of [0, 2.5, "ABC-3", "three", true, ["3"]]) {
      expect(checkValue(ISSUE_ID, bad).ok).toBe(false);
    }
    expect(checkValue({ type: "uniqueId", config: {} }, "LYD-3").ok).toBe(false);
  });

  it("converts between uniqueId and other types", () => {
    expect(convertValue(12, "uniqueId", "number")).toBe(12);
    expect(convertValue(12, "uniqueId", "text")).toBe("12");
    expect(convertValue("12", "text", "uniqueId")).toBe(12);
    expect(convertValue("abc", "text", "uniqueId")).toBeNull();
  });

  it("filters like a number, never groups", () => {
    expect(operatorsFor("uniqueId")).toEqual(operatorsFor("number"));
    expect(groupable("uniqueId")).toBe(false);
    expect(sortable("uniqueId")).toBe(true);
  });

  it("validates the prefix", () => {
    expect(PropertyConfig.parse({ prefix: " LYD " }).prefix).toBe("LYD");
    expect(PropertyConfig.parse({ prefix: "" }).prefix).toBe("");
    for (const bad of ["1AB", "LY-D", "L Y", "A".repeat(17)]) {
      expect(PropertyConfig.safeParse({ prefix: bad }).success).toBe(false);
    }
  });

  it("round-trips through a .base file and its filters", () => {
    const title = { id: id(1), name: "Name", type: "title", key: "name", config: {} } as const;
    const properties: PropertyInput[] = [title, ISSUE_ID];
    const config = DatabaseConfig.parse({});
    const filter = {
      type: "condition",
      propertyId: ISSUE_ID.id,
      op: "gte",
      value: 10,
    } as const;
    const def = {
      id: id(99),
      config,
      properties,
      views: [
        {
          id: id(30),
          name: "All",
          type: "table" as const,
          config: ViewConfig.parse({
            filter,
            sorts: [{ propertyId: ISSUE_ID.id, direction: "desc" }],
          }),
        },
      ],
    };
    const text = toBase(def, { folder: "Issues" });
    const read = fromBase(text, { newId });
    expect(read.warnings).toEqual([]);
    expect(read.definition.properties).toEqual(properties);
    expect(toBase({ id: def.id, ...read.definition }, { folder: "Issues" })).toBe(text);

    const mapping = { properties: [title, ISSUE_ID] };
    const expr = conditionExpr(filter, mapping);
    expect(expr).not.toBeNull();
    expect(exprCondition(expr!, mapping)).toEqual(filter);
  });
});
