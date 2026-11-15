import { describe, expect, it } from "bun:test";

import { isPlatformError } from "./errors.ts";
import {
  baseName,
  isPortableName,
  isWithin,
  joinPath,
  normalizePath,
  parentPath,
} from "./paths.ts";

describe("normalizePath", () => {
  it.each([
    ["", ""],
    [".", ""],
    ["notes/a.md", "notes/a.md"],
    ["./notes//a.md/", "notes/a.md"],
    ["notes/a:b.md", "notes/a:b.md"],
    ["...md", "...md"],
  ])("accepts %j as %j", (input, output) => {
    expect(normalizePath(input)).toBe(output);
  });

  it.each([
    "../x",
    "notes/../../x",
    "notes/..",
    "/etc/passwd",
    "C:/Windows",
    "c:x",
    "notes\\..\\x",
    "a\0b",
  ])("rejects %j", (input) => {
    let caught: unknown;
    try {
      normalizePath(input);
    } catch (error) {
      caught = error;
    }
    expect(isPlatformError(caught, "invalid-path")).toBe(true);
  });
});

describe("path helpers", () => {
  it("joins, splits and compares", () => {
    expect(joinPath("notes", "", "a.md")).toBe("notes/a.md");
    expect(parentPath("notes/a.md")).toBe("notes");
    expect(parentPath("a.md")).toBe("");
    expect(baseName("notes/a.md")).toBe("a.md");
    expect(isWithin("notes", "notes/a.md")).toBe(true);
    expect(isWithin("notes", "notes2/a.md")).toBe(false);
    expect(isWithin("", "anything")).toBe(true);
  });

  it("flags names some OS cannot store", () => {
    expect(isPortableName("Meeting notes.md")).toBe(true);
    for (const name of [
      "a:b",
      "con",
      "CON.md",
      "x?",
      "trailing.",
      "trailing ",
      "",
      "..",
      "a\u0001",
    ]) {
      expect(isPortableName(name)).toBe(false);
    }
  });
});
