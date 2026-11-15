import type { Platform } from "@lydie/platform";
import type { Backend, HostServices, PluginDef } from "@lydie/plugin-api";
import { openLayoutController } from "@lydie/runtime/layout";

import { createHost } from "./host/host.ts";
import type { Host } from "./host/host.ts";
import { createDeviceStorage, DISABLED_PLUGINS_KEY } from "./host/stores.ts";
import type { DeviceStorage } from "./host/stores.ts";
import { corePlugin } from "./shell/core-plugin.tsx";

export type StartOptions = {
  backend: Backend;
  platform: Platform;
  plugins: readonly PluginDef[];
  storage?: DeviceStorage;
  poolSize?: number;
  // How long a page stays up while the next one loads (default 150 ms; 0 never waits).
  holdMs?: number;
  // Saves are debounced; tests pass 0.
  layoutDebounceMs?: number;
  // What the composition root offers plugins besides the backend (`app.services`).
  services?: HostServices;
};

// Restores this window's layout (saved per device and window) and activates the plugins.
export async function startApp(options: StartOptions): Promise<Host> {
  // One database can hold several workspaces; layouts are per workspace and window.
  const key = `window:${options.backend.info.workspaceId}:${options.platform.windows.id}`;
  const layout = await openLayoutController({
    persist: {
      load: () => options.backend.layouts.load(key),
      save: (value) => options.backend.layouts.save(key, value),
    },
    ...(options.layoutDebounceMs !== undefined ? { debounceMs: options.layoutDebounceMs } : {}),
  });
  // One layout document per window; it holds exactly one window entry.
  const windowId = layout.getState().windows[0]!.id;
  const storage = options.storage ?? createDeviceStorage();
  const disabled = new Set(storage.get<string[]>(DISABLED_PLUGINS_KEY) ?? []);
  const host = createHost({
    backend: options.backend,
    platform: options.platform,
    plugins: [corePlugin, ...options.plugins.filter((p) => p.essential || !disabled.has(p.id))],
    available: options.plugins,
    ...(options.services ? { services: options.services } : {}),
    layout,
    storage,
    windowId,
    ...(options.poolSize !== undefined ? { poolSize: options.poolSize } : {}),
    ...(options.holdMs !== undefined ? { holdMs: options.holdMs } : {}),
  });
  return host;
}
