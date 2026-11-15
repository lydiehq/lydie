import { describe, expect, it } from "bun:test";

import { docIdOf, HOME_PATH } from "@lydie/contract";
import type { Layout, LayoutNode, LayoutSplit, TabGroup, TabPath } from "@lydie/contract";

import { createLayoutController, openLayoutController, parseLayout } from "./controller.ts";
import {
  activeGroup,
  checkLayout,
  emptyLayout,
  findGroup,
  findTab,
  groupsOf,
  HISTORY_LIMIT,
  reduceLayout,
} from "./reducer.ts";
import type { LayoutAction } from "./reducer.ts";

const doc = (n: number): TabPath => `/d/00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

function ids() {
  let n = 0;
  return () => `id${n++}`;
}

function run(actions: LayoutAction[], start?: Layout) {
  const newId = ids();
  let layout = start ?? emptyLayout(newId);
  for (const action of actions) {
    layout = reduceLayout(layout, action, newId);
    expect(checkLayout(layout)).toEqual([]);
  }
  return layout;
}

const window0 = (layout: Layout) => layout.windows[0]!;
const titles = (layout: Layout) =>
  [...groupsOf(window0(layout).root)].map((g) =>
    g.tabs.map((t) => (docIdOf(t.path)?.slice(-3) ?? t.path) + (t.id === g.activeTabId ? "*" : "")),
  );

describe("tabs", () => {
  it("opens in the active tab, in new tabs and in the background", () => {
    const layout = run([
      { type: "open", path: doc(1) },
      { type: "open", path: doc(2) }, // replaces 1 in the active tab
      { type: "open", path: doc(3), mode: "tab" },
      { type: "open", path: doc(4), mode: "background" },
    ]);
    expect(titles(layout)).toEqual([["002", "003*", "004"]]);
    const tab = findTab(layout, activeGroup(layout).activeTabId!)!.tab;
    expect(tab.path).toEqual(doc(3));
  });

  it("opens a new tab instead of replacing a pinned one", () => {
    const newId = ids();
    let layout = reduceLayout(emptyLayout(newId), { type: "open", path: doc(1) }, newId);
    const first = activeGroup(layout).tabs[0]!;
    layout = reduceLayout(layout, { type: "pin", tabId: first.id, pinned: true }, newId);
    layout = reduceLayout(layout, { type: "open", path: doc(2) }, newId);
    expect(titles(layout)).toEqual([["001", "002*"]]);
    layout = reduceLayout(
      layout,
      { type: "closeOthers", tabId: activeGroup(layout).tabs[1]!.id },
      newId,
    );
    expect(titles(layout)).toEqual([["001", "002*"]]);
  });

  it("closes all tabs of the window but pinned ones, in every pane, then shows Home", () => {
    const newId = ids();
    let layout = reduceLayout(emptyLayout(newId), { type: "open", path: doc(1) }, newId);
    layout = reduceLayout(layout, { type: "open", path: doc(2), mode: "tab" }, newId);
    const first = activeGroup(layout).tabs[0]!;
    layout = reduceLayout(layout, { type: "pin", tabId: first.id, pinned: true }, newId);
    const group = activeGroup(layout).id;
    layout = reduceLayout(
      layout,
      { type: "split", groupId: group, side: "right", path: doc(3) },
      newId,
    );
    layout = reduceLayout(layout, { type: "closeAll" }, newId);
    // The split's pane had no pinned tab, so it goes; the pinned tab stays.
    expect(titles(layout)).toEqual([["001*"]]);
    expect(checkLayout(layout)).toEqual([]);

    layout = reduceLayout(layout, { type: "pin", tabId: first.id, pinned: false }, newId);
    layout = reduceLayout(layout, { type: "closeAll" }, newId);
    expect(activeGroup(layout).tabs).toMatchObject([{ path: HOME_PATH, back: [] }]);
    expect(checkLayout(layout)).toEqual([]);
    // Only Home left: nothing to close.
    expect(reduceLayout(layout, { type: "closeAll" }, newId)).toBe(layout);
  });

  it("starts with Home", () => {
    expect(window0(emptyLayout(ids())).root).toMatchObject({
      type: "group",
      tabs: [{ path: HOME_PATH, back: [] }],
    });
  });

  it("closes tabs, activating the right neighbour, then the left", () => {
    const newId = ids();
    let layout = reduceLayout(emptyLayout(newId), { type: "open", path: doc(1) }, newId);
    for (const n of [2, 3])
      layout = reduceLayout(layout, { type: "open", path: doc(n), mode: "tab" }, newId);
    const [a, b, c] = activeGroup(layout).tabs.map((t) => t.id);
    layout = reduceLayout(layout, { type: "activate", tabId: b! }, newId);
    layout = reduceLayout(layout, { type: "close", tabId: b! }, newId);
    expect(activeGroup(layout).activeTabId).toBe(c!);
    layout = reduceLayout(layout, { type: "close", tabId: c! }, newId);
    expect(activeGroup(layout).activeTabId).toBe(a!);
    layout = reduceLayout(layout, { type: "close", tabId: a! }, newId);
    // The last tab closes to Home, and closing Home then changes nothing.
    const home = activeGroup(layout).tabs;
    expect(home).toMatchObject([{ path: HOME_PATH, back: [] }]);
    expect(activeGroup(layout).activeTabId).toBe(home[0]!.id);
    expect(checkLayout(layout)).toEqual([]);
    expect(reduceLayout(layout, { type: "close", tabId: home[0]!.id }, newId)).toBe(layout);
  });

  it("gives a new window, and one whose last tab moves away, Home", () => {
    const newId = ids();
    let layout = emptyLayout(newId);
    for (const action of [
      { type: "open", path: doc(1) },
      { type: "openWindow", windowId: "w2" },
    ] as const)
      layout = reduceLayout(layout, action, newId);
    const second = layout.windows[1]!.root as TabGroup;
    expect(second.tabs).toMatchObject([{ path: HOME_PATH }]);
    const tab = (window0(layout).root as TabGroup).tabs[0]!;
    const moved = reduceLayout(layout, { type: "move", tabId: tab.id, groupId: second.id }, newId);
    expect(checkLayout(moved)).toEqual([]);
    expect(window0(moved).root).toMatchObject({ tabs: [{ path: HOME_PATH }] });
    expect(findTab(moved, tab.id)!.window.id).toBe("w2");
  });

  it("navigates with per-tab back and forward history and state", () => {
    const newId = ids();
    let layout = reduceLayout(emptyLayout(newId), { type: "open", path: doc(1) }, newId);
    const id = activeGroup(layout).tabs[0]!.id;
    const step = (action: LayoutAction) => (layout = reduceLayout(layout, action, newId));
    step({ type: "setTabState", tabId: id, state: { scrollTop: 120 } });
    step({ type: "navigate", tabId: id, path: doc(2) });
    step({ type: "navigate", tabId: id, path: doc(3), state: { scrollTop: 5 } });
    expect(findTab(layout, id)!.tab).toMatchObject({ path: doc(3), state: { scrollTop: 5 } });
    step({ type: "back", tabId: id });
    step({ type: "back", tabId: id });
    expect(findTab(layout, id)!.tab).toMatchObject({ path: doc(1), state: { scrollTop: 120 } });
    // Nothing further back: the blank Home the tab started on is not history.
    step({ type: "back", tabId: id });
    step({ type: "forward", tabId: id });
    expect(findTab(layout, id)!.tab.path).toEqual(doc(2));
    step({ type: "navigate", tabId: id, path: doc(4) });
    expect(findTab(layout, id)!.tab.forward).toEqual([]);
    step({ type: "setTabState", tabId: id, state: { scrollTop: null, selection: [1, 2] } });
    expect(findTab(layout, id)!.tab.state).toEqual({ selection: [1, 2] });
  });

  it("leaves trashed documents: back, else the fallback, else closes", () => {
    const newId = ids();
    let layout = emptyLayout(newId);
    const step = (action: LayoutAction) => {
      layout = reduceLayout(layout, action, newId);
      expect(checkLayout(layout)).toEqual([]);
    };
    const gone = doc(9);
    const id = (n: number) => docIdOf(doc(n))!;
    // A tab with history: 1 → 9 → 2 → 9, forward 3 (after going back from it).
    step({ type: "open", path: doc(1) });
    const a = activeGroup(layout).activeTabId!;
    step({ type: "navigate", tabId: a, path: gone });
    step({ type: "navigate", tabId: a, path: doc(2), state: { scrollTop: 7 } });
    step({ type: "navigate", tabId: a, path: gone });
    step({ type: "navigate", tabId: a, path: doc(3) });
    step({ type: "back", tabId: a });
    // Tabs showing only the gone page: one with a fallback, one without; one that never saw it.
    step({ type: "open", path: gone, mode: "tab" });
    const b = activeGroup(layout).activeTabId!;
    step({ type: "open", path: gone, mode: "tab" });
    const c = activeGroup(layout).activeTabId!;
    step({ type: "open", path: doc(4), mode: "tab" });
    const d = findTab(layout, activeGroup(layout).activeTabId!)!.tab;

    step({ type: "leaveDocs", ids: [id(9)], fallback: { [id(9)]: doc(5) } });
    expect(findTab(layout, a)!.tab).toMatchObject({
      path: doc(2),
      state: { scrollTop: 7 },
      back: [{ path: doc(1) }],
      forward: [{ path: doc(3) }],
    });
    expect(findTab(layout, b)!.tab).toMatchObject({ path: doc(5), back: [], forward: [] });
    expect(findTab(layout, c)!.tab.path).toEqual(doc(5));
    expect(findTab(layout, d.id)!.tab).toBe(d);

    step({ type: "open", path: doc(6), mode: "tab" });
    const e = activeGroup(layout).activeTabId!;
    step({ type: "leaveDocs", ids: [id(6)] });
    expect(findTab(layout, e)).toBeNull();
    expect(activeGroup(layout).tabs.map((t) => t.id)).toEqual([a, b, c, d.id]);
    expect(reduceLayout(layout, { type: "leaveDocs", ids: [id(6)] }, newId)).toBe(layout);
  });

  it("caps history", () => {
    const actions: LayoutAction[] = [{ type: "open", path: doc(0) }];
    const layout0 = run(actions);
    const id = activeGroup(layout0).tabs[0]!.id;
    const layout = run(
      Array.from(
        { length: HISTORY_LIMIT + 10 },
        (_, i) => ({ type: "navigate", tabId: id, path: doc(i + 1) }) as const,
      ),
      layout0,
    );
    expect(findTab(layout, id)!.tab.back).toHaveLength(HISTORY_LIMIT);
  });
});

describe("groups and splits", () => {
  function twoGroups() {
    const newId = ids();
    let layout = reduceLayout(emptyLayout(newId), { type: "open", path: doc(1) }, newId);
    const left = activeGroup(layout).id;
    layout = reduceLayout(
      layout,
      { type: "split", groupId: left, side: "right", path: doc(2) },
      newId,
    );
    return { layout, newId, left, right: activeGroup(layout).id };
  }

  it("splits beside a group and focuses the new one", () => {
    const { layout, left, right } = twoGroups();
    expect(window0(layout).root).toMatchObject({
      type: "split",
      direction: "row",
      sizes: [0.5, 0.5],
    });
    expect(window0(layout).activeGroupId).toBe(right);
    // Each group has its own active tab.
    expect(titles(layout)).toEqual([["001*"], ["002*"]]);
    expect(left).not.toBe(right);
  });

  it("adds to a split in the same direction instead of nesting", () => {
    const { layout: two, newId, right } = twoGroups();
    const three = reduceLayout(
      two,
      { type: "split", groupId: right, side: "right", path: doc(3) },
      newId,
    );
    const root = window0(three).root as LayoutSplit;
    expect(root.children).toHaveLength(3);
    expect(root.sizes).toEqual([0.5, 0.25, 0.25]);
    const nested = reduceLayout(
      three,
      { type: "split", groupId: right, side: "down", path: doc(4) },
      newId,
    );
    const nestedRoot = window0(nested).root as LayoutSplit;
    expect(nestedRoot.children[1]).toMatchObject({ type: "split", direction: "column" });
    expect(checkLayout(nested)).toEqual([]);
  });

  it("moves tabs between groups and removes the emptied group", () => {
    const { layout, newId, left, right } = twoGroups();
    const tab = activeGroup(layout).tabs[0]!.id;
    const moved = reduceLayout(
      layout,
      { type: "move", tabId: tab, groupId: left, index: 0 },
      newId,
    );
    expect(window0(moved).root).toMatchObject({ type: "group", id: left });
    expect(titles(moved)).toEqual([["002*", "001"]]);
    expect(findGroup(moved, right)).toBeNull();
    expect(window0(moved).activeGroupId).toBe(left);
  });

  it("reorders within a group", () => {
    const layout = run([
      { type: "open", path: doc(1) },
      { type: "open", path: doc(2), mode: "tab" },
      { type: "open", path: doc(3), mode: "tab" },
    ]);
    const group = activeGroup(layout);
    const moved = reduceLayout(
      layout,
      { type: "move", tabId: group.tabs[2]!.id, groupId: group.id, index: 0 },
      ids(),
    );
    expect(titles(moved)).toEqual([["003*", "001", "002"]]);
  });

  it("moves a tab into a new split, and refuses to split a lone tab off itself", () => {
    const layout = run([
      { type: "open", path: doc(1) },
      { type: "open", path: doc(2), mode: "tab" },
    ]);
    const group = activeGroup(layout);
    const newId = ids();
    const split = reduceLayout(
      layout,
      { type: "moveToSplit", tabId: group.tabs[1]!.id, groupId: group.id, side: "down" },
      newId,
    );
    expect(window0(split).root).toMatchObject({ type: "split", direction: "column" });
    expect(titles(split)).toEqual([["001*"], ["002*"]]);
    const lone = activeGroup(split);
    expect(
      reduceLayout(
        split,
        { type: "moveToSplit", tabId: lone.tabs[0]!.id, groupId: lone.id, side: "up" },
        newId,
      ),
    ).toBe(split);
  });

  it("resizes with sizes normalised to 1 and a minimum size, rejecting bad input", () => {
    const { layout, newId } = twoGroups();
    const split = window0(layout).root as LayoutSplit;
    const resized = reduceLayout(
      layout,
      { type: "resize", splitId: split.id, sizes: [3, 1] },
      newId,
    );
    expect((window0(resized).root as LayoutSplit).sizes).toEqual([0.75, 0.25]);
    const tiny = reduceLayout(
      layout,
      { type: "resize", splitId: split.id, sizes: [1000, 1] },
      newId,
    );
    expect(Math.min(...(window0(tiny).root as LayoutSplit).sizes)).toBeGreaterThan(0.04);
    expect(reduceLayout(layout, { type: "resize", splitId: split.id, sizes: [1] }, newId)).toBe(
      layout,
    );
    expect(reduceLayout(layout, { type: "resize", splitId: split.id, sizes: [1, -1] }, newId)).toBe(
      layout,
    );
  });

  it("closing the last tab of a split collapses it", () => {
    const { layout, newId } = twoGroups();
    const tab = activeGroup(layout).tabs[0]!.id;
    const closed = reduceLayout(layout, { type: "close", tabId: tab }, newId);
    expect(window0(closed).root.type).toBe("group");
    expect(titles(closed)).toEqual([["001*"]]);
  });
});

describe("windows", () => {
  it("opens, focuses and closes windows, keeping the last one", () => {
    const newId = ids();
    let layout = emptyLayout(newId);
    const first = layout.windows[0]!.id;
    layout = reduceLayout(layout, { type: "openWindow", windowId: "w2", path: doc(1) }, newId);
    expect(layout.activeWindowId).toBe("w2");
    layout = reduceLayout(layout, { type: "open", path: doc(2), mode: "tab" }, newId);
    expect(layout.windows[1]!.root).toMatchObject({ tabs: [{ path: doc(1) }, { path: doc(2) }] });
    layout = reduceLayout(layout, { type: "focusWindow", windowId: first }, newId);
    layout = reduceLayout(layout, { type: "closeWindow", windowId: first }, newId);
    expect(layout.windows.map((w) => w.id)).toEqual(["w2"]);
    expect(layout.activeWindowId).toBe("w2");
    expect(reduceLayout(layout, { type: "closeWindow", windowId: "w2" }, newId)).toBe(layout);
  });
});

describe("structural sharing", () => {
  it("keeps untouched tabs, groups and windows identical", () => {
    const newId = ids();
    let layout = emptyLayout(newId);
    layout = reduceLayout(layout, { type: "open", path: doc(1) }, newId);
    layout = reduceLayout(layout, { type: "open", path: doc(2), mode: "tab" }, newId);
    layout = reduceLayout(layout, { type: "openWindow", windowId: "w2", path: doc(3) }, newId);
    const [t1, t2] = (layout.windows[0]!.root as { tabs: { id: string }[] }).tabs;
    const next = reduceLayout(
      layout,
      { type: "setTabState", tabId: t2!.id, state: { y: 1 } },
      newId,
    );
    expect(next.windows[1]).toBe(layout.windows[1]!);
    expect(findTab(next, t1!.id)!.tab).toBe(findTab(layout, t1!.id)!.tab);
    expect(findTab(next, t2!.id)!.tab).not.toBe(findTab(layout, t2!.id)!.tab);
    // No-op actions return the same layout.
    expect(reduceLayout(next, { type: "setTabState", tabId: t2!.id, state: { y: 1 } }, newId)).toBe(
      next,
    );
    expect(reduceLayout(next, { type: "activate", tabId: "missing" }, newId)).toBe(next);
  });
});

describe("invariants under random action sequences", () => {
  it("hold after every step", () => {
    // mulberry32: a small deterministic PRNG.
    let seed = 0x5eed;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const sides = ["left", "right", "up", "down"] as const;
    const newId = ids();
    let layout = emptyLayout(newId);
    for (let i = 0; i < 4000; i++) {
      const allTabs = layout.windows.flatMap((w) => [...groupsOf(w.root)].flatMap((g) => g.tabs));
      const allGroups = layout.windows.flatMap((w) => [...groupsOf(w.root)]);
      const splits: LayoutSplit[] = [];
      const collect = (n: LayoutNode) => {
        if (n.type === "split") {
          splits.push(n);
          n.children.forEach(collect);
        }
      };
      layout.windows.forEach((w) => collect(w.root));
      const tab = allTabs.length > 0 ? pick(allTabs).id : "none";
      const group = pick(allGroups).id;
      const actions: LayoutAction[] = [
        {
          type: "open",
          path: doc(Math.floor(random() * 50)),
          mode: pick(["replace", "tab", "background"] as const),
        },
        { type: "open", path: doc(1), groupId: group, mode: "tab" },
        { type: "close", tabId: tab },
        { type: "closeOthers", tabId: tab },
        { type: "closeAll", windowId: pick(layout.windows).id },
        { type: "activate", tabId: tab },
        { type: "move", tabId: tab, groupId: group, index: Math.floor(random() * 4) },
        { type: "split", groupId: group, side: pick(sides), path: doc(9) },
        { type: "moveToSplit", tabId: tab, groupId: group, side: pick(sides) },
        { type: "navigate", tabId: tab, path: doc(Math.floor(random() * 50)) },
        { type: "back", tabId: tab },
        { type: "forward", tabId: tab },
        { type: "leaveDocs", ids: [docIdOf(doc(Math.floor(random() * 50)))!] },
        { type: "pin", tabId: tab, pinned: random() > 0.5 },
        { type: "setTabState", tabId: tab, state: { y: Math.floor(random() * 3) } },
        { type: "focusGroup", groupId: group },
        { type: "openWindow", windowId: `w${i}` },
        { type: "closeWindow", windowId: pick(layout.windows).id },
      ];
      if (splits.length > 0) {
        const split = pick(splits);
        actions.push({
          type: "resize",
          splitId: split.id,
          sizes: split.children.map(() => random() + 0.01),
        });
      }
      layout = reduceLayout(layout, pick(actions), newId);
      const problems = checkLayout(layout);
      if (problems.length > 0) throw new Error(`step ${i}: ${problems.join("; ")}`);
      // Every group has exactly one active tab; the active group belongs to its window.
      for (const g of allGroups)
        if (findGroup(layout, g.id)?.group.tabs.length)
          expect(findGroup(layout, g.id)!.group.activeTabId).not.toBeNull();
    }
    expect(parseLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });
});

describe("controller", () => {
  it("notifies per tab, so one tab's change does not reach another's subscribers", () => {
    const controller = createLayoutController({ newId: ids() });
    controller.dispatch({ type: "open", path: doc(1) });
    controller.dispatch({ type: "open", path: doc(2), mode: "tab" });
    const [a, b] = activeGroup(controller.getState()).tabs;
    const calls = { a: 0, b: 0, group: 0, any: 0 };
    controller.subscribeTab(a!.id, () => calls.a++);
    controller.subscribeTab(b!.id, () => calls.b++);
    controller.subscribeGroup(activeGroup(controller.getState()).id, () => calls.group++);
    controller.subscribe(() => calls.any++);
    const before = controller.getTab(a!.id);
    controller.dispatch({ type: "setTabState", tabId: b!.id, state: { scrollTop: 10 } });
    expect(calls).toEqual({ a: 0, b: 1, group: 1, any: 1 });
    expect(controller.getTab(a!.id)).toBe(before);
    controller.dispatch({ type: "setTabState", tabId: b!.id, state: { scrollTop: 10 } });
    expect(calls.any).toBe(1);
  });

  it("debounces saves and restores what it saved", async () => {
    let saved: unknown = null;
    let saves = 0;
    const persist = {
      load: async () => saved,
      save: async (layout: Layout) => {
        saves++;
        saved = JSON.parse(JSON.stringify(layout));
      },
    };
    const controller = await openLayoutController({ persist, debounceMs: 20, newId: ids() });
    controller.dispatch({ type: "open", path: doc(1) });
    for (const n of [2, 3]) controller.dispatch({ type: "open", path: doc(n), mode: "tab" });
    const tabId = activeGroup(controller.getState()).tabs[0]!.id;
    controller.dispatch({ type: "setTabState", tabId, state: { scrollTop: 42 } });
    expect(saves).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(saves).toBe(1);
    controller.dispatch({ type: "close", tabId });
    await controller.close();
    expect(saves).toBe(2);

    const restored = await openLayoutController({ persist, newId: ids() });
    expect(restored.getState()).toEqual(controller.getState());
    expect(titles(restored.getState())).toEqual([["002", "003*"]]);
  });

  it("upgrades a version 1 layout: route objects become paths", () => {
    const id = "01933e6f-2284-b878-270f-04d17c6d8001";
    const tab = {
      id: "t",
      route: { kind: "doc", id, heading: "To do" },
      state: { scrollTop: 3 },
      back: [{ route: { kind: "view", view: "new-tab" }, state: {} }],
      forward: [{ route: { kind: "view", view: "trash" }, state: {} }],
      pinned: true,
    };
    const old = {
      version: 1,
      windows: [
        {
          id: "w",
          activeGroupId: "g",
          root: { type: "group", id: "g", tabs: [tab], activeTabId: "t" },
        },
      ],
      activeWindowId: "w",
    };
    expect(findTab(parseLayout(old)!, "t")!.tab).toEqual({
      id: "t",
      path: `/d/${id}#To%20do`,
      state: { scrollTop: 3 },
      back: [{ path: "/", state: {} }],
      forward: [{ path: "/trash", state: {} }],
      pinned: true,
    });
  });

  it("gives a saved window without tabs Home", () => {
    const saved = {
      version: 2,
      windows: [
        {
          id: "w",
          activeGroupId: "g",
          root: { type: "group", id: "g", tabs: [], activeTabId: null },
        },
      ],
      activeWindowId: "w",
    };
    const layout = parseLayout(saved, ids())!;
    expect(checkLayout(layout)).toEqual([]);
    expect(window0(layout).root).toMatchObject({ id: "g", tabs: [{ path: HOME_PATH }] });
  });

  it("starts with Home when the saved layout is invalid", async () => {
    for (const bad of [null, { version: 99 }, { version: 1, windows: [], activeWindowId: "x" }]) {
      const controller = await openLayoutController({
        persist: { load: async () => bad, save: async () => {} },
      });
      expect(checkLayout(controller.getState())).toEqual([]);
      expect(activeGroup(controller.getState()).tabs).toMatchObject([{ path: HOME_PATH }]);
    }
    const broken = emptyLayout(ids());
    (broken.windows[0]!.root as { activeTabId: string | null }).activeTabId = "ghost";
    expect(parseLayout(broken)).toBeNull();
  });
});
