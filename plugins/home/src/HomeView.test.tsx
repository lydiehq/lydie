// The home page against a fake backend: "Jump back in" from this device's opens and recent
// changes, and the find box (titles, text hits, create) by keyboard and pointer.
import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  BackendProvider,
  docIdOf,
  gettingStartedId,
  HOME_PATH,
  HostProvider,
} from "@lydie/plugin-api";
import type { Backend, HostBridge, LiveState, TabInfo } from "@lydie/plugin-api";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { HomeView } from "./HomeView.tsx";
import { recentKey } from "./recents.ts";

afterEach(cleanup);

const WS = "ws";
const T = "2026-11-13T10:00:00.000Z";
const A = "01928000-0000-0000-0000-000000000000";
const B = "0192c000-0000-0000-0000-000000000000";
const C = "01930000-0000-0000-0000-000000000000";
const D = "01934000-0000-0000-0000-000000000000";
const FOLDER = "0193c000-0000-0000-0000-000000000000";

const doc = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId: WS,
  parentId: null,
  title,
  sortKey: "a",
  properties: {},
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  ...extra,
});

let rows: Record<string, unknown[]>;
let stored: Map<string, unknown>;
let opened: { id: string; mode: unknown }[];
let commands: { id: string; args: unknown }[];
let created: unknown[];
let tree: ReturnType<typeof doc>[];
let executed: { id: string; input: unknown }[];
let menu: unknown[];

beforeEach(() => {
  rows = {};
  stored = new Map();
  opened = [];
  commands = [];
  created = [];
  tree = [];
  executed = [];
  menu = [];
});

const keyOf = (name: string, params: Record<string, string>) =>
  `${name}:${params.id ?? params.workspaceId}`;

const backend = {
  info: { mode: "local", workspaceId: WS, workspaceName: "Test", persistent: true },
  ops: {
    doc: {
      listTree: async () => ({ entries: tree.map((d) => ({ ...d, depth: 0 })) }),
      create: async (input: { title: string }) => {
        created.push(input);
        return doc(D, input.title);
      },
    },
  },
  execute: async (id: string, input: unknown) => {
    executed.push({ id, input });
  },
  live: (name: string, params: Record<string, string>) => {
    const key = keyOf(name, params);
    const state: LiveState<unknown> = { data: rows[key] ?? [], isLoading: false, error: undefined };
    return { key, getSnapshot: () => state, subscribe: () => () => {} };
  },
  query: async (name: string, params: Record<string, string>) => rows[keyOf(name, params)] ?? [],
} as unknown as Backend;

const NONE: unknown[] = [];

function hostWith(commandIds: string[]) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    app: {
      backend,
      workspace: backend.info,
      storage: {
        get: (key: string) => stored.get(key) ?? null,
        set: (key: string, value: unknown) => {
          stored.set(key, value);
          for (const l of listeners.get(key) ?? []) l();
        },
        subscribe: (key: string, listener: () => void) => {
          if (!listeners.has(key)) listeners.set(key, new Set());
          listeners.get(key)!.add(listener);
          return () => listeners.get(key)!.delete(listener);
        },
      },
      commands: () => commandIds.map((id) => ({ id })),
      runCommand: async (id: string, args: unknown) => {
        commands.push({ id, args });
      },
      openDoc: (id: string, options: { mode?: unknown } = {}) =>
        opened.push({ id, mode: options.mode }),
      // Links open through `open`; recorded as the document they show.
      open: (path: string, options: { mode?: unknown } = {}) =>
        opened.push({ id: docIdOf(path) ?? path, mode: options.mode }),
      href: (path: string) => path,
      linkClicks: "app",
      modeFor: (g: { metaKey?: boolean; ctrlKey?: boolean }) =>
        g.metaKey || g.ctrlKey ? "tab" : "replace",
      historyScope: () => "default",
      formatKeybinding: (k: string) => k,
      notify: () => {},
    },
    contributions: {
      list: (kind: string) => (kind === "documentMenu" ? menu : NONE),
      subscribe: () => () => {},
    },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
}

const tab: TabInfo = {
  id: "t1",
  groupId: "g1",
  path: HOME_PATH,
  isActive: true,
  isFocused: true,
};

function show(commandIds: string[] = []) {
  return render(
    <BackendProvider backend={backend}>
      <HostProvider host={hostWith(commandIds)}>
        <HomeView tab={tab} />
      </HostProvider>
    </BackendProvider>,
  );
}

const type = async (text: string) => {
  await act(async () => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  });
};

const jumpTitles = () =>
  within(screen.getByRole("region", { name: "Jump back in" }))
    .getAllByRole("link")
    .map((b) => b.textContent);

