import { describe, expect, test } from "bun:test";

import { acceleratorOf, formatAccelerator } from "./GlobalShortcut.tsx";

const key = (
  k: string,
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) => ({
  key: k,
  code,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("global shortcut keys", () => {
  test("keydowns become Electron accelerators", () => {
    expect(acceleratorOf(key(" ", "Space", { meta: true, shift: true }))).toBe(
      "CommandOrControl+Shift+Space",
    );
    expect(acceleratorOf(key("π", "KeyP", { ctrl: true, alt: true }))).toBe(
      "CommandOrControl+Alt+P",
    );
    expect(acceleratorOf(key("1", "Digit1", { meta: true }))).toBe("CommandOrControl+1");
    // A lone modifier, or a key without one, is not a global shortcut.
    expect(acceleratorOf(key("Shift", "ShiftLeft", { shift: true }))).toBeNull();
    expect(acceleratorOf(key("a", "KeyA"))).toBeNull();
  });

  test("shown per platform", () => {
    expect(formatAccelerator("CommandOrControl+Shift+Space", true)).toBe("⌘⇧Space");
    expect(formatAccelerator("CommandOrControl+Shift+Space", false)).toBe("Ctrl+Shift+Space");
  });
});
