// A hosted window's first sync: an empty tree shows the syncing rows, not "Seems empty here.".
import { afterEach, describe, expect, test } from "bun:test";

import { BackendProvider, HostProvider } from "@lydie/plugin-api";
import type { Backend, BackendStatus, ChildEntry, HostBridge, LiveState } from "@lydie/plugin-api";
import { act, cleanup, render, screen } from "@testing-library/react";

import { DocumentTree } from "./DocumentTree.tsx";

afterEach(cleanup);

const T = "2026-11-15T00:00:00.000Z";
const page: ChildEntry = {
  id: "A1",
  workspaceId: "ws",
  parentId: null,
  title: "Getting started",
  sortKey: "a0",
  properties: {},
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  childCount: 0,
};

const NONE: never[] = [];

async function renderTree(
  status: Partial<BackendStatus>,
  top: ChildEntry[] = [],
  emptyState?: string,
) {
  let current: BackendStatus = {
    sync: "connecting",
    pendingOperations: 0,
    pendingUploads: 0,
    conflicts: 0,
    lastSyncedAt: null,
    error: null,
    ...status,
  };
  const listeners = new Set<() => void>();
  let data = top;
  const levels = new Set<() => void>();
  const backend = {
    info: { mode: "synced", workspaceId: "ws", workspaceName: "Team", persistent: true },
    status: {
      get: () => current,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    query: async () => [],
    live: (name: string, params: Record<string, unknown>) => {
      const top = name === "doc.children" && params.parentId === null;
      let state: LiveState<unknown> = { data: top ? data : [], isLoading: false, error: undefined };
      return {
        key: JSON.stringify([name, params]),
        getSnapshot: () => {
          if (top && state.data !== data) state = { ...state, data };
          return state;
        },
        subscribe: (listener: () => void) => {
          if (!top) return () => {};
          levels.add(listener);
          return () => levels.delete(listener);
        },
      };
    },
  } as unknown as Backend;
  const host = {
    app: {
      backend,
      storage: { get: () => null, set() {} },
      activeTab: () => null,
      subscribeActiveTab: () => () => {},
      href: (path: string) => path,
      linkClicks: "app",
    },
    contributions: { list: () => NONE, subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  render(
    <BackendProvider backend={backend}>
      <HostProvider host={host}>
        <DocumentTree label="Docs" {...(emptyState ? { emptyState: <p>{emptyState}</p> } : {})} />
      </HostProvider>
    </BackendProvider>,
  );
  // The tree reads its rows in a microtask.
  await act(async () => {});
  return {
    // The first sync lands: the rows arrive and the status says so.
    async synced(rows: ChildEntry[]) {
      await act(async () => {
        data = rows;
        current = { ...current, sync: "synced", lastSyncedAt: T, awaitingFirstSync: false };
        for (const listener of levels) listener();
        for (const listener of listeners) listener();
      });
    },
  };
}

const syncing = () => screen.queryByRole("status", { name: "Syncing documents" });

describe("first sync", () => {
  test("an empty tree shows syncing rows until the first sync, then the pages", async () => {
    const tree = await renderTree({ awaitingFirstSync: true });
    expect(syncing()).not.toBeNull();
    expect(screen.queryByText("Seems empty here.")).toBeNull();
    await tree.synced([page]);
    expect(syncing()).toBeNull();
    expect(screen.getByRole("treeitem", { name: /Getting started/ })).toBeDefined();
  });

  test("after the first sync an empty workspace is empty", async () => {
    const tree = await renderTree({ awaitingFirstSync: true });
    await tree.synced([]);
    // A moment longer, for the tree's query to catch up with the sync.
    expect(syncing()).not.toBeNull();
    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(syncing()).toBeNull();
    expect(screen.getByText("Seems empty here.")).toBeDefined();
  });

  test("also in place of another plugin's empty state", async () => {
    await renderTree({ awaitingFirstSync: true }, [], "No documents yet");
    expect(syncing()).not.toBeNull();
    expect(screen.queryByText("No documents yet")).toBeNull();
  });

  test("pages already on this device show at once, and local windows never wait", async () => {
    await renderTree({ awaitingFirstSync: true }, [page]);
    expect(syncing()).toBeNull();
    cleanup();
    await renderTree({ sync: "local-only" });
    expect(syncing()).toBeNull();
    expect(screen.getByText("Seems empty here.")).toBeDefined();
  });
});
