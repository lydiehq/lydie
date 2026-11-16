// How much of the tree renders: rows are counted through the one hook each row calls.
import { afterEach, expect, mock, test } from "bun:test";

import * as api from "@lydie/plugin-api";
import type { Backend, ChildEntry, HostBridge, LiveState } from "@lydie/plugin-api";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let rowRenders = 0;
const realPrefetch = api.useDocPrefetch;
void mock.module("@lydie/plugin-api", () => ({
  ...api,
  useDocPrefetch: (id: string | null) => {
    rowRenders++;
    return realPrefetch(id);
  },
}));
const { DocumentTree } = await import("./DocumentTree.tsx");

afterEach(cleanup);
const NONE: never[] = [];
const STATUS = { sync: "local-only" };

const T = "2026-11-13T00:00:00.000Z";
const doc = (i: number, updatedAt = T): ChildEntry => ({
  id: `d${i}`,
  workspaceId: "ws",
  parentId: null,
  title: `Doc ${i}`,
  sortKey: String(i).padStart(4, "0"),
  properties: {},
  createdAt: T,
  updatedAt,
  deletedAt: null,
  childCount: 0,
});

test("scrolling, a save and navigating render only the rows that change", async () => {
  let top = Array.from({ length: 300 }, (_, i) => doc(i));
  let state: LiveState<unknown> = { data: top, isLoading: false, error: undefined };
  const listeners = new Set<() => void>();
  const handles = new Map<string, unknown>();
  const backend = {
    info: { mode: "local", workspaceId: "ws", workspaceName: "W", persistent: true },
    status: { get: () => STATUS, subscribe: () => () => {} },
    query: async () => [],
    live: (name: string, params: Record<string, unknown>) => {
      const key = JSON.stringify([name, params]);
      if (handles.has(key)) return handles.get(key);
      const top = name === "doc.children" && params.parentId === null;
      const empty: LiveState<unknown> = { data: [], isLoading: false, error: undefined };
      const handle = top
        ? {
            key,
            getSnapshot: () => state,
            subscribe: (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)),
          }
        : { key, getSnapshot: () => empty, subscribe: () => () => {} };
      handles.set(key, handle);
      return handle;
    },
  } as unknown as Backend;
  const tabListeners = new Set<() => void>();
  let activeTab = { id: "tab", path: "/d/d0" };
  const host = {
    app: {
      backend,
      storage: { get: () => [], set() {} },
      historyScope: () => "default",
      href: (p: string) => `https://app.test${p}`,
      linkClicks: "app",
      activeTab: () => activeTab,
      subscribeActiveTab: (fn: () => void) => (tabListeners.add(fn), () => tabListeners.delete(fn)),
    },
    contributions: { list: () => NONE, subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  render(
    <api.BackendProvider backend={backend}>
      <api.HostProvider host={host}>
        <DocumentTree />
      </api.HostProvider>
    </api.BackendProvider>,
  );
  await act(async () => {});
  const scroller = screen.getByRole("tree").parentElement!;
  // 600 px of rows, widened to a band, and the overscan below.
  expect(screen.getAllByRole("treeitem")).toHaveLength(36);

  const scrollTo = (top: number) =>
    act(async () => {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    });
  rowRenders = 0;
  // The bottom of the view stays in the band it started in (600 px ends in row 19 of 24).
  for (let top = 4; top <= 168; top += 4) await scrollTo(top);
  expect(rowRenders).toBe(0);
  // It enters the next band: only the rows coming into the window render.
  await scrollTo(172);
  expect(rowRenders).toBe(8);

  // A save changes what no row draws.
  rowRenders = 0;
  top = top.map((d, i) => (i === 20 ? doc(20, "2026-11-14T00:00:00.000Z") : d));
  state = { data: top, isLoading: false, error: undefined };
  await act(async () => {
    for (const listener of listeners) listener();
  });
  expect(rowRenders).toBe(0);

  // Navigating: the row it leaves and the one it marks.
  activeTab = { id: "tab", path: "/d/d5" };
  await act(async () => {
    for (const listener of tabListeners) listener();
  });
  expect(rowRenders).toBe(2);
});
