import { describe, expect, it } from "bun:test";

import { isAccelerator, QUICK_CAPTURE_ACTION } from "./shortcuts.ts";
import { createTestPlatform } from "./testing.ts";

describe("global shortcuts", () => {
  it("accepts Electron accelerators with at least one modifier", () => {
    for (const ok of [
      "CommandOrControl+Shift+Space",
      "Alt+F4",
      "Ctrl+/",
      "Shift+Plus",
      "Super+K",
    ]) {
      expect(isAccelerator(ok)).toBe(true);
    }
    for (const bad of [
      "",
      "Space",
      "Ctrl+Ctrl+A",
      "Foo+A",
      "Ctrl+",
      "Ctrl+Shift",
      "a".repeat(101),
    ]) {
      expect(isAccelerator(bad)).toBe(false);
    }
  });

  it("the test platform registers, refuses held ones and sends quick capture", async () => {
    const platform = createTestPlatform();
    const shortcuts = platform.shortcuts!;
    const actions: string[] = [];
    platform.menus.onAction((id) => actions.push(id));
    let pressed = 0;
    expect(await shortcuts.register("Alt+Shift+K", () => pressed++)).toBe(true);
    expect(await shortcuts.register("Alt+Shift+K", () => {})).toBe(false);
    expect(await shortcuts.register(String(await shortcuts.quickCapture()), () => {})).toBe(false);
    platform.test.takenShortcuts.add("Alt+Shift+T");
    expect(await shortcuts.register("Alt+Shift+T", () => {})).toBe(false);
    await expect(shortcuts.register("nope", () => {})).rejects.toMatchObject({
      code: "invalid-argument",
    });

    platform.test.globalShortcut("Alt+Shift+K");
    platform.test.globalShortcut("CommandOrControl+Shift+Space");
    expect(pressed).toBe(1);
    expect(actions).toEqual([QUICK_CAPTURE_ACTION]);

    expect(await shortcuts.setQuickCapture("Alt+Shift+K")).toBe(false);
    expect(await shortcuts.setQuickCapture(null)).toBe(true);
    await shortcuts.unregister("Alt+Shift+K");
    expect([...platform.test.globalShortcuts]).toEqual([]);
  });
});
