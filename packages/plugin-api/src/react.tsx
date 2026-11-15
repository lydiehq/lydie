// React bindings for plugins. The host provides the values; plugins only call the hooks.
import type { TabState } from "@lydie/contract";
import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  Backend,
  BackendOps,
  BackendStatus,
  HistoryState,
  LiveHandle,
  LiveParams,
  LiveQueryName,
  LiveRow,
  LiveState,
  OperationOptions,
} from "./backend.ts";
import type {
  AppApi,
  Contributed,
  ContributionKind,
  DocumentTreeProps,
  TabInfo,
} from "./plugin.ts";

// ---- Contexts (provided by the host)

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  return <BackendContext value={backend}>{children}</BackendContext>;
}

export function useBackend(): Backend {
  const backend = use(BackendContext);
  if (!backend) throw new Error("useBackend() needs a <BackendProvider> above it");
  return backend;
}

// What the host gives the hooks below. Plugins never construct it.
export type HostBridge = {
  app: AppApi;
  contributions: {
    list<K extends ContributionKind>(kind: K): readonly Contributed<K>[];
    subscribe(kind: ContributionKind, listener: () => void): () => void;
  };
  tabs: {
    // Same object until the tab changes (useSyncExternalStore).
    get(tabId: string): { state: TabState } | null;
    subscribe(tabId: string, listener: () => void): () => void;
    setState(tabId: string, state: TabState): void;
    // Paints the active tab with what its view has at the top (`useSetTabTint`); null clears it.
    setTint?(tabId: string, tint: TabTint | null): void;
  };
};

// A colour for the active tab, so it runs on into what its view shows at the top (a page's
// cover); any CSS colour. `tone`: how light it is, so the tab's ink contrasts with it; without
// one the ink stays the tab's own (a colour on its way to the card's).
export type TabTint = { color: string; tone?: "light" | "dark" };

const HostContext = createContext<HostBridge | null>(null);

export function HostProvider({ host, children }: { host: HostBridge; children: ReactNode }) {
  return <HostContext value={host}>{children}</HostContext>;
}

function useHost(): HostBridge {
  const host = use(HostContext);
  if (!host) throw new Error("Plugin hooks need the Lydie host above them");
  return host;
}

export function useApp(): AppApi {
  return useHost().app;
}

const TabContext = createContext<TabInfo | null>(null);
const TabStateContext = createContext<Readonly<Record<string, unknown>> | null>(null);

// `state`: the state bag of a tab that is not one in the layout (a collection's page panel), which
// the host keeps none for: what `useTabStateSnapshot` reads there, e.g. `{ focusTitle: true }`.
export function TabProvider({
  tab,
  state,
  children,
}: {
  tab: TabInfo;
  state?: Readonly<Record<string, unknown>> | null;
  children: ReactNode;
}) {
  return (
    <TabContext value={tab}>
      <TabStateContext value={state ?? null}>{children}</TabStateContext>
    </TabContext>
  );
}

// The tab a view is rendered in, or null outside a tab.
export function useTab(): TabInfo | null {
  return use(TabContext);
}

// ---- Data

const IDLE: LiveState<never> = Object.freeze({
  data: Object.freeze([]) as readonly never[],
  isLoading: false,
  error: undefined,
});
const idleHandle: LiveHandle<never> = {
  key: "idle",
  getSnapshot: () => IDLE,
  subscribe: () => () => {},
};

// A live query; `params: null` skips it (returns empty, not loading). Unchanged rows keep identity.
export function useQuery<N extends LiveQueryName>(
  name: N,
  params: LiveParams<N> | null,
): LiveState<LiveRow<N>> {
  const backend = useBackend();
  const handle = params === null ? idleHandle : backend.live(name, params);
  return useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot);
}

// Re-renders only when `select(state)` changes (by Object.is): e.g. a tab title that ignores
// body saves. `select` should return a primitive or a stable object.
export function useQuerySelect<N extends LiveQueryName, T>(
  name: N,
  params: LiveParams<N> | null,
  select: (state: LiveState<LiveRow<N>>) => T,
): T {
  const backend = useBackend();
  const handle = params === null ? idleHandle : backend.live(name, params);
  const getSelected = () => select(handle.getSnapshot());
  return useSyncExternalStore(handle.subscribe, getSelected, getSelected);
}

// Operations that record on the current undo scope (the tab's, or the active tab's) unless the
// options name another one.
export function useOps(): BackendOps {
  const backend = useBackend();
  const host = use(HostContext);
  const tabId = useTab()?.id ?? null;
  return useMemo(() => {
    const scope = () => tabId ?? host?.app.historyScope() ?? "default";
    const namespaces = new Map<string, unknown>();
    const call = (ns: string, method: string) => (input: unknown, opOptions?: OperationOptions) =>
      backend.execute(`${ns}.${method}` as never, input as never, {
        scope: scope(),
        ...opOptions,
      });
    return new Proxy({} as BackendOps, {
      get(_, ns) {
        if (typeof ns !== "string") return undefined;
        if (!namespaces.has(ns)) {
          namespaces.set(
            ns,
            new Proxy({}, { get: (_t, m) => (typeof m === "string" ? call(ns, m) : undefined) }),
          );
        }
        return namespaces.get(ns);
      },
    });
  }, [backend, host, tabId]);
}

