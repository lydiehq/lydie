import { describe, expect, test } from "bun:test";

import type { Backend, ChildEntry, LiveHandle, LiveState } from "@lydie/plugin-api";

import { collapseAllTrees, createTreeModel } from "./tree-model.ts";

function entry(id: string, parentId: string | null, childCount = 0): ChildEntry {
  return {
    id,
    workspaceId: "ws",
    parentId,
    title: id,
    sortKey: id,
    properties: {},
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    childCount,
  } as ChildEntry;
}

// A backend whose `doc.children` levels are set by hand; records which levels are watched.
function fakeBackend(levels: Record<string, ChildEntry[]>) {
  const watched = new Set<string>();
  const params: Record<string, unknown>[] = [];
  const handles = new Map<string, { state: LiveState<ChildEntry>; listeners: Set<() => void> }>();
  const all = Object.values(levels).flat();
  const backend = {
    // `doc.get`: just enough of the document for walking up its parents.
    query: async (_name: string, { id }: { id: string }) => {
      const doc = all.find((d) => d.id === id);
      return doc ? [{ document: doc, body: null }] : [];
    },
    live(_name: string, query: { parentId: string | null }) {
      params.push(query);
      const key = query.parentId ?? "root";
      let h = handles.get(key);
      if (!h) {
        h = {
          state: { data: levels[key] ?? [], isLoading: false, error: undefined },
          listeners: new Set(),
        };
        handles.set(key, h);
      }
      const handle = h;
      return {
        key,
        getSnapshot: () => handle.state,
        subscribe(listener: () => void) {
          handle.listeners.add(listener);
          watched.add(key);
          return () => {
            handle.listeners.delete(listener);
            if (handle.listeners.size === 0) watched.delete(key);
          };
        },
      } satisfies LiveHandle<ChildEntry>;
    },
  } as unknown as Backend;
  const set = (key: string, data: ChildEntry[]) => {
    const h = handles.get(key)!;
    h.state = { ...h.state, data };
    for (const listener of h.listeners) listener();
  };
  return { backend, watched, set, params };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("tree model", () => {
  test("watches only the top level and expanded folders; rows keep identity", async () => {
    const a1 = entry("a1", "a");
    const { backend, watched, set } = fakeBackend({
      root: [entry("a", null, 2), entry("b", null)],
      a: [a1, entry("a2", "a")],
    });
    const expanded: string[][] = [];
    const model = createTreeModel(backend, "ws", [], (ids) => expanded.push([...ids]));
    const off = model.subscribe(() => {});
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "b"]);
    expect([...watched]).toEqual(["root"]);

    model.setExpanded("a", true);
    await tick();
    expect(model.rows().map((r) => [r.doc.id, r.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a2", 1],
      ["b", 0],
    ]);
    expect([...watched].sort()).toEqual(["a", "root"]);
    expect(expanded.at(-1)).toEqual(["a"]);

    // A change in one folder keeps the other rows as the same objects.
    const before = model.rows();
    set("a", [a1, { ...entry("a2", "a"), title: "renamed" }]);
    await tick();
    const after = model.rows();
    expect(after[0]).toBe(before[0]!);
    expect(after[1]).toBe(before[1]!);
    expect(after[2]).not.toBe(before[2]!);

    model.setExpanded("a", false);
    await tick();
    expect([...watched]).toEqual(["root"]);
    off();
    expect(watched.size).toBe(0);
  });

  test("collapse all closes every folder of the trees on screen", async () => {
    const { backend, watched } = fakeBackend({
      root: [entry("a", null, 1), entry("b", null)],
      a: [entry("a1", "a", 1)],
      a1: [entry("a2", "a1")],
    });
    const expanded: string[][] = [];
    const model = createTreeModel(backend, "ws", ["a", "a1"], (ids) => expanded.push([...ids]));
    // Not on screen: left alone.
    const other = createTreeModel(backend, "ws", ["a"], () => {});
    const off = model.subscribe(() => {});
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "a1", "a2", "b"]);

    collapseAllTrees();
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "b"]);
    expect([...watched]).toEqual(["root"]);
    expect(expanded.at(-1)).toEqual([]);
    expect(other.expandedIds()).toEqual(["a"]);
    off();
  });

  test("one space: its filter on the top level only, and a root filter that can change", async () => {
    const { backend, params } = fakeBackend({
      root: [entry("a", null, 1), entry("b", null), entry("c", null)],
      a: [entry("a1", "a")],
    });
    const model = createTreeModel(backend, "ws", ["a"], () => {}, {
      space: { teamspaceId: "t1" },
      rootFilter: (doc) => doc.id !== "b",
    });
    const off = model.subscribe(() => {});
    await tick();
    expect(params).toEqual([
      { workspaceId: "ws", parentId: null, teamspaceId: "t1" },
      { workspaceId: "ws", parentId: "a" },
    ]);
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "a1", "c"]);
    model.setRootFilter((doc) => doc.id === "b");
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["b"]);
    model.setRootFilter(null);
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "a1", "b", "c"]);
    off();
  });

  test("reveal opens the folders above a document in this tree, and nothing for others", async () => {
    const { backend } = fakeBackend({
      root: [entry("a", null, 1), entry("other", null, 1)],
      a: [entry("a1", "a", 1)],
      a1: [entry("deep", "a1")],
      other: [entry("o1", "other")],
    });
    const model = createTreeModel(backend, "ws", [], () => {}, {
      rootFilter: (doc) => doc.id !== "other",
    });
    const off = model.subscribe(() => {});
    await tick();

    expect(await model.reveal("deep")).toBe(true);
    await tick();
    expect(model.rows().map((r) => r.doc.id)).toEqual(["a", "a1", "deep"]);

    // Under a top-level page this tree filters out: not here, nothing opened.
    expect(await model.reveal("o1")).toBe(false);
    expect(await model.reveal("missing")).toBe(false);
    expect(model.expandedIds()).toEqual(["a", "a1"]);
    off();
  });
});
