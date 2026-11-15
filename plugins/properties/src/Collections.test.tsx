// Properties belong to collections: a page in one shows its own keys the collection does not list
// (and can add them under the same key); a page outside one keeps its frontmatter, and "Add
// property" turns the parent into a collection (one undo step) or moves the page into one.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { BackendProvider, HostProvider, setConnectedPages } from "@lydie/plugin-api";
import type { Backend, HostBridge, LiveState } from "@lydie/plugin-api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PropertiesPanel } from "./PropertiesPanel.tsx";

afterEach(cleanup);

const T = "2026-11-13T00:00:00.000Z";
const PAGE = "01928000-0000-0000-0000-000000000000";
const PARENT = "0192c000-0000-0000-0000-000000000000";
const SIBLING = "01930000-0000-0000-0000-000000000000";
const DB = "01934000-0000-0000-0000-000000000000";
const OTHER_DB = "01938000-0000-0000-0000-000000000000";
const TITLE_PROP = "01958000-0000-0000-0000-000000000000";

const document = (id: string, title: string, parentId: string | null, properties = {}) => ({
  id,
  workspaceId: "ws",
  parentId,
  title,
  sortKey: "a",
  properties,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});

const prop = (databaseId: string, id: string, name: string, type: string, config = {}) => ({
  id,
  workspaceId: "ws",
  databaseId,
  name,
  type,
  key: type === "title" ? "name" : name,
  config,
  sortKey: id,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
});

const definition = (id: string, properties: unknown[]) => ({
  database: { id, workspaceId: "ws", config: { filter: null, templateIds: [], extra: {} } },
  properties,
  views: [],
});

let rows: Record<string, unknown[]>;
let executed: { id: string; input: unknown; options?: unknown }[];
let transactions: { label: string; ops: { id: string; input: unknown }[] }[];

beforeEach(() => {
  rows = {};
  executed = [];
  transactions = [];
});

const keyOf = (name: string, params: Record<string, string>) =>
  `${name}:${params.id ?? params.databaseId ?? params.parentId ?? params.workspaceId}`;

// What the fake operations return (database.create and addProperty outputs feed the next step).
function output(id: string, input: Record<string, unknown>): unknown {
  if (id === "database.create")
    return definition(input.documentId as string, [
      prop(input.documentId as string, TITLE_PROP, "Name", "title"),
    ]);
  if (id === "database.addProperty")
    return {
      ...prop(
        input.databaseId as string,
        `p-${String(input.name)}`,
        String(input.name),
        String(input.type),
      ),
      key: input.key ?? input.name,
    };
  return {};
}

const backend = {
  info: { mode: "local", workspaceId: "ws", workspaceName: "Test", persistent: true },
  execute: async (id: string, input: Record<string, unknown>, options?: unknown) => {
    executed.push({ id, input, options });
    return output(id, input);
  },
  transaction: async (label: string, fn: (ops: unknown) => Promise<unknown>) => {
    const ops: { id: string; input: unknown }[] = [];
    transactions.push({ label, ops });
    const proxy = new Proxy(
      {},
      {
        get: (_, ns: string) =>
          new Proxy(
            {},
            {
              get: (_t, method: string) => async (input: Record<string, unknown>) => {
                ops.push({ id: `${ns}.${method}`, input });
                return output(`${ns}.${method}`, input);
              },
            },
          ),
      },
    );
    return fn(proxy);
  },
  live: (name: string, params: Record<string, string>) => {
    const key = keyOf(name, params);
    const state: LiveState<unknown> = { data: rows[key] ?? [], isLoading: false, error: undefined };
    return { key, getSnapshot: () => state, subscribe: () => () => {} };
  },
  query: async (name: string, params: Record<string, string>) => rows[keyOf(name, params)] ?? [],
} as unknown as Backend;

const host = {
  app: {
    storage: { get: () => null, set() {} },
    notify(options: unknown) {
      throw new Error(`notified: ${JSON.stringify(options)}`);
    },
    historyScope: () => "default",
  },
  contributions: { list: () => [], subscribe: () => () => {} },
  tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
} as unknown as HostBridge;

function show(docId: string) {
  return render(
    <BackendProvider backend={backend}>
      <HostProvider host={host}>
        <PropertiesPanel docId={docId} tab={null} fallback={null} />
      </HostProvider>
    </BackendProvider>,
  );
}

const press = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

