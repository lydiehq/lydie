import type { PluginDef } from "@lydie/plugin-api";

const whenIdle: (fn: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (fn) => void requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => void setTimeout(fn, 200);

type Permissions = PluginDef["permissions"];

const list = (permissions: Permissions) => `[${[...(permissions ?? [])].sort().join(", ")}]`;
const samePermissions = (a: Permissions, b: Permissions) => list(a) === list(b);

// A built-in plugin kept out of the main bundle. Its id and name are known up front (Settings →
// Plugins lists it); its code starts loading once the page is idle (typically while the database
// opens), so it does not compete with the startup's own downloads, or when it is activated if
// that comes first. It activates as soon as it is in; its contributions arrive a moment after
// the others, through the same reactive registry. `meta` is what the host sees, permissions
// included: the plugin gets the app they allow. A failure to load or activate is the plugin's
// (`ctx.fail`), shown in Settings → Plugins.
export function lazyPlugin(
  meta: Omit<PluginDef, "activate">,
  load: () => Promise<PluginDef>,
): PluginDef {
  let loading: Promise<PluginDef> | null = null;
  const start = () => {
    if (!loading) {
      loading = load();
      loading.catch(() => {});
    }
    return loading;
  };
  whenIdle(() => void start());
  return {
    ...meta,
    activate(ctx) {
      let cleanup: ReturnType<PluginDef["activate"]>;
      let stopped = false;
      void start().then(
        (plugin) => {
          if (plugin.id !== meta.id) console.warn(`Plugin ${meta.id} loaded as ${plugin.id}`);
          if (!samePermissions(plugin.permissions, meta.permissions)) {
            console.warn(
              `Plugin ${meta.id} declares permissions ${list(plugin.permissions)}, its entry ${list(meta.permissions)}: the entry's apply`,
            );
          }
          if (stopped) return;
          try {
            cleanup = plugin.activate(ctx);
          } catch (error) {
            ctx.fail(error);
          }
        },
        (error: unknown) => ctx.fail(error),
      );
      return () => {
        stopped = true;
        if (typeof cleanup === "function") cleanup();
      };
    },
  };
}