test("jump back in: opened here first, then recent changes; parents, times, trash", async () => {
  stored.set(recentKey(WS), [
    { id: B, at: 2 },
    { id: A, at: 1 },
    { id: C, at: 0 },
  ]);
  rows[`doc.get:${A}`] = [{ document: doc(A, "Alpha", { parentId: FOLDER }), body: null }];
  rows[`doc.get:${B}`] = [{ document: doc(B, "Beta"), body: null }];
  rows[`doc.get:${C}`] = [{ document: doc(C, "Gone", { deletedAt: T }), body: null }];
  rows[`doc.get:${FOLDER}`] = [{ document: doc(FOLDER, "Projects"), body: null }];
  rows[`doc.get:${D}`] = [{ document: doc(D, "Delta"), body: null }];
  rows[`doc.recent:${WS}`] = [doc(D, "Delta"), doc(A, "Alpha")];
  show();
  await waitFor(() => expect(jumpTitles().length).toBe(3));
  const titles = jumpTitles();
  expect(titles[0]).toStartWith("Beta");
  expect(titles[1]).toStartWith("AlphaProjects");
  expect(titles[2]).toStartWith("Delta");
  // A trashed document leaves the device's list.
  await waitFor(() =>
    expect((stored.get(recentKey(WS)) as { id: string }[]).map((o) => o.id)).toEqual([B, A]),
  );
  fireEvent.click(screen.getByRole("link", { name: /^Beta/ }));
  fireEvent.click(screen.getByRole("link", { name: /^Delta/ }), { metaKey: true });
  expect(opened).toEqual([
    { id: B, mode: "replace" },
    { id: D, mode: "tab" },
  ]);
  expect(screen.getByRole("combobox")).toBe(document.activeElement as HTMLElement);
});

test("jump back in: the tree's menu on right-click and the … button", async () => {
  stored.set(recentKey(WS), [{ id: A, at: 1 }]);
  rows[`doc.get:${A}`] = [{ document: doc(A, "Alpha"), body: null }];
  const ran: string[] = [];
  menu = [
    {
      pluginId: "p",
      id: "fav",
      label: (d: { title: string }) => `Favorite ${d.title}`,
      run: (d: { id: string }) => void ran.push(d.id),
    },
  ];
  show();
  const items = () => screen.getAllByRole("menuitem").map((i) => i.textContent);

  fireEvent.contextMenu(screen.getByRole("link", { name: /^Alpha/ }));
  await waitFor(() =>
    expect(items()).toEqual([
      "Open in new tab",
      "Open to the right",
      "New document inside",
      "Rename",
      "Favorite Alpha",
      "Move to trash",
    ]),
  );
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Favorite Alpha" })));
  expect(ran).toEqual([A]);

  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" })),
  );
  await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" })));
  const input = await screen.findByRole("textbox", { name: "Document title" });
  fireEvent.change(input, { target: { value: "Alpha two" } });
  await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
  expect(executed).toEqual([{ id: "doc.rename", input: { id: A, title: "Alpha two" } }]);

  fireEvent.contextMenu(screen.getByRole("link", { name: /^Alpha/ }));
  await act(async () =>
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to trash" })),
  );
  await waitFor(() => expect(executed.at(-1)).toEqual({ id: "doc.delete", input: { id: A } }));
});

test("an empty workspace says how to start", () => {
  show();
  expect(screen.getByText(/Nothing here yet/)).toBeDefined();
  expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();
});

test("start here: the Getting started page while it exists, not repeated below", async () => {
  const welcome = gettingStartedId(WS);
  rows[`doc.get:${welcome}`] = [{ document: doc(welcome, "Getting started"), body: null }];
  rows[`doc.get:${A}`] = [{ document: doc(A, "Alpha"), body: null }];
  rows[`doc.recent:${WS}`] = [doc(welcome, "Getting started"), doc(A, "Alpha")];
  show();
  const start = screen.getByRole("region", { name: "Start here" });
  fireEvent.click(within(start).getByRole("link", { name: /Getting started/ }));
  expect(opened).toEqual([{ id: welcome, mode: "replace" }]);
  await waitFor(() => expect(jumpTitles().length).toBe(1));
  expect(jumpTitles()[0]).toStartWith("Alpha");
  cleanup();

  // In the trash: left out.
  rows[`doc.get:${welcome}`] = [
    { document: doc(welcome, "Getting started", { deletedAt: T }), body: null },
  ];
  show();
  expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();
});

test("find: titles, then text hits, then create; keyboard and pointer", async () => {
  tree = [doc(A, "Roadmap"), doc(B, "Groceries")];
  rows[`doc.search:${WS}`] = [
    { id: A, title: "Roadmap", snippet: "the <mark>road</mark>", score: 1 },
    { id: C, title: "Trip notes", snippet: "a long <mark>road</mark> ahead", score: 2 },
  ];
  show();
  await type("road");
  await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options[0]).toStartWith("Roadmap");
  // The text hit for a document already listed by title is not repeated.
  expect(options[1]).toContain("Trip notesa long road ahead");
  expect(options[2]).toContain("Create “road”");
  expect(screen.queryByRole("region", { name: "Jump back in" })).toBeNull();

  const box = screen.getByRole("combobox");
  fireEvent.keyDown(box, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(box, { key: "Enter", metaKey: true });
  expect(opened).toEqual([{ id: C, mode: "tab" }]);
  expect((box as HTMLInputElement).value).toBe("");

  await type("Plan");
  await waitFor(() => screen.getByRole("option", { name: /Create “Plan”/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: /Create “Plan”/ }));
  });
  await waitFor(() => expect(opened.at(-1)).toEqual({ id: D, mode: "replace" }));
  expect(created).toEqual([{ workspaceId: WS, title: "Plan" }]);
});

test("an exact title match offers no create; Escape clears the box", async () => {
  tree = [doc(A, "Roadmap")];
  show();
  await type("roadmap");
  await waitFor(() => screen.getByRole("option", { name: /Roadmap/ }));
  expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
});
