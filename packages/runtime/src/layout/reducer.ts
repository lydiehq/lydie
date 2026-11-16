import { docIdOf, HOME_PATH, LAYOUT_VERSION } from "@lydie/contract";
import type {
  Layout,
  LayoutNode,
  LayoutSplit,
  LayoutWindow,
  Tab,
  TabGroup,
  TabPath,
  TabState,
} from "@lydie/contract";

// Pure layout reducers. Every action returns a new layout that shares every untouched object with
// the old one (so a view subscribed to one tab sees no change when another tab changes), and
// leaves the invariants in `checkLayout` true.

export type Side = "left" | "right" | "up" | "down";

export type LayoutAction =
  // Show a page. "replace": in the active tab (a new tab if that one is pinned or there is none);
  // "tab": in a new tab after the active one; "background": a new tab that does not become active.
  | {
      type: "open";
      path: TabPath;
      state?: TabState;
      mode?: "replace" | "tab" | "background";
      groupId?: string;
      windowId?: string;
    }
  | { type: "close"; tabId: string }
  // Close every unpinned tab of the tab's group except it.
  | { type: "closeOthers"; tabId: string }
  // Close every unpinned tab of a window (the active one without `windowId`), in every pane; a
  // window left without tabs shows Home.
  | { type: "closeAll"; windowId?: string }
  | { type: "activate"; tabId: string }
  | { type: "move"; tabId: string; groupId: string; index?: number }
  // Open a page in a new group beside `groupId`.
  | { type: "split"; groupId: string; side: Side; path: TabPath; state?: TabState }
  // Move an existing tab into a new group beside `groupId`.
  | { type: "moveToSplit"; tabId: string; groupId: string; side: Side }
  | { type: "resize"; splitId: string; sizes: readonly number[] }
  | { type: "navigate"; tabId: string; path: TabPath; state?: TabState }
  | { type: "back"; tabId: string }
  | { type: "forward"; tabId: string }
  // Documents went to the trash: they leave every tab's back/forward history, and a tab showing
  // one goes back to the page before it, else to `fallback[id]`, else closes. Every window unless
  // `windowId` is given.
  | {
      type: "leaveDocs";
      ids: readonly string[];
      fallback?: Readonly<Record<string, TabPath>>;
      windowId?: string;
    }
  | { type: "pin"; tabId: string; pinned: boolean }
  // Merges into the tab's state bag (scroll position, selection). `null` values delete keys.
  | { type: "setTabState"; tabId: string; state: TabState }
  | { type: "openWindow"; windowId: string; path?: TabPath }
  | { type: "closeWindow"; windowId: string }
  | { type: "focusWindow"; windowId: string }
  | { type: "focusGroup"; groupId: string };

// Back/forward entries kept per tab.
export const HISTORY_LIMIT = 50;
// No pane gets smaller than this fraction when resizing.
export const MIN_SIZE = 0.05;

// A new layout: one window showing Home.
export function emptyLayout(newId: () => string): Layout {
  const windowId = newId();
  return {
    version: LAYOUT_VERSION,
    windows: [newWindow(windowId, newId(), newTab(newId(), HOME_PATH))],
    activeWindowId: windowId,
  };
}

function newWindow(id: string, groupId: string, tab: Tab): LayoutWindow {
  return { id, root: soleGroup(groupId, tab), activeGroupId: groupId };
}

function soleGroup(id: string, tab: Tab): TabGroup {
  return { type: "group", id, tabs: [tab], activeTabId: tab.id };
}

function newTab(id: string, path: TabPath, state: TabState = {}): Tab {
  return { id, path, state, back: [], forward: [], pinned: false };
}

function tabCount(window: LayoutWindow): number {
  let count = 0;
  for (const group of groupsOf(window.root)) count += group.tabs.length;
  return count;
}

// Layouts saved before every window kept a tab could hold a window with none: it gets Home.
export function fillEmptyWindows(layout: Layout, newId: () => string): Layout {
  let changed = false;
  const windows = layout.windows.map((w) => {
    if (w.root.type !== "group" || w.root.tabs.length > 0 || w.root.activeTabId !== null) return w;
    changed = true;
    return { ...w, root: soleGroup(w.root.id, newTab(newId(), HOME_PATH)) };
  });
  return changed ? { ...layout, windows } : layout;
}

