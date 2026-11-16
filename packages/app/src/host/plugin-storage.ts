// Where `app.storage` keeps plugins' keys: each plugin under its own id, so one plugin cannot read
// or overwrite another's, and a shared area for what one plugin writes for another to read.
import type { DeviceStorage } from "./stores.ts";
import { PLUGIN_STORAGE_PREFIX } from "./stores.ts";

// Not a plugin id (`definePlugin` ids cannot be "shared": the host refuses it).
export const SHARED_STORAGE_AREA = "shared";

export const pluginStoragePrefix = (pluginId: string) => `${PLUGIN_STORAGE_PREFIX}${pluginId}:`;

// Before plugins had areas of their own every key sat directly under "plugin:", namespaced by
// convention. Keys that already started with "<plugin id>:" are where they were; these moved
// (old prefix → new prefix, the first that matches).
export const LEGACY_STORAGE_PREFIXES: readonly (readonly [string, string])[] = [
  ["plugin:appearance.", "plugin:settings:appearance."],
  ["plugin:editor.", "plugin:settings:editor."],
  ["plugin:account.", "plugin:account:"],
  ["plugin:changelog.", "plugin:changelog:"],
  ["plugin:databases.", "plugin:databases:"],
  ["plugin:threads.", "plugin:threads:"],
  // The team's spaces hand these to the document tree (`expandedKey`), which stores them.
  ["plugin:team.spaces.expanded:", "plugin:document-tree:team.spaces.expanded:"],
  ["plugin:team.", "plugin:team:"],
  ["plugin:shell.", "plugin:core:shell."],
  ["plugin:playground.", "plugin:playground:"],
];

// Moves keys stored under their old names (a device that ran an older version) to their new ones,
// keeping a value already stored under the new name. Cheap enough for every start: one pass over
// the keys, and after the first nothing matches.
export function migratePluginStorage(storage: DeviceStorage): void {
  if (!storage.keys) return;
  for (const key of storage.keys()) {
    const rule = LEGACY_STORAGE_PREFIXES.find(([from]) => key.startsWith(from));
    if (!rule) continue;
    const next = rule[1] + key.slice(rule[0].length);
    const value = storage.get<unknown>(key);
    if (value !== null && storage.get(next) === null) storage.set(next, value);
    storage.set(key, null);
  }
}
