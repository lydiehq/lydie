// A long board column renders the cards near its viewport only, and places a drop from the
// cards' heights rather than their boxes.
import { afterEach, expect, test } from "bun:test";

import { BackendProvider, HostProvider } from "@lydie/plugin-api";
import type { Backend, DatabaseViewItem, HostBridge, LiveState } from "@lydie/plugin-api";
import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseView,
  ViewRow,
} from "@lydie/plugin-api/databases";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ViewProvider } from "../context.tsx";
import { BoardView } from "./BoardView.tsx";

afterEach(cleanup);

const T = "2026-11-13T00:00:00.000Z";
const NONE: never[] = [];
const COUNT = 1000;

const property = (id: string, type: DatabaseProperty["type"]): DatabaseProperty => ({
  id,
  workspaceId: "ws",
  databaseId: "db",
  name: id,
  type,
  key: id,
  config: {},
  sortKey: id,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});
const status = property("status", "select");
const view = {
  id: "v",
  name: "Board",
  type: "board",
  config: {
    filter: null,
    sorts: [],
    groupBy: { propertyId: "status", direction: "asc" },
    subGroupBy: null,
    columns: [],
    limit: null,
    summaries: {},
    layout: {},
    extra: {},
  },
} as unknown as DatabaseView;
const definition = {
  database: { id: "db" },
  properties: [property("title", "title"), status],
  views: [view],
} as unknown as DatabaseDefinition;

const row = (i: number): ViewRow => ({
  id: `r${i}`,
  title: `Card ${i}`,
  sortKey: String(i).padStart(4, "0"),
  properties: { status: "Todo" },
  createdAt: T,
  updatedAt: T,
  createdBy: null,
  updatedBy: null,
  group: "Todo",
  subGroup: null,
  computed: {},
});
const rows = Array.from({ length: COUNT }, (_, i) => row(i));

function setup() {
  const handles = new Map<string, unknown>();
  const backend = {
    info: { mode: "local", workspaceId: "ws", workspaceName: "W", persistent: true },
    live: (name: string, params: { window?: { limit: number } }) => {
      const key = JSON.stringify([name, params]);
      if (handles.has(key)) return handles.get(key);
      const meta = { kind: "meta", key: "meta", total: COUNT, offset: 0, viewType: "board" };
      const data: DatabaseViewItem[] =
        name !== "database.view"
          ? []
          : params.window?.limit === 0
            ? [
                {
                  kind: "group",
                  key: "g",
                  group: { key: "Todo", subKey: null, count: COUNT, start: 0 },
                },
                meta as DatabaseViewItem,
              ]
            : [
                ...rows
                  .slice(0, params.window?.limit ?? 0)
                  .map((r): DatabaseViewItem => ({ kind: "row", key: r.id, row: r })),
                meta as DatabaseViewItem,
              ];
      const state: LiveState<DatabaseViewItem> = { data, isLoading: false, error: undefined };
      const handle = { key, getSnapshot: () => state, subscribe: () => () => {} };
      handles.set(key, handle);
      return handle;
    },
  } as unknown as Backend;
  const host = {
    app: {
      backend,
      storage: { get: () => null, set() {} },
      href: (path: string) => path,
      linkClicks: "app",
      activeTab: () => null,
      subscribeActiveTab: () => () => {},
    },
    contributions: { list: () => NONE, subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  render(
    <BackendProvider backend={backend}>
      <HostProvider host={host}>
        <ViewProvider
          definition={definition}
          savedView={view}
          view={view}
          overlay={{}}
          overlayKey="overlay"
          params={{ databaseId: "db", viewId: "v" }}
          compact={false}
          fullWidth={false}
        >
          <BoardView />
        </ViewProvider>
      </HostProvider>
    </BackendProvider>,
  );
}

const cards = () =>
  [...document.querySelectorAll<HTMLElement>("[data-card]")].map((c) => c.dataset.card);

test("a long column renders the cards near its viewport, and more as it scrolls", async () => {
  window.innerHeight = 600;
  setup();
  await act(async () => {});
  const list = document.querySelector<HTMLElement>("[data-card]")!.parentElement!.parentElement!;
  // Load the whole column: it grows by pages as it scrolls to its end.
  for (let i = 0; i < 25; i++) {
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 0 });
    await act(async () => fireEvent.scroll(list));
  }
  expect(screen.getByRole("group", { name: "Todo column" })).toBeDefined();
  const first = cards();
  expect(first[0]).toBe("r0");
  expect(first.length).toBeLessThan(40);

  // 72 px a card and 6 between: card 100 starts at 7,800 px.
  list.scrollTop = 7800;
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 100_000 });
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 600 });
  await act(async () => fireEvent.scroll(list));
  const later = cards();
  expect(later).toContain("r100");
  expect(later).not.toContain("r0");
  expect(later.length).toBeLessThan(40);

  // Just past the middle of card 100 (the list's top at 0, its 4 px padding) drops after it.
  const transfer = { types: ["application/x-lydie-db-card"], dropEffect: "none" };
  // A mouse event: the test DOM's drag events leave `clientY` out.
  const dragTo = (y: number) =>
    act(async () => {
      const event = new MouseEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientY: y - 7800 + 4,
      });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      list.dispatchEvent(event);
    });
  const lineBefore = (id: string) =>
    document.querySelector(`[data-card="${id}"]`)!.previousElementSibling?.className ?? "";
  await dragTo(7800 + 37);
  expect(lineBefore("r101")).toContain("bg-blue-500");
  await dragTo(7800 + 35);
  expect(lineBefore("r100")).toContain("bg-blue-500");
  expect(lineBefore("r101")).not.toContain("bg-blue-500");
});