const EMPTY_HISTORY: HistoryState = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
};

export function useHistory(scope?: string) {
  const backend = useBackend();
  const host = use(HostContext);
  const tab = useTab();
  const resolved = scope ?? tab?.id ?? host?.app.historyScope() ?? "default";
  const subscribe = useCallback(
    (listener: () => void) =>
      backend.history.subscribe((changed) => {
        if (changed === resolved) listener();
      }),
    [backend, resolved],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => backend.history.state(resolved) ?? EMPTY_HISTORY,
    () => EMPTY_HISTORY,
  );
  return {
    ...state,
    scope: resolved,
    undo: () => backend.history.undo(resolved),
    redo: () => backend.history.redo(resolved),
  };
}

// The document tree another plugin registered (`documentTree`), or nothing without one.
export function DocumentTreeView(props: DocumentTreeProps) {
  const [tree] = useContributions("documentTree");
  if (!tree) return null;
  const Tree = tree.component;
  return <Tree {...props} />;
}

export function useStatus(): BackendStatus {
  const backend = useBackend();
  return useSyncExternalStore(backend.status.subscribe, backend.status.get, backend.status.get);
}

export function useWorkspace() {
  return useBackend().info;
}

// The workspace's picture as it is now, for `SpaceIcon`'s `image`: synced workspaces only, null
// for the generated one.
export function useWorkspaceImage(): string | null {
  const { mode, workspaceId } = useWorkspace();
  return useQuerySelect(
    "workspace.get",
    mode === "synced" ? { workspaceId } : null,
    (state) => state.data[0]?.image ?? null,
  );
}

// ---- Tabs

// State kept in the tab's state bag: survives tab switches, eviction from the view pool, back/
// forward and restarts. Values must be JSON. Outside a tab it behaves like useState.
export function useTabState<T>(key: string, initial: T): [T, (value: T) => void] {
  const host = useHost();
  const tab = useTab();
  const tabId = tab?.id ?? null;
  const subscribe = useCallback(
    (listener: () => void) => (tabId ? host.tabs.subscribe(tabId, listener) : () => {}),
    [host, tabId],
  );
  const getValue = () => {
    if (!tabId) return undefined;
    return host.tabs.get(tabId)?.state[key] as T | undefined;
  };
  const stored = useSyncExternalStore(subscribe, getValue, getValue);
  const set = useCallback(
    (value: T) => {
      if (tabId) host.tabs.setState(tabId, { [key]: value as unknown });
    },
    [host, tabId, key],
  );
  return [stored === undefined ? initial : stored, set];
}

// Paints the tab the view is in: the setter is meant to be called as often as the view changes
// (per frame while scrolling, say) without rendering it. A tab outside the layout is left as it
// is. Not kept: cleared when the view unmounts.
export function useSetTabTint(): (tint: TabTint | null) => void {
  const host = useHost();
  const tabId = useTab()?.id ?? null;
  useEffect(
    () => () => {
      if (tabId) host.tabs.setTint?.(tabId, null);
    },
    [host, tabId],
  );
  return useCallback(
    (tint: TabTint | null) => {
      if (tabId) host.tabs.setTint?.(tabId, tint);
    },
    [host, tabId],
  );
}

// Reads the tab's state bag once, without subscribing (for restoring on mount). A tab outside the
// layout reads the `state` its TabProvider was given.
export function useTabStateSnapshot(): (key: string) => unknown {
  const host = useHost();
  const tab = useTab();
  const given = use(TabStateContext);
  return (key) => {
    if (!tab) return undefined;
    const kept = host.tabs.get(tab.id);
    return kept ? kept.state[key] : given?.[key];
  };
}

// The key caps of a command's first shortcut, for the tooltip of a button that does the same
// (`tooltipOptions={{ hotkeys }}`, as in Linear); null when it has none. Follows rebinding.
export function useShortcut(commandId: string): string[][] | null {
  const host = useHost();
  const { app } = host;
  const subscribe = useCallback(
    (listener: () => void) => {
      const offKeymap = app.keymap.subscribe(listener);
      const offCommands = host.contributions.subscribe("command", listener);
      return () => {
        offKeymap();
        offCommands();
      };
    },
    [app, host],
  );
  const get = () => app.keybindings(commandId)[0] ?? null;
  const binding = useSyncExternalStore(subscribe, get, get);
  return useMemo(() => (binding ? app.keyCaps(binding) : null), [app, binding]);
}

// The focused tab (active tab of the active group); re-renders when it or its route changes.
export function useActiveTab(): TabInfo | null {
  const app = useApp();
  return useSyncExternalStore(app.subscribeActiveTab, app.activeTab, app.activeTab);
}

// ---- Contributions

export function useContributions<K extends ContributionKind>(kind: K): readonly Contributed<K>[] {
  const host = useHost();
  const subscribe = useCallback(
    (listener: () => void) => host.contributions.subscribe(kind, listener),
    [host, kind],
  );
  const get = () => host.contributions.list(kind);
  return useSyncExternalStore(subscribe, get, get);
}

// ---- Portals

// Renders into another element (plugins do not import react-dom): e.g. a sheet over the tab's
// panel, `document.getElementById(`tabpanel-${tab.id}`)`. Context and React events still follow
// the React tree.
export function Portal({ container, children }: { container: Element; children: ReactNode }) {
  return createPortal(children, container);
}