// ---- Lookup

export type TabLocation = { window: LayoutWindow; group: TabGroup; tab: Tab; index: number };

export function* groupsOf(node: LayoutNode): Generator<TabGroup> {
  if (node.type === "group") yield node;
  else for (const child of node.children) yield* groupsOf(child);
}

export function findTab(layout: Layout, tabId: string): TabLocation | null {
  for (const window of layout.windows) {
    for (const group of groupsOf(window.root)) {
      const index = group.tabs.findIndex((t) => t.id === tabId);
      if (index !== -1) return { window, group, tab: group.tabs[index]!, index };
    }
  }
  return null;
}

export function findGroup(
  layout: Layout,
  groupId: string,
): { window: LayoutWindow; group: TabGroup } | null {
  for (const window of layout.windows) {
    for (const group of groupsOf(window.root)) if (group.id === groupId) return { window, group };
  }
  return null;
}

export function activeGroup(layout: Layout): TabGroup {
  const window = layout.windows.find((w) => w.id === layout.activeWindowId) ?? layout.windows[0]!;
  return findGroup(layout, window.activeGroupId)?.group ?? groupsOf(window.root).next().value!;
}

// ---- Tree editing with structural sharing

function mapNode(node: LayoutNode, fn: (node: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = fn(node);
  if (mapped !== node || node.type === "group") return mapped;
  let changed = false;
  const children = node.children.map((child) => {
    const next = mapNode(child, fn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function updateWindow(
  layout: Layout,
  windowId: string,
  fn: (w: LayoutWindow) => LayoutWindow,
): Layout {
  let changed = false;
  const windows = layout.windows.map((w) => {
    if (w.id !== windowId) return w;
    const next = fn(w);
    if (next !== w) changed = true;
    return next;
  });
  return changed ? { ...layout, windows } : layout;
}

function updateGroup(layout: Layout, groupId: string, fn: (g: TabGroup) => TabGroup): Layout {
  const found = findGroup(layout, groupId);
  if (!found) return layout;
  return updateWindow(layout, found.window.id, (w) => {
    const root = mapNode(w.root, (n) => (n.type === "group" && n.id === groupId ? fn(n) : n));
    return root === w.root ? w : { ...w, root };
  });
}

function updateTab(layout: Layout, tabId: string, fn: (t: Tab) => Tab): Layout {
  const found = findTab(layout, tabId);
  if (!found) return layout;
  return updateGroup(layout, found.group.id, (g) => {
    const next = fn(found.tab);
    if (next === found.tab) return g;
    const tabs = [...g.tabs];
    tabs[found.index] = next;
    return { ...g, tabs };
  });
}

// Removes empty groups, collapses splits with one child, merges a split into a parent with the
// same direction, renormalises sizes and repairs active ids. A window left without tabs shows Home.
function normalizeWindow(window: LayoutWindow, newId: () => string): LayoutWindow {
  const clean = (node: LayoutNode): LayoutNode | null => {
    if (node.type === "group") {
      if (node.tabs.length === 0) return null;
      const active = node.tabs.some((t) => t.id === node.activeTabId)
        ? node.activeTabId
        : node.tabs[0]!.id;
      return active === node.activeTabId ? node : { ...node, activeTabId: active };
    }
    const children: LayoutNode[] = [];
    const sizes: number[] = [];
    let changed = false;
    node.children.forEach((child, i) => {
      const next = clean(child);
      if (next !== child) changed = true;
      if (!next) return;
      const size = node.sizes[i] ?? 1 / node.children.length;
      if (next.type === "split" && next.direction === node.direction) {
        changed = true;
        next.children.forEach((grandchild, j) => {
          children.push(grandchild);
          sizes.push(size * next.sizes[j]!);
        });
      } else {
        children.push(next);
        sizes.push(size);
      }
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;
    const total = sizes.reduce((a, b) => a + b, 0);
    const normalized = sizes.map((s) => s / total);
    if (!changed && normalized.every((s, i) => Math.abs(s - node.sizes[i]!) < 1e-12)) return node;
    return { ...node, children, sizes: normalized };
  };
  const root =
    clean(window.root) ??
    soleGroup(groupsOf(window.root).next().value!.id, newTab(newId(), HOME_PATH));
  const groups = [...groupsOf(root)];
  const activeGroupId = groups.some((g) => g.id === window.activeGroupId)
    ? window.activeGroupId
    : groups[0]!.id;
  return root === window.root && activeGroupId === window.activeGroupId
    ? window
    : { ...window, root, activeGroupId };
}

function normalize(layout: Layout, newId: () => string): Layout {
  let changed = false;
  const windows = layout.windows.map((w) => {
    const next = normalizeWindow(w, newId);
    if (next !== w) changed = true;
    return next;
  });
  return changed ? { ...layout, windows } : layout;
}

function focus(layout: Layout, groupId: string): Layout {
  const found = findGroup(layout, groupId);
  if (!found) return layout;
  const withGroup = updateWindow(layout, found.window.id, (w) =>
    w.activeGroupId === groupId ? w : { ...w, activeGroupId: groupId },
  );
  return withGroup.activeWindowId === found.window.id
    ? withGroup
    : { ...withGroup, activeWindowId: found.window.id };
}

function insertTab(
  layout: Layout,
  groupId: string,
  tab: Tab,
  index: number,
  activate: boolean,
): Layout {
  const next = updateGroup(layout, groupId, (g) => {
    const tabs = [...g.tabs];
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
    return { ...g, tabs, activeTabId: activate || g.activeTabId === null ? tab.id : g.activeTabId };
  });
  return activate ? focus(next, groupId) : next;
}

function removeTab(layout: Layout, tabId: string): Layout {
  const found = findTab(layout, tabId);
  if (!found) return layout;
  return updateGroup(layout, found.group.id, (g) => {
    const tabs = g.tabs.filter((t) => t.id !== tabId);
    let activeTabId = g.activeTabId;
    if (activeTabId === tabId) {
      // The neighbour to the right takes over, else the one to the left.
      activeTabId = (tabs[found.index] ?? tabs[found.index - 1])?.id ?? null;
    }
    return { ...g, tabs, activeTabId };
  });
}

// Wraps the group in a split (or extends its parent split) with a new group on `side`.
function splitBeside(
  layout: Layout,
  groupId: string,
  side: Side,
  group: TabGroup,
  splitId: string,
): Layout {
  const found = findGroup(layout, groupId);
  if (!found) return layout;
  const direction = side === "left" || side === "right" ? "row" : "column";
  const before = side === "left" || side === "up";
  return updateWindow(layout, found.window.id, (w) => {
    const replace = (node: LayoutNode): LayoutNode => {
      if (node.type === "group") {
        if (node.id !== groupId) return node;
        const children = before ? [group, node] : [node, group];
        return { type: "split", id: splitId, direction, children, sizes: [0.5, 0.5] };
      }
      const index = node.children.findIndex((c) => c.type === "group" && c.id === groupId);
      if (index !== -1 && node.direction === direction) {
        // Share the target's space with the new group instead of nesting a split.
        const children = [...node.children];
        const sizes = [...node.sizes];
        const half = sizes[index]! / 2;
        sizes.splice(index, 1, half, half);
        children.splice(before ? index : index + 1, 0, group);
        return { ...node, children, sizes };
      }
      let changed = false;
      const children = node.children.map((c) => {
        const next = replace(c);
        if (next !== c) changed = true;
        return next;
      });
      return changed ? { ...node, children } : node;
    };
    return { ...w, root: replace(w.root) };
  });
}

// ---- The reducer

export function reduceLayout(layout: Layout, action: LayoutAction, newId: () => string): Layout {
  return normalize(apply(layout, action, newId), newId);
}

function apply(layout: Layout, action: LayoutAction, newId: () => string): Layout {
  switch (action.type) {
    case "open": {
      const window = action.windowId
        ? layout.windows.find((w) => w.id === action.windowId)
        : undefined;
      const group = action.groupId
        ? findGroup(layout, action.groupId)?.group
        : window
          ? findGroup(layout, window.activeGroupId)?.group
          : activeGroup(layout);
      if (!group) return layout;
      const mode = action.mode ?? "replace";
      const active = group.tabs.find((t) => t.id === group.activeTabId);
      // What another tab of this pane already shows is not opened twice: that tab comes forward
      // (moving to a heading or block when one is asked for), and a blank tab it was opened from
      // closes. Explicit new tabs and other panes are left alone.
      const existing =
        mode === "replace" && !(active && sameView(active.path, action.path))
          ? group.tabs.find((t) => sameView(t.path, action.path))
          : undefined;
      if (existing) {
        // Asked-for state (a collection's view) merges into the tab's when it stays on the path.
        const asked = action.state;
        let next =
          existing.path !== action.path
            ? navigate(layout, existing.id, action.path, asked ?? existing.state)
            : asked
              ? updateTab(layout, existing.id, (t) => ({ ...t, state: { ...t.state, ...asked } }))
              : layout;
        next = updateGroup(next, group.id, (g) => ({ ...g, activeTabId: existing.id }));
        if (active && !active.pinned && isBlank(active)) next = removeTab(next, active.id);
        return focus(next, group.id);
      }
      if (mode === "replace" && active && !active.pinned) {
        return focus(navigate(layout, active.id, action.path, action.state), group.id);
      }
      const index = active ? group.tabs.indexOf(active) + 1 : group.tabs.length;
      return insertTab(
        layout,
        group.id,
        newTab(newId(), action.path, action.state),
        index,
        mode !== "background",
      );
    }
    case "close": {
      const found = findTab(layout, action.tabId);
      // A window's last tab closes to Home, so closing Home there changes nothing.
      if (found?.tab.path === HOME_PATH && tabCount(found.window) === 1) return layout;
      return removeTab(layout, action.tabId);
    }
    case "closeOthers": {
      const found = findTab(layout, action.tabId);
      if (!found) return layout;
      return updateGroup(layout, found.group.id, (g) => {
        const tabs = g.tabs.filter((t) => t.id === action.tabId || t.pinned);
        return tabs.length === g.tabs.length ? g : { ...g, tabs, activeTabId: action.tabId };
      });
    }
    case "closeAll": {
      const window = layout.windows.find(
        (w) => w.id === (action.windowId ?? layout.activeWindowId),
      );
      if (!window) return layout;
      // Only Home is left: closing it changes nothing, as with "close".
      const first = groupsOf(window.root).next().value;
      if (tabCount(window) === 1 && first?.tabs[0]?.path === HOME_PATH) return layout;
      return updateWindow(layout, window.id, (w) => {
        const root = mapNode(w.root, (n) =>
          n.type === "group" && n.tabs.some((t) => !t.pinned)
            ? { ...n, tabs: n.tabs.filter((t) => t.pinned) }
            : n,
        );
        return root === w.root ? w : { ...w, root };
      });
    }
    case "activate": {
      const found = findTab(layout, action.tabId);
      if (!found) return layout;
      const next = updateGroup(layout, found.group.id, (g) =>
        g.activeTabId === action.tabId ? g : { ...g, activeTabId: action.tabId },
      );
      return focus(next, found.group.id);
    }
    case "move": {
      const found = findTab(layout, action.tabId);
      const target = findGroup(layout, action.groupId);
      if (!found || !target) return layout;
      const index = action.index ?? target.group.tabs.length;
      if (found.group.id === action.groupId) {
        return updateGroup(layout, action.groupId, (g) => {
          const tabs = g.tabs.filter((t) => t.id !== action.tabId);
          tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, found.tab);
          return { ...g, tabs, activeTabId: action.tabId };
        });
      }
      return insertTab(removeTab(layout, action.tabId), action.groupId, found.tab, index, true);
    }
    case "split": {
      const group: TabGroup = { type: "group", id: newId(), tabs: [], activeTabId: null };
      const tab = newTab(newId(), action.path, action.state);
      const withSplit = splitBeside(layout, action.groupId, action.side, group, newId());
      if (withSplit === layout) return layout;
      return insertTab(withSplit, group.id, tab, 0, true);
    }
    case "moveToSplit": {
      const found = findTab(layout, action.tabId);
      if (!found || !findGroup(layout, action.groupId)) return layout;
      // Splitting a group's only tab beside itself would leave the source empty: nothing to do.
      if (found.group.id === action.groupId && found.group.tabs.length === 1) return layout;
      const group: TabGroup = { type: "group", id: newId(), tabs: [], activeTabId: null };
      const withSplit = splitBeside(
        removeTab(layout, action.tabId),
        action.groupId,
        action.side,
        group,
        newId(),
      );
      return insertTab(withSplit, group.id, found.tab, 0, true);
    }
    case "resize": {
      let result = layout;
      for (const window of layout.windows) {
        const root = mapNode(window.root, (n) => {
          if (n.type !== "split" || n.id !== action.splitId) return n;
          const sizes = resized(n, action.sizes);
          return sizes ? { ...n, sizes } : n;
        });
        if (root !== window.root) result = updateWindow(result, window.id, (w) => ({ ...w, root }));
      }
      return result;
    }
    case "navigate":
      return navigate(layout, action.tabId, action.path, action.state);
    case "back":
      return updateTab(layout, action.tabId, (t) => {
        const previous = t.back.at(-1);
        if (!previous) return t;
        return {
          ...t,
          path: previous.path,
          state: previous.state,
          back: t.back.slice(0, -1),
          forward: [{ path: t.path, state: t.state }, ...t.forward],
        };
      });
    case "forward":
      return updateTab(layout, action.tabId, (t) => {
        const next = t.forward[0];
        if (!next) return t;
        return {
          ...t,
          path: next.path,
          state: next.state,
          back: [...t.back, { path: t.path, state: t.state }].slice(-HISTORY_LIMIT),
          forward: t.forward.slice(1),
        };
      });
    case "leaveDocs":
      return leaveDocs(layout, action.ids, action.fallback ?? {}, action.windowId);
    case "pin":
      return updateTab(layout, action.tabId, (t) =>
        t.pinned === action.pinned ? t : { ...t, pinned: action.pinned },
      );
    case "setTabState":
      return updateTab(layout, action.tabId, (t) => {
        const state = { ...t.state };
        let changed = false;
        for (const [key, value] of Object.entries(action.state)) {
          if (value === null) {
            if (key in state) {
              delete state[key];
              changed = true;
            }
          } else if (JSON.stringify(state[key]) !== JSON.stringify(value)) {
            state[key] = value;
            changed = true;
          }
        }
        return changed ? { ...t, state } : t;
      });
    case "openWindow": {
      if (layout.windows.some((w) => w.id === action.windowId)) return layout;
      const tab = newTab(newId(), action.path ?? HOME_PATH);
      const window = newWindow(action.windowId, newId(), tab);
      return { ...layout, windows: [...layout.windows, window], activeWindowId: window.id };
    }
    case "closeWindow": {
      // The last window stays: closing it quits the app, and its layout is what restores.
      if (layout.windows.length === 1) return layout;
      const windows = layout.windows.filter((w) => w.id !== action.windowId);
      if (windows.length === layout.windows.length) return layout;
      const activeWindowId = windows.some((w) => w.id === layout.activeWindowId)
        ? layout.activeWindowId
        : windows[0]!.id;
      return { ...layout, windows, activeWindowId };
    }
    case "focusWindow":
      return layout.windows.some((w) => w.id === action.windowId) &&
        layout.activeWindowId !== action.windowId
        ? { ...layout, activeWindowId: action.windowId }
        : layout;
    case "focusGroup":
      return focus(layout, action.groupId);
  }
}

function navigate(layout: Layout, tabId: string, path: TabPath, state: TabState = {}): Layout {
  return updateTab(layout, tabId, (t) =>
    t.path === path
      ? t
      : {
          ...t,
          path,
          state,
          // Home with no history is a blank tab (a new one, or a window's last): what replaces it
          // does not go back to it.
          back: isBlank(t)
            ? []
            : [...t.back, { path: t.path, state: t.state }].slice(-HISTORY_LIMIT),
          forward: [],
        },
  );
}

// Two paths show the same thing: the same document (wherever in it), or the same page.
function sameView(a: TabPath, b: TabPath): boolean {
  const doc = docIdOf(a);
  return doc !== null ? doc === docIdOf(b) : a === b;
}

function isBlank(tab: Tab): boolean {
  return tab.path === HOME_PATH && tab.back.length === 0 && tab.forward.length === 0;
}

function leaveDocs(
  layout: Layout,
  ids: readonly string[],
  fallback: Readonly<Record<string, TabPath>>,
  windowId: string | undefined,
): Layout {
  const gone = new Set(ids);
  const isGone = (path: TabPath) => gone.has(docIdOf(path) ?? "");
  const closing: string[] = [];
  const leave = (t: Tab): Tab => {
    const back = t.back.filter((e) => !isGone(e.path));
    const forward = t.forward.filter((e) => !isGone(e.path));
    const id = docIdOf(t.path);
    if (id !== null && gone.has(id)) {
      const previous = back.at(-1);
      if (previous) {
        return {
          ...t,
          path: previous.path,
          state: previous.state,
          back: back.slice(0, -1),
          forward,
        };
      }
      const path = fallback[id];
      if (path && !isGone(path)) return { ...t, path, state: {}, back, forward };
      closing.push(t.id);
      return t;
    }
    return back.length === t.back.length && forward.length === t.forward.length
      ? t
      : { ...t, back, forward };
  };
  let changed = false;
  const windows = layout.windows.map((w) => {
    if (windowId !== undefined && w.id !== windowId) return w;
    const root = mapNode(w.root, (n) => {
      if (n.type !== "group") return n;
      const tabs = n.tabs.map(leave);
      return tabs.some((t, i) => t !== n.tabs[i]) ? { ...n, tabs } : n;
    });
    if (root === w.root) return w;
    changed = true;
    return { ...w, root };
  });
  let result = changed ? { ...layout, windows } : layout;
  for (const tabId of closing) result = removeTab(result, tabId);
  return result;
}

function resized(split: LayoutSplit, sizes: readonly number[]): number[] | null {
  if (sizes.length !== split.children.length) return null;
  if (sizes.some((s) => !Number.isFinite(s) || s <= 0)) return null;
  const total = sizes.reduce((a, b) => a + b, 0);
  let out = sizes.map((s) => Math.max(MIN_SIZE, s / total));
  const clampedTotal = out.reduce((a, b) => a + b, 0);
  out = out.map((s) => s / clampedTotal);
  return out;
}

// ---- Invariants

// Returns what is wrong with a layout; empty when it is valid. The reducer keeps these true; the
// controller checks restored layouts with it.
export function checkLayout(layout: Layout): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const unique = (id: string, what: string) => {
    if (ids.has(id)) problems.push(`duplicate id ${id} (${what})`);
    ids.add(id);
  };
  if (!layout.windows.some((w) => w.id === layout.activeWindowId)) {
    problems.push("activeWindowId is not a window");
  }
  for (const window of layout.windows) {
    unique(window.id, "window");
    const groups = [...groupsOf(window.root)];
    if (!groups.some((g) => g.id === window.activeGroupId)) {
      problems.push(`window ${window.id}: activeGroupId is not one of its groups`);
    }
    const visit = (node: LayoutNode, parent: LayoutSplit | null) => {
      unique(node.id, node.type);
      if (node.type === "group") {
        if (node.tabs.length === 0) problems.push(`group ${node.id} is empty`);
        else if (!node.tabs.some((t) => t.id === node.activeTabId)) {
          problems.push(`group ${node.id} has no active tab`);
        }
        for (const tab of node.tabs) unique(tab.id, "tab");
        return;
      }
      if (node.children.length < 2) problems.push(`split ${node.id} has fewer than 2 children`);
      if (node.sizes.length !== node.children.length) {
        problems.push(
          `split ${node.id} has ${node.sizes.length} sizes for ${node.children.length} children`,
        );
      }
      const total = node.sizes.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 1) > 1e-9) problems.push(`split ${node.id} sizes sum to ${total}`);
      if (parent && parent.direction === node.direction) {
        problems.push(`split ${node.id} has the same direction as its parent`);
      }
      for (const child of node.children) visit(child, node);
    };
    visit(window.root, null);
  }
  return problems;
}