describe("a page outside a collection", () => {
  test("with no frontmatter renders nothing", () => {
    rows[`doc.get:${PAGE}`] = [{ document: document(PAGE, "Loose", PARENT), body: null }];
    const view = show(PAGE);
    expect(view.container.innerHTML).toBe("");
  });

  test("does not list page options (icon, cover, full width) as properties", () => {
    const options = { icon: "👋", cover: "blue", "cover-position": 30, "full-width": true };
    rows[`doc.get:${PAGE}`] = [{ document: document(PAGE, "Loose", PARENT, options), body: null }];
    expect(show(PAGE).container.innerHTML).toBe("");
    cleanup();
    rows[`doc.get:${PAGE}`] = [
      { document: document(PAGE, "Loose", PARENT, { ...options, Points: 3 }), body: null },
    ];
    show(PAGE);
    expect(screen.getByRole("button", { name: "Properties 1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Points settings" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "icon settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "full-width settings" })).toBeNull();
  });

  test("keeps its frontmatter editable and offers no free add", async () => {
    rows[`doc.get:${PAGE}`] = [
      { document: document(PAGE, "Loose", null, { Points: 3 }), body: null },
    ];
    show(PAGE);
    expect(screen.getByRole("button", { name: "Points settings" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Points" }).textContent).toBe("3");
    await press(screen.getByRole("button", { name: "Edit Points" }));
    const field = await screen.findByLabelText("Points");
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(executed.map((e) => [e.id, e.input])).toEqual([
      ["doc.setProperties", { id: PAGE, set: { Points: 5 }, unset: [] }],
    ]);
    // "Add property" explains collections instead of adding a key.
    await press(screen.getByRole("button", { name: "Add property" }));
    expect(screen.getByText("Properties are shared by the pages of a collection.")).toBeDefined();
    expect(screen.queryByLabelText("Property name")).toBeNull();
  });

  test("with a parent: makes the parent a collection with this page's keys, one undo step", async () => {
    rows[`doc.get:${PAGE}`] = [
      {
        document: document(PAGE, "Loose", PARENT, { Tags: ["a", "b"], Points: 3 }),
        body: null,
      },
    ];
    rows[`doc.get:${PARENT}`] = [{ document: document(PARENT, "Trips", null), body: null }];
    rows[`doc.children:${PARENT}`] = [
      { ...document(PAGE, "Loose", PARENT), childCount: 0 },
      { ...document(SIBLING, "Other", PARENT), childCount: 0 },
    ];
    show(PAGE);
    await press(screen.getByRole("button", { name: "Add property" }));
    expect(
      screen.getByText("Trips will show its 2 sub-pages as a collection. Its text stays."),
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText("Property name"), { target: { value: "Due" } });
    await press(screen.getByRole("button", { name: "Date" }));
    await press(screen.getByRole("button", { name: "Make Trips a collection" }));
    await waitFor(() => expect(transactions[0]?.ops.length).toBe(4));
    expect(executed).toEqual([]);
    expect(transactions).toEqual([
      {
        label: "Make Trips a collection",
        ops: [
          { id: "database.create", input: { workspaceId: "ws", documentId: PARENT } },
          {
            id: "database.addProperty",
            input: {
              databaseId: PARENT,
              name: "Tags",
              key: "Tags",
              type: "multiSelect",
              config: {
                options: [
                  { name: "a", color: "default" },
                  { name: "b", color: "default" },
                ],
              },
            },
          },
          {
            id: "database.addProperty",
            input: {
              databaseId: PARENT,
              name: "Points",
              key: "Points",
              type: "number",
              config: {},
            },
          },
          {
            id: "database.addProperty",
            input: { databaseId: PARENT, name: "Due", type: "date", config: {} },
          },
        ],
      },
    ]);
  });

  test("in a connected folder: adds a key to this page's frontmatter, not a collection", async () => {
    rows[`doc.get:${PAGE}`] = [
      { document: document(PAGE, "Events", PARENT, { sidebar: "Docs" }), body: null },
    ];
    rows[`doc.get:${PARENT}`] = [{ document: document(PARENT, "api", null), body: null }];
    setConnectedPages(
      "test",
      new Map([[PAGE, { connector: "github", label: "Connected to GitHub" }]]),
    );
    try {
      show(PAGE);
      await press(screen.getByRole("button", { name: "Add property" }));
      expect(screen.getByText("Adds a key to this page's frontmatter.")).toBeDefined();
      expect(screen.queryByText("Properties are shared by the pages of a collection.")).toBeNull();
      fireEvent.change(screen.getByLabelText("Property name"), { target: { value: "sidebar" } });
      await press(screen.getByRole("button", { name: "Checkbox" }));
      const dialog = screen.getByRole("dialog", { name: "Add property" });
      await press(within(dialog).getByRole("button", { name: "Add property" }));
      expect(transactions).toEqual([]);
      // "sidebar" is taken, so the key gets the next free name.
      expect(executed.map((e) => [e.id, e.input])).toEqual([
        ["doc.setProperties", { id: PAGE, set: { "sidebar 2": false }, unset: [] }],
      ]);
    } finally {
      cleanup();
      setConnectedPages("test", new Map());
    }
  });

  test("at the top level: moves into a chosen collection", async () => {
    rows[`doc.get:${PAGE}`] = [
      { document: document(PAGE, "Loose", null, { Mood: "ok" }), body: null },
    ];
    rows["database.list:ws"] = [
      { ...definition(DB, []).database, title: "Projects", parentId: null },
    ];
    show(PAGE);
    await press(screen.getByRole("button", { name: "Add property" }));
    await press(screen.getByRole("button", { name: "Move to a collection…" }));
    await press(await screen.findByRole("option", { name: /Projects/ }));
    expect(executed.map((e) => [e.id, e.input])).toEqual([
      ["doc.move", { id: PAGE, parentId: DB }],
    ]);
  });
});

describe("a page in a collection", () => {
  const inCollection = () => {
    rows[`doc.get:${PAGE}`] = [
      {
        document: document(PAGE, "Task", DB, { Status: "Todo", Mood: "calm", Seen: "2026-11-01" }),
        body: null,
      },
    ];
    rows[`doc.get:${DB}`] = [{ document: document(DB, "Projects", null), body: null }];
    rows[`database.get:${DB}`] = [
      definition(DB, [
        prop(DB, TITLE_PROP, "Name", "title"),
        prop(DB, "01958000-0000-0000-0000-000000000001", "Status", "text"),
      ]),
    ];
  };

  test("groups keys the collection does not list and adds one under the same key", async () => {
    inCollection();
    show(PAGE);
    const stray = screen.getByRole("region", { name: "Not in Projects" });
    expect(stray.textContent).toContain("Mood");
    expect(stray.textContent).toContain("Seen");
    expect(stray.textContent).not.toContain("Status");
    // Still editable here, by key.
    expect(screen.getByRole("button", { name: "Mood settings" })).toBeDefined();
    await press(screen.getByRole("button", { name: "Add Seen to collection" }));
    expect(executed.map((e) => [e.id, e.input, e.options])).toEqual([
      [
        "database.addProperty",
        { databaseId: DB, name: "Seen", key: "Seen", type: "date", config: {} },
        { label: "Add to collection", scope: "default" },
      ],
    ]);
  });

  test("suggests properties other collections have and copies their settings", async () => {
    inCollection();
    rows["database.list:ws"] = [
      { ...definition(DB, []).database, title: "Projects", parentId: null },
      { ...definition(OTHER_DB, []).database, title: "Tasks", parentId: null },
    ];
    rows[`database.get:${OTHER_DB}`] = [
      definition(OTHER_DB, [
        prop(OTHER_DB, "0195c000-0000-0000-0000-000000000000", "Name", "title"),
        prop(OTHER_DB, "0195c000-0000-0000-0000-000000000001", "Stage", "select", {
          options: [
            { id: "01JO0000000000000000000001", name: "Idea", color: "gray" },
            { id: "01JO0000000000000000000002", name: "Live", color: "green" },
          ],
        }),
      ]),
    ];
    show(PAGE);
    await press(screen.getByRole("button", { name: "Add property" }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Property name"), { target: { value: "sta" } });
    });
    await press(await screen.findByRole("button", { name: /Stage · from Tasks · 2 options/ }));
    const form = screen.getByRole("dialog", { name: "Add property" });
    await press(within(form).getByRole("button", { name: "Add property" }));
    expect(executed.map((e) => [e.id, e.input])).toEqual([
      [
        "database.addProperty",
        {
          databaseId: DB,
          name: "Stage",
          type: "select",
          config: {
            options: [
              { name: "Idea", color: "gray" },
              { name: "Live", color: "green" },
            ],
          },
        },
      ],
    ]);
  });
});
