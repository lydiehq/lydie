import { describe, expect, it } from "bun:test";

import { acceleratorKey, ShortcutRegistry } from "./shortcuts.ts";
import type { ShortcutBackend } from "./shortcuts.ts";

function fakeBackend(taken: string[] = []) {
  const held = new Map<string, () => void>();
  const backend: ShortcutBackend = {
    register(accelerator, callback) {
      if (taken.includes(accelerator) || held.has(accelerator)) return false;
      held.set(accelerator, callback);
      return true;
    },
    unregister(accelerator) {
      held.delete(accelerator);
    },
  };
  const press = (accelerator: string) => held.get(accelerator)?.();
  return { backend, held, press };
}

describe("ShortcutRegistry", () => {
  it("routes presses to their owner and refuses held accelerators", () => {
    const os = fakeBackend(["Alt+Shift+T"]);
    const registry = new ShortcutRegistry(os.backend, () => {});
    const pressed: string[] = [];
    expect(registry.register("w1", "Alt+Shift+K", () => pressed.push("w1"))).toBe(true);
    // The same shortcut spelled differently, from another window.
    expect(registry.register("w2", "shift+option+k", () => pressed.push("w2"))).toBe(false);
    // Another app holds it.
    expect(registry.register("w2", "Alt+Shift+T", () => {})).toBe(false);
    expect(() => registry.register("w2", "Space", () => {})).toThrow(/Not a shortcut/);
    os.press("Alt+Shift+K");
    expect(pressed).toEqual(["w1"]);
    // Only the owner can unregister.
    registry.unregister("w2", "Alt+Shift+K");
    expect(os.held.has("Alt+Shift+K")).toBe(true);
    registry.release("w1");
    expect(os.held.size).toBe(0);
  });

  it("switches the quick-capture shortcut, keeping the old one when the new one is taken", () => {
    const os = fakeBackend(["Alt+Shift+T"]);
    let captures = 0;
    const registry = new ShortcutRegistry(os.backend, () => captures++);
    expect(registry.setQuickCapture("CommandOrControl+Shift+Space")).toBe(true);
    os.press("CommandOrControl+Shift+Space");
    expect(captures).toBe(1);
    expect(registry.setQuickCapture("Alt+Shift+T")).toBe(false);
    expect(registry.quickCapture()).toBe("CommandOrControl+Shift+Space");
    expect(registry.register("w1", "CmdOrCtrl+Shift+Space", () => {})).toBe(false);
    expect(registry.setQuickCapture("Alt+Shift+C")).toBe(true);
    expect([...os.held.keys()]).toEqual(["Alt+Shift+C"]);
    expect(registry.setQuickCapture(null)).toBe(true);
    expect(os.held.size).toBe(0);
    registry.setQuickCapture("Alt+Shift+C");
    registry.register("w1", "Alt+Shift+K", () => {});
    registry.dispose();
    expect(os.held.size).toBe(0);
  });

  it("normalises modifier spelling and order", () => {
    expect(acceleratorKey("Ctrl+Shift+K")).toBe(acceleratorKey("shift+control+k"));
    expect(acceleratorKey("CmdOrCtrl+K")).toBe(acceleratorKey("CommandOrControl+K"));
    expect(acceleratorKey("Alt+K")).not.toBe(acceleratorKey("Shift+K"));
  });
});
