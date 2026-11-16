import { describe, expect, test } from "bun:test";

import { LEGACY_STORAGE_PREFIXES, migratePluginStorage } from "./plugin-storage.ts";
import { createMemoryStorage } from "./stores.ts";

const WS = "01973200-0000-0000-0000-000000000000";

describe("plugin keys under their old names", () => {
  test("move to the plugin's area once, keeping what the new name already has", () => {
    const storage = createMemoryStorage();
    storage.set("plugin:appearance.theme", "dark");
    storage.set("plugin:editor.fontSize", 17);
    storage.set("plugin:account.bring.never", true);
    storage.set(`plugin:databases.overlay:v1:embed:${WS}:Tasks`, { limit: 5 });
    storage.set(`plugin:team.spaces.expanded:${WS}:private`, ["a"]);
    storage.set(`plugin:team.spaces.collapsed:${WS}`, ["t"]);
    storage.set("plugin:shell.betaNoticeDismissed", true);
    storage.set("plugin:changelog.seen", "2026-11-01");
    storage.set("plugin:changelog:seen", "2026-11-12");
    // Unchanged: already under the plugin's id, or the host's own.
    storage.set(`plugin:home:recent:${WS}`, [{ id: "a", at: 1 }]);
    storage.set("plugin:editor-view:slash-recents", { h1: 2 });
    storage.set("shell", { sidebarOpen: true });

    migratePluginStorage(storage);
    const after = Object.fromEntries(storage.keys!().map((k) => [k, storage.get(k)]));
    expect(after).toEqual({
      "plugin:settings:appearance.theme": "dark",
      "plugin:settings:editor.fontSize": 17,
      "plugin:account:bring.never": true,
      [`plugin:databases:overlay:v1:embed:${WS}:Tasks`]: { limit: 5 },
      [`plugin:document-tree:team.spaces.expanded:${WS}:private`]: ["a"],
      [`plugin:team:spaces.collapsed:${WS}`]: ["t"],
      "plugin:core:shell.betaNoticeDismissed": true,
      "plugin:changelog:seen": "2026-11-12",
      [`plugin:home:recent:${WS}`]: [{ id: "a", at: 1 }],
      "plugin:editor-view:slash-recents": { h1: 2 },
      shell: { sidebarOpen: true },
    });
    // A second start changes nothing.
    migratePluginStorage(storage);
    expect(Object.fromEntries(storage.keys!().map((k) => [k, storage.get(k)]))).toEqual(after);
  });

  test("no old prefix is the start of a new key, so nothing moves twice", () => {
    for (const [from] of LEGACY_STORAGE_PREFIXES) {
      for (const [, to] of LEGACY_STORAGE_PREFIXES) expect(to.startsWith(from)).toBe(false);
    }
  });
});
