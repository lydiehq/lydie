import { describe, expect, test } from "bun:test";

import {
  firesInText,
  formatKeybinding,
  fuzzyRanges,
  fuzzyScore,
  isBareKey,
  isBrowserShortcut,
  keyCaps,
  keySequence,
  matchesKeybinding,
} from "./index.ts";

const key = (init: Partial<KeyboardEvent> & { key: string }) => ({
  code: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...init,
});

describe("keybindings", () => {
  test("Mod is Cmd on macOS and Ctrl elsewhere", () => {
    expect(matchesKeybinding(key({ key: "o", code: "KeyO", metaKey: true }), "Mod+O", true)).toBe(
      true,
    );
    expect(matchesKeybinding(key({ key: "o", code: "KeyO", ctrlKey: true }), "Mod+O", true)).toBe(
      false,
    );
    expect(matchesKeybinding(key({ key: "o", code: "KeyO", ctrlKey: true }), "Mod+O", false)).toBe(
      true,
    );
    expect(
      matchesKeybinding(
        key({ key: "O", code: "KeyO", metaKey: true, shiftKey: true }),
        "Mod+O",
        true,
      ),
    ).toBe(false);
  });

  test("layout-independent letters, brackets and backslash", () => {
    expect(
      matchesKeybinding(key({ key: "å", code: "BracketLeft", metaKey: true }), "Mod+[", true),
    ).toBe(true);
    expect(
      matchesKeybinding(key({ key: "\\", code: "Backslash", ctrlKey: true }), "Mod+\\", false),
    ).toBe(true);
    expect(
      matchesKeybinding(
        key({ key: "ß", code: "KeyS", altKey: true, metaKey: true }),
        "Mod+Alt+S",
        true,
      ),
    ).toBe(true);
  });

  test("off macOS Ctrl and Mod are the same key", () => {
    const ctrlTab = key({ key: "Tab", code: "Tab", ctrlKey: true });
    expect(matchesKeybinding(ctrlTab, "Ctrl+Tab", false)).toBe(true);
    expect(matchesKeybinding(ctrlTab, "Ctrl+Tab", true)).toBe(true);
    expect(matchesKeybinding(key({ key: "Tab", code: "Tab" }), "Ctrl+Tab", false)).toBe(false);
  });

  test("the browser's own shortcuts, per platform", () => {
    expect(isBrowserShortcut("Mod+T", true)).toBe(true);
    expect(isBrowserShortcut("mod+shift+t", false)).toBe(true);
    expect(isBrowserShortcut("Ctrl+Shift+I", false)).toBe(true);
    expect(isBrowserShortcut("Mod+[", true)).toBe(true);
    expect(isBrowserShortcut("Mod+[", false)).toBe(false);
    expect(isBrowserShortcut("Mod+K", true)).toBe(false);
    expect(isBrowserShortcut("Mod+Alt+N", false)).toBe(false);
    const devTools = key({ key: "I", code: "KeyI", ctrlKey: true, shiftKey: true });
    expect(isBrowserShortcut(devTools, false)).toBe(true);
    expect(isBrowserShortcut(key({ key: "k", code: "KeyK", metaKey: true }), true)).toBe(false);
  });

  test("formatting and text-field rules", () => {
    expect(formatKeybinding("Mod+Shift+P", true)).toBe("⇧⌘P");
    expect(formatKeybinding("Mod+Shift+P", false)).toBe("Ctrl+Shift+P");
    expect(firesInText("Mod+O")).toBe(true);
    expect(firesInText("Delete")).toBe(false);
  });

  test("sequences: G then H", () => {
    expect(keySequence("G H")).toEqual(["G", "H"]);
    expect(keySequence("Mod+Shift+P")).toEqual(["Mod+Shift+P"]);
    expect(formatKeybinding("G H", true)).toBe("G then H");
    expect(keyCaps("G H", true)).toEqual([["G"], ["H"]]);
    expect(keyCaps("Mod+Shift+P", true)).toEqual([["⇧", "⌘", "P"]]);
    expect(keyCaps("Mod+Shift+P", false)).toEqual([["Ctrl", "Shift", "P"]]);
    expect(firesInText("G H")).toBe(false);
  });

  test("bare keys: letters and the characters they type", () => {
    expect(isBareKey("C")).toBe(true);
    expect(isBareKey("?")).toBe(true);
    expect(isBareKey("G H")).toBe(true);
    expect(isBareKey("Shift+X")).toBe(true);
    expect(isBareKey("Mod+K")).toBe(false);
    expect(isBareKey("Escape")).toBe(false);
    // "?" takes Shift on most layouts, and none on some: the character decides.
    expect(matchesKeybinding(key({ key: "?", code: "Slash", shiftKey: true }), "?", true)).toBe(
      true,
    );
    expect(matchesKeybinding(key({ key: "?", code: "Minus", shiftKey: true }), "?", false)).toBe(
      true,
    );
    expect(matchesKeybinding(key({ key: "/", code: "Slash" }), "?", true)).toBe(false);
    expect(matchesKeybinding(key({ key: "?", code: "Slash", metaKey: true }), "?", true)).toBe(
      false,
    );
    // With a modifier Shift still counts.
    expect(
      matchesKeybinding(
        key({ key: "[", code: "BracketLeft", metaKey: true, shiftKey: true }),
        "Mod+[",
        true,
      ),
    ).toBe(false);
    expect(matchesKeybinding(key({ key: "c", code: "KeyC" }), "C", true)).toBe(true);
    expect(matchesKeybinding(key({ key: "C", code: "KeyC", shiftKey: true }), "C", true)).toBe(
      false,
    );
  });
});

describe("fuzzy", () => {
  test("ranks exact, prefix, substring, subsequence", () => {
    const score = (q: string, t: string) => fuzzyScore(q, t) ?? -Infinity;
    expect(score("road", "road")).toBeGreaterThan(score("road", "roadmap"));
    expect(score("road", "roadmap")).toBeGreaterThan(score("road", "quarterly roadmap"));
    expect(score("road", "quarterly roadmap")).toBeGreaterThan(score("rdmp", "quarterly roadmap"));
    expect(fuzzyScore("xyz", "roadmap")).toBeNull();
    expect(fuzzyRanges("map", "roadmap")).toEqual([[4, 7]]);
  });
});
