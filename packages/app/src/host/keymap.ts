import type { DeviceStorage } from "./stores.ts";

// User keybindings per device: an override per command id replaces its defaults ([] unbinds).
export type Keymap = {
  bindings(commandId: string, defaults?: string | readonly string[]): readonly string[];
  set(commandId: string, bindings: readonly string[] | null): void;
  overrides(): Readonly<Record<string, readonly string[]>>;
  subscribe(listener: () => void): () => void;
};

const KEY = "keymap";

export function createKeymap(storage: DeviceStorage): Keymap {
  let overrides: Record<string, readonly string[]> = storage.get(KEY) ?? {};
  const listeners = new Set<() => void>();
  const cache = new Map<string, readonly string[]>();
  return {
    bindings(commandId, defaults) {
      const override = overrides[commandId];
      if (override) return override;
      if (!defaults) return [];
      if (typeof defaults !== "string") return defaults;
      let list = cache.get(defaults);
      if (!list) cache.set(defaults, (list = [defaults]));
      return list;
    },
    set(commandId, bindings) {
      const next = { ...overrides };
      if (bindings === null) delete next[commandId];
      else next[commandId] = [...bindings];
      overrides = next;
      storage.set(KEY, overrides);
      for (const listener of [...listeners]) listener();
    },
    overrides: () => overrides,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
