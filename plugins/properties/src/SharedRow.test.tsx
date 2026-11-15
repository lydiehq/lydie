// LYD-247: a row shared without its database (a guest sees the row and the database's property
// definitions, not the database or its views) shows its properties from the definitions alone, and
// offers no schema editing.
import { afterEach, describe, expect, test } from "bun:test";

import { BackendProvider, HostProvider } from "@lydie/plugin-api";
import type { Backend, HostBridge, LiveState } from "@lydie/plugin-api";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PropertiesPanel } from "./PropertiesPanel.tsx";

afterEach(cleanup);

const T = "2026-11-13T00:00:00.000Z";
const ROW = "01960000-0000-0000-0000-000000000000";
const DB = "01934000-0000-0000-0000-000000000000";
const prop = (id: string, name: string, type: string) => ({
  id,
  workspaceId: "ws",
  databaseId: DB,
  name,
  type,
  key: name,
  config: {},
  sortKey: id,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});

const rows: Record<string, unknown[]> = {
  [`doc.get:${ROW}`]: [
    {
      document: {
        id: ROW,
        workspaceId: "ws",
        parentId: DB,
        title: "Shared task",
        sortKey: "a",
        properties: { Status: "Todo", Points: 3 },
        createdAt: T,
        updatedAt: T,
        deletedAt: null,
      },
      body: null,
    },
  ],
  // Neither the row nor its parent is a visible database.
  [`database.get:${ROW}`]: [],
  [`database.get:${DB}`]: [],
  [`database.properties:${DB}`]: [
    prop("01958000-0000-0000-0000-000000000000", "Name", "title"),
    prop("01958000-0000-0000-0000-000000000001", "Status", "select"),
    prop("01958000-0000-0000-0000-000000000002", "Points", "number"),
    prop("01958000-0000-0000-0000-000000000003", "Score", "formula"),
  ],
};

const executed: { id: string; input: unknown }[] = [];

const backend = {
  info: { mode: "synced", workspaceId: "ws", workspaceName: "Team", persistent: true },
  execute: async (id: string, input: unknown) => {
    executed.push({ id, input });
    return {};
  },
  live: (name: string, params: Record<string, string>) => {
    const key = `${name}:${params.id ?? params.databaseId ?? params.workspaceId}`;
    const state: LiveState<unknown> = { data: rows[key] ?? [], isLoading: false, error: undefined };
    return { key, getSnapshot: () => state, subscribe: () => () => {} };
  },
} as unknown as Backend;

const host = {
  app: {
    storage: { get: () => null, set() {} },
    notify() {},
    historyScope: () => "default",
  },
  contributions: { list: () => [], subscribe: () => () => {} },
  tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
} as unknown as HostBridge;

describe("a row shared without its database", () => {
  test("shows its properties from the definitions, values editable, schema not", async () => {
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <PropertiesPanel docId={ROW} tab={null} fallback={null} />
        </HostProvider>
      </BackendProvider>,
    );
    expect(screen.getByTestId("shared-row-properties")).toBeDefined();
    expect(screen.getByText("Todo")).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Points" }).textContent).toBe("3");
    // No schema editing: no property settings, no "Add property".
    expect(screen.queryByRole("button", { name: /settings$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
    // A computed property is shown but not editable.
    expect(screen.getByRole("button", { name: "Edit Score" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    // Values are written by key, as frontmatter (no database operation).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit Points" }));
    });
    const field = await screen.findByLabelText("Points");
    fireEvent.change(field, { target: { value: "8" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(executed).toEqual([{ id: "doc.setProperties", input: { id: ROW, set: { Points: 8 } } }]);
  });
});
