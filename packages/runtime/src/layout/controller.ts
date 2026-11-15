import { docPath, HOME_PATH, Layout } from "@lydie/contract";
import type { Layout as LayoutValue, Tab, TabGroup } from "@lydie/contract";

import { uuid } from "../uuid.ts";
import { checkLayout, emptyLayout, fillEmptyWindows, groupsOf, reduceLayout } from "./reducer.ts";
import type { LayoutAction } from "./reducer.ts";

export type LayoutPersistence = {
  load(): Promise<unknown>;
  save(layout: LayoutValue): Promise<void>;
};

export type LayoutController = {
  getState(): LayoutValue;
  dispatch(action: LayoutAction): void;
  // Any change.
  subscribe(listener: () => void): () => void;
  // Only when this tab (or group) object changes; others' changes do not call it. `getTab` returns
  // the same object until then, so the pair fits React's useSyncExternalStore.
  subscribeTab(tabId: string, listener: () => void): () => void;
  getTab(tabId: string): Tab | null;
  subscribeGroup(groupId: string, listener: () => void): () => void;
  getGroup(groupId: string): TabGroup | null;
  // Writes a pending save now (call before quitting).
  flush(): Promise<void>;
  close(): Promise<void>;
};

export type LayoutControllerOptions = {
  initial?: LayoutValue;
  persist?: LayoutPersistence;
  // Saves are debounced: dragging a split writes once when it stops.
  debounceMs?: number;
  newId?: () => string;
  onError?: (error: unknown) => void;
};

// Parses a saved layout; anything invalid (a corrupt row) yields null.
export function parseLayout(value: unknown, newId: () => string = uuid): LayoutValue | null {
  const parsed = Layout.safeParse(upgradeLayout(value));
  if (!parsed.success) return null;
  const layout = fillEmptyWindows(parsed.data, newId);
  return checkLayout(layout).length === 0 ? layout : null;
}

// Version 1 kept what a tab shows as a route object; version 2 keeps its path.
function upgradeLayout(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1) return value;
  const entry = (e: unknown) => (isRecord(e) ? { state: e.state, path: pathOfRoute(e.route) } : e);
  const node = (n: unknown): unknown => {
    if (!isRecord(n)) return n;
    if (n.type === "split" && Array.isArray(n.children)) {
      return { ...n, children: n.children.map(node) };
    }
    if (!Array.isArray(n.tabs)) return n;
    const tabs = n.tabs.map((tab: unknown) => {
      if (!isRecord(tab)) return tab;
      const { route, ...rest } = tab;
      return {
        ...rest,
        path: pathOfRoute(route),
        back: Array.isArray(tab.back) ? tab.back.map(entry) : tab.back,
        forward: Array.isArray(tab.forward) ? tab.forward.map(entry) : tab.forward,
      };
    });
    return { ...n, tabs };
  };
  const windows = Array.isArray(value.windows)
    ? value.windows.map((w: unknown) => (isRecord(w) ? { ...w, root: node(w.root) } : w))
    : value.windows;
  return { ...value, version: 2, windows };
}

function pathOfRoute(route: unknown): string {
  if (!isRecord(route)) return HOME_PATH;
  const text = (v: unknown) => (typeof v === "string" ? v : undefined);
  if (route.kind === "doc" && typeof route.id === "string") {
    return docPath(route.id, { heading: text(route.heading), blockId: text(route.blockId) });
  }
  if (route.kind === "view" && typeof route.view === "string" && route.view !== "new-tab") {
    return `/${encodeURIComponent(route.view)}`;
  }
  return HOME_PATH;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function createLayoutController(options: LayoutControllerOptions = {}): LayoutController {
  const newId = options.newId ?? uuid;
  const onError = options.onError ?? ((error: unknown) => console.error(error));
  const debounceMs = options.debounceMs ?? 300;
  let state = options.initial ?? emptyLayout(newId);
  let tabs = new Map<string, Tab>();
  let groups = new Map<string, TabGroup>();
  const listeners = new Set<() => void>();
  const tabListeners = new Map<string, Set<() => void>>();
  const groupListeners = new Map<string, Set<() => void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> = Promise.resolve();

  const index = (layout: LayoutValue) => {
    const nextTabs = new Map<string, Tab>();
    const nextGroups = new Map<string, TabGroup>();
    for (const window of layout.windows) {
      for (const group of groupsOf(window.root)) {
        nextGroups.set(group.id, group);
        for (const tab of group.tabs) nextTabs.set(tab.id, tab);
      }
    }
    return { nextTabs, nextGroups };
  };
  ({ nextTabs: tabs, nextGroups: groups } = index(state));

  const notify = <T>(
    before: Map<string, T>,
    after: Map<string, T>,
    registry: Map<string, Set<() => void>>,
  ) => {
    for (const [id, set] of registry) {
      if (before.get(id) !== after.get(id)) for (const listener of set) listener();
    }
  };

  const save = () => {
    if (!options.persist) return Promise.resolve();
    const snapshot = state;
    saving = saving.then(() => options.persist!.save(snapshot)).catch(onError);
    return saving;
  };

  const register = (registry: Map<string, Set<() => void>>, id: string, listener: () => void) => {
    let set = registry.get(id);
    if (!set) registry.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) registry.delete(id);
    };
  };

  return {
    getState: () => state,
    dispatch(action) {
      const next = reduceLayout(state, action, newId);
      if (next === state) return;
      state = next;
      const before = { tabs, groups };
      ({ nextTabs: tabs, nextGroups: groups } = index(state));
      notify(before.tabs, tabs, tabListeners);
      notify(before.groups, groups, groupListeners);
      for (const listener of listeners) listener();
      if (options.persist) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void save();
        }, debounceMs);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeTab: (tabId, listener) => register(tabListeners, tabId, listener),
    getTab: (tabId) => tabs.get(tabId) ?? null,
    subscribeGroup: (groupId, listener) => register(groupListeners, groupId, listener),
    getGroup: (groupId) => groups.get(groupId) ?? null,
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await save();
      }
      await saving;
    },
    async close() {
      await this.flush();
      listeners.clear();
      tabListeners.clear();
      groupListeners.clear();
    },
  };
}

// Restores the saved layout (or starts with Home) and keeps saving it.
export async function openLayoutController(
  options: Omit<LayoutControllerOptions, "initial"> & { persist: LayoutPersistence },
): Promise<LayoutController> {
  let initial: LayoutValue | null = null;
  try {
    initial = parseLayout(await options.persist.load(), options.newId);
  } catch (error) {
    (options.onError ?? console.error)(error);
  }
  return createLayoutController({ ...options, ...(initial ? { initial } : {}) });
}
