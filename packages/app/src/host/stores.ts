// Small observable stores used by the host. Each fits useSyncExternalStore.

export type Store<T> = {
  get: () => T;
  set: (next: T | ((previous: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Per-device list of plugin ids turned off in Settings → Plugins (read by `startApp`).
export const DISABLED_PLUGINS_KEY = "plugins.disabled";

// Where `app.storage` keeps plugins' keys.
export const PLUGIN_STORAGE_PREFIX = "plugin:";

// Per-device key/value storage (localStorage in a browser or Electron renderer; memory elsewhere).
export type DeviceStorage = {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
  // Every key that has a value.
  keys?(): string[];
};

export function createDeviceStorage(prefix = "lydie:"): DeviceStorage {
  const backing = (globalThis as { localStorage?: Storage }).localStorage;
  const memory = new Map<string, string>();
  const read = (key: string) =>
    backing ? backing.getItem(prefix + key) : (memory.get(key) ?? null);
  return {
    get<T>(key: string): T | null {
      const raw = read(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        if (backing) {
          if (value === null || value === undefined) backing.removeItem(prefix + key);
          else backing.setItem(prefix + key, raw);
        } else memory.set(key, raw);
      } catch {
        // Storage full or blocked: preferences are best-effort.
      }
    },
    keys() {
      if (!backing) return [...memory.keys()];
      const keys: string[] = [];
      for (let i = 0; i < backing.length; i++) {
        const key = backing.key(i);
        if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length));
      }
      return keys;
    },
  };
}

export function createMemoryStorage(): DeviceStorage {
  const memory = new Map<string, unknown>();
  return {
    get: <T>(key: string) => (memory.has(key) ? (structuredClone(memory.get(key)) as T) : null),
    set: (key, value) => {
      if (value === null || value === undefined) memory.delete(key);
      else memory.set(key, structuredClone(value));
    },
    keys: () => [...memory.keys()],
  };
}
