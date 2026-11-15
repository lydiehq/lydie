import { describe, expect, test } from "bun:test";

import { freeKey, inferType, initialValue, pageProperty, retype } from "./infer.ts";

describe("page property types", () => {
  test("read from the value", () => {
    expect(inferType(true)).toBe("checkbox");
    expect(inferType(3)).toBe("number");
    expect(inferType(["a"])).toBe("multiSelect");
    expect(inferType("2026-11-13")).toBe("date");
    expect(inferType("2026-11-13T09:30/2026-11-14T10:00")).toBe("date");
    expect(inferType("https://lydie.co")).toBe("url");
    expect(inferType("me@lydie.co")).toBe("email");
    expect(inferType("hello")).toBe("text");
  });

  test("an empty value keeps the type the user chose", () => {
    expect(inferType(null, "number")).toBe("number");
    expect(inferType("", "date")).toBe("date");
    expect(inferType(null, "relation")).toBe("text");
    expect(inferType("2026-11-13", "text")).toBe("text");
  });

  test("ranges turn on end dates", () => {
    expect(pageProperty("When", "2026-11-13/2026-11-14").config.range).toBe(true);
  });

  test("changing type converts the value", () => {
    expect(retype("12 apples", "text", "number")).toBe(12);
    expect(retype("a, b", "text", "multiSelect")).toEqual(["a", "b"]);
    expect(retype("yes", "text", "checkbox")).toBe(true);
    expect(retype(null, "text", "checkbox")).toBe(false);
    expect(initialValue("multiSelect")).toEqual([]);
  });

  test("new keys do not clash", () => {
    expect(freeKey(["Status", "status 2"], "Status")).toBe("Status 3");
    expect(freeKey([], "Tags")).toBe("Tags");
  });
});
