import type { PluginDef } from "@lydie/plugin-api";

// A built-in plugin kept out of the main bundle. Its id and name are known up front (Settings →
// Plugins lists it); its code starts loading when this module is evaluated, in parallel with the
// database opening, and it activates as soon as it is in. Its contributions arrive a moment after
// the others, through the same reactive registry.
export function lazyPlugin(
  meta: Omit<PluginDef, "activate">,
  load: () => Promise<PluginDef>,
): PluginDef {
  const loading = load();
  loading.catch(() => {});
  return {
    ...meta,
    activate(ctx) {
      let cleanup: ReturnType<PluginDef["activate"]>;
      let stopped = false;
      void loading.then(
        (plugin) => {
          if (plugin.id !== meta.id) console.warn(`Plugin ${meta.id} loaded as ${plugin.id}`);
          if (!stopped) cleanup = plugin.activate(ctx);
        },
        (error: unknown) => console.error(`Plugin ${meta.id} failed to load`, error),
      );
      return () => {
        stopped = true;
        if (typeof cleanup === "function") cleanup();
      };
    },
  };
}
