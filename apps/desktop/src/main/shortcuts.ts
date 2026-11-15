// System-wide shortcuts (Electron `globalShortcut`), shared by every window. Each accelerator has
// one owner: a window (released when it closes) or the quick-capture shortcut the main process
// keeps. The OS API is injected so this runs in unit tests without Electron.
import { isAccelerator, PlatformError } from "@lydie/platform";

export type ShortcutBackend = {
  // Electron's `globalShortcut.register`: false when another app holds it. May throw on syntax
  // Electron rejects.
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
};

const QUICK_CAPTURE_OWNER = "quick-capture";

const ALIASES: Record<string, string> = {
  cmd: "command",
  ctrl: "control",
  cmdorctrl: "commandorcontrol",
  option: "alt",
  meta: "super",
};

// "Ctrl+Shift+K" and "shift+control+k" are the same shortcut.
export function acceleratorKey(accelerator: string): string {
  const parts = accelerator.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.map((p) => ALIASES[p] ?? p).sort();
  return [...modifiers, key].join("+");
}

type Held = { owner: string; accelerator: string; fire: () => void };

export class ShortcutRegistry {
  private readonly held = new Map<string, Held>();
  private quick: string | null = null;

  constructor(
    private readonly backend: ShortcutBackend,
    private readonly onQuickCapture: () => void,
  ) {}

  register(owner: string, accelerator: string, fire: () => void): boolean {
    if (!isAccelerator(accelerator)) {
      throw new PlatformError("invalid-argument", `Not a shortcut: ${accelerator}`);
    }
    const key = acceleratorKey(accelerator);
    if (this.held.has(key)) return false;
    let ok = false;
    try {
      ok = this.backend.register(accelerator, () => this.held.get(key)?.fire());
    } catch {
      ok = false;
    }
    if (ok) this.held.set(key, { owner, accelerator, fire });
    return ok;
  }

  unregister(owner: string, accelerator: string): void {
    const key = acceleratorKey(accelerator);
    const held = this.held.get(key);
    if (held?.owner !== owner) return;
    this.held.delete(key);
    this.backend.unregister(held.accelerator);
  }

  // Everything a window registered (it closed or reloaded).
  release(owner: string): void {
    for (const held of [...this.held.values()]) {
      if (held.owner === owner) this.unregister(owner, held.accelerator);
    }
  }

  quickCapture(): string | null {
    return this.quick;
  }

  // Switches the quick-capture shortcut; false (keeping the current one) when it is taken.
  setQuickCapture(accelerator: string | null): boolean {
    if (accelerator !== null && this.quick !== null) {
      if (acceleratorKey(accelerator) === acceleratorKey(this.quick)) return true;
    }
    if (accelerator !== null) {
      if (!this.register(QUICK_CAPTURE_OWNER, accelerator, () => this.onQuickCapture())) {
        return false;
      }
    }
    if (this.quick !== null) this.unregister(QUICK_CAPTURE_OWNER, this.quick);
    this.quick = accelerator;
    return true;
  }

  // Accelerators currently held (for tests and diagnostics).
  list(): { owner: string; accelerator: string }[] {
    return [...this.held.values()].map(({ owner, accelerator }) => ({ owner, accelerator }));
  }

  dispose(): void {
    for (const held of this.held.values()) this.backend.unregister(held.accelerator);
    this.held.clear();
    this.quick = null;
  }
}
