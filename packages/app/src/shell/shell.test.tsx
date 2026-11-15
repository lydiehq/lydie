// The host with real backends (SQLite through the Node driver) in happy-dom: tab pooling, render
// isolation, global undo and layout restore.
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createTestPlatform } from "@lydie/platform/testing";
import {
  definePlugin,
  docIdOf,
  docPath,
  prefetchDoc,
  useQuery,
  useQuerySelect,
} from "@lydie/plugin-api";
import type { PluginDef, ViewProps } from "@lydie/plugin-api";
import { pageRowViewParams } from "@lydie/plugin-api/databases";
import { createRuntime } from "@lydie/runtime";
import { openNodeStore } from "@lydie/store/node";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";

import { createEventHub, createLocalBackend } from "../backend/local.ts";
import { handledOperations } from "../backend/registry.ts";
import { createMemoryStorage } from "../host/stores.ts";
import { startApp } from "../start.ts";
import { LydieApp } from "./LydieApp.tsx";

const WS = "01973200-0000-0000-0000-000000000000";
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  cleanup();
  for (const fn of closers.splice(0).reverse()) await fn();
});

const counts = {
  mounts: new Map<string, number>(),
  renders: new Map<string, number>(),
  titles: new Map<string, number>(),
};
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

// A doc view that counts mounts and renders and reads the body (like the editor).
function CountingView({ tab }: ViewProps) {
  const id = docIdOf(tab.path) ?? "";
  bump(counts.renders, id);
  useEffect(() => {
    bump(counts.mounts, id);
  }, [id]);
  const { data } = useQuery("doc.get", { id, includeBody: true });
  return <div data-testid={`view-${id}`}>{data[0]?.body?.markdown ?? ""}</div>;
}

function CountingTitle({ path }: { path: string }) {
  const id = docIdOf(path) ?? "";
  bump(counts.titles, id);
  const title = useQuerySelect("doc.get", { id }, (s) => s.data[0]?.document.title ?? "");
  return <>{title}</>;
}

const menuRuns: string[] = [];

const testPlugin = definePlugin({
  id: "test-views",
  name: "Test views",
  activate(ctx) {
    ctx.views.register({
      path: "/d/:id",
      component: CountingView,
      tabTitle: CountingTitle as never,
    });
    ctx.documentMenu.register({
      id: "test.stamp",
      label: "Stamp page",
      run: (doc) => void menuRuns.push(doc.id),
    });
  },
});

async function setup(
  options: {
    path?: string;
    storage?: ReturnType<typeof createMemoryStorage>;
    platform?: Parameters<typeof createTestPlatform>[0];
    plugins?: readonly PluginDef[];
    holdMs?: number;
  } = {},
) {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/$/, "");
  const path = options.path ?? `${tmp}/lydie-shell-${crypto.randomUUID()}.sqlite`;
  const store = await openNodeStore({ path });
  const hub = createEventHub();
  const runtime = createRuntime({
    ...store.ports,
    registry: handledOperations(),
    events: hub.port,
    actor: { type: "user", id: "u1" },
  });
  const backend = createLocalBackend({
    store,
    runtime,
    events: hub,
    info: { workspaceId: WS, workspaceName: "Test", persistent: true },
  });
  const platform = createTestPlatform(options.platform);
  const host = await startApp({
    backend,
    platform,
    plugins: [testPlugin, ...(options.plugins ?? [])],
    ...(options.holdMs !== undefined ? { holdMs: options.holdMs } : {}),
    storage: options.storage ?? createMemoryStorage(),
    layoutDebounceMs: 0,
  });
  const close = async () => {
    host.dispose();
    await host.layout.flush();
    await backend.close();
    await store.close();
  };
  closers.push(close);
  return { host, backend, runtime, path, close, platform };
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function waitFor(predicate: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error("Timed out");
    await settle(10);
  }
}

function resetCounts() {
  counts.mounts.clear();
  counts.renders.clear();
  counts.titles.clear();
}

describe("shell", () => {
  test("switching to a pooled tab mounts nothing; changing one tab re-renders nothing else", async () => {
    resetCounts();
    const { host, backend } = await setup();
    const docs: { id: string }[] = [];
    for (const title of ["One", "Two", "Three"]) {
      docs.push(
        await backend.ops.doc.create({ workspaceId: WS, title, markdown: `${title} body` }),
      );
    }
    render(<LydieApp host={host} />);
    await act(async () => {
      // The first replaces the window's Home tab.
      docs.forEach((doc, i) => host.app.openDoc(doc.id, { mode: i === 0 ? "replace" : "tab" }));
    });
    await waitFor(() => screen.queryByText("Three body") !== null);
    // Visit every tab once so all are pooled.
    const tabs = screen.getAllByTestId("tab");
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      await act(async () => fireEvent.click(tab));
    }
    await settle();
    const mountsBefore = new Map(counts.mounts);
    for (const doc of docs) expect(mountsBefore.get(doc.id)).toBe(1);

    // Switch back and forth: no view mounts again.
    for (const tab of [tabs[0]!, tabs[2]!, tabs[1]!]) {
      await act(async () => fireEvent.click(tab));
    }
    await settle();
    expect(counts.mounts).toEqual(mountsBefore);
    // Hidden views stay in the DOM.
    expect(screen.getAllByTestId("tab-view")).toHaveLength(3);

    // "Typing" in tab Two: a body save and a tab-state write. Only Two's view renders.
    const rendersBefore = new Map(counts.renders);
    const titlesBefore = new Map(counts.titles);
    await act(async () => {
      await backend.ops.doc.updateBody(
        { id: docs[1]!.id, markdown: "Two edited" },
        { history: false },
      );
    });
    await waitFor(() => screen.queryByText("Two edited") !== null);
    const twoTab = host.layout.getState().windows[0]!.root;
    const twoTabId = twoTab.type === "group" ? twoTab.tabs[1]!.id : "";
    await act(async () => host.app.setTabState(twoTabId, { scroll: 120 }));
    await settle();
    expect(counts.renders.get(docs[0]!.id)).toBe(rendersBefore.get(docs[0]!.id));
    expect(counts.renders.get(docs[2]!.id)).toBe(rendersBefore.get(docs[2]!.id));
    expect(counts.renders.get(docs[1]!.id)!).toBeGreaterThan(rendersBefore.get(docs[1]!.id)!);
    // The tab bar titles did not re-render (the body save does not change the title).
    expect(counts.titles).toEqual(titlesBefore);
  });

  test("the pool evicts the least recently used view beyond its limit", async () => {
    resetCounts();
    const { host, backend } = await setup();
    const docs: { id: string }[] = [];
    for (let i = 0; i < 12; i++)
      docs.push(await backend.ops.doc.create({ workspaceId: WS, title: `D${i}` }));
    render(<LydieApp host={host} />);
    for (const [i, doc] of docs.entries()) {
      await act(async () => host.app.openDoc(doc.id, { mode: i === 0 ? "replace" : "tab" }));
      await settle(5);
    }
    await settle(50);
    // Default pool: 8 views; the active one is always mounted.
    expect(screen.getAllByTestId("tab-view").length).toBeLessThanOrEqual(host.pool.limit);
    // Re-activating an evicted tab mounts it again.
    const first = screen.getAllByTestId("tab")[0]!;
    await act(async () => fireEvent.click(first));
    await settle();
    expect(counts.mounts.get(docs[0]!.id)).toBe(2);
  });

  test("palette operations get the open document only where they require an id", async () => {
    const { host, backend } = await setup();
    const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Open" });
    render(<LydieApp host={host} />);
    await act(async () => host.app.openDoc(doc.id));
    await settle();
    // database.create's optional `id` mints the new document; passing the open one conflicted.
    await act(async () => host.app.runCommand("op.database.create"));
    await settle();
    expect(host.toasts.get()).toEqual([]);
    const databases = await backend.query("database.list", { workspaceId: WS });
    expect(databases).toHaveLength(1);
    expect(databases[0]!.id).not.toBe(doc.id);
  });

  test("New document goes first among its siblings", async () => {
    const { host, backend } = await setup();
    for (const title of ["A", "B"]) await backend.ops.doc.create({ workspaceId: WS, title });
    await act(async () => host.app.runCommand("core.newDocument"));
    const top = await backend.query("doc.children", { workspaceId: WS, parentId: null });
    expect(top.map((d) => d.title)).toEqual(["Untitled", "A", "B"]);
  });

  test("Notion's page shortcuts: parent (Mod+Shift+U), copy link (Mod+L), Mod+N", async () => {
    const { host, backend } = await setup();
    const parent = await backend.ops.doc.create({ workspaceId: WS, title: "Projects" });
    const child = await backend.ops.doc.create({
      workspaceId: WS,
      title: "Plan",
      parentId: parent.id,
    });
    render(<LydieApp host={host} />);
    await act(async () => host.app.openDoc(child.id));
    const written: string[] = [];
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    try {
      await act(async () => host.app.runCommand("core.copyLink"));
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
    }
    expect(written).toEqual(["[[Plan]]"]);
    await act(async () => host.app.runCommand("core.goToParent"));
    expect(host.app.activeTab()?.path).toBe(docPath(parent.id));
    const binding = (id: string) => host.app.commands().find((c) => c.id === id)?.keybindings;
    expect(binding("core.goToParent")).toEqual(["Mod+Shift+U"]);
    expect(binding("core.copyLink")).toEqual(["Mod+L"]);
    expect(binding("core.newDocument")).toEqual(["Mod+N", "Mod+Alt+N", "C"]);
  });

  test("in a browser tab, the browser's own shortcuts stay the browser's", async () => {
    const { host } = await setup({ platform: { capabilities: { browserTab: true } } });
    const binding = (id: string) => host.app.commands().find((c) => c.id === id)?.keybindings;
    expect(binding("core.newDocument")).toEqual(["Mod+Alt+N", "C"]);
    expect(binding("core.newTab")).toEqual([]);
    expect(binding("core.splitRight")).toEqual(["Mod+\\"]);
    render(<LydieApp host={host} />);
    await settle();
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    document.body.addEventListener("keydown", listener);
    const tabs = screen.queryAllByTestId("tab").length;
    try {
      // Ctrl+T (new browser tab) and Ctrl+Shift+I (developer tools) reach nothing in the page and
      // are not prevented; Ctrl+K still opens the palette.
      for (const init of [
        { key: "t", code: "KeyT", ctrlKey: true },
        { key: "I", code: "KeyI", ctrlKey: true, shiftKey: true },
      ]) {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        await act(async () => void document.body.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
      }
      expect(seen).toEqual([]);
      expect(screen.queryAllByTestId("tab")).toHaveLength(tabs);
      await act(async () => void fireEvent.keyDown(document.body, { key: "k", ctrlKey: true }));
      expect(host.overlay.get()?.id).toBe("core.palette");
      expect(seen).toEqual(["k"]);
    } finally {
      document.body.removeEventListener("keydown", listener);
    }
  });

  test("app.confirm shows an in-app dialog, one request at a time, and pauses keybindings", async () => {
    const { host, platform } = await setup();
    const native = spyOn(platform.dialogs, "confirm");
    render(<LydieApp host={host} />);
    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = host.app.confirm({ message: "First?", confirmLabel: "Yes", destructive: true });
      second = host.app.confirm({ message: "Second?" });
    });
    await screen.findByRole("alertdialog", { name: "First?" });
    // Mod+K would open the palette under the dialog (the test platform is not macOS).
    const modK = () => act(async () => void fireEvent.keyDown(window, { key: "k", ctrlKey: true }));
    await modK();
    expect(host.overlay.get()).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Yes" })));
    expect(await first).toBe(true);
    await screen.findByRole("alertdialog", { name: "Second?" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(await second).toBe(false);
    expect(host.confirms.get()).toEqual([]);
    expect(native).not.toHaveBeenCalled();
    await modK();
    expect(host.overlay.get()?.id).toBe("core.palette");
  });

  test("Delete document asks only when the document has content", async () => {
    const { host, backend } = await setup();
    const empty = await backend.ops.doc.create({ workspaceId: WS, title: "Blank" });
    const full = await backend.ops.doc.create({ workspaceId: WS, title: "Plan", markdown: "Ship" });
    render(<LydieApp host={host} />);
    const isDeleted = async (id: string) =>
      (await backend.query("doc.get", { id, includeBody: false }))[0]?.document.deletedAt !== null;

    await act(async () => host.app.openDoc(empty.id));
    await settle();
    await act(async () => host.app.runCommand("op.doc.delete"));
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(await isDeleted(empty.id)).toBe(true);

    await act(async () => host.app.openDoc(full.id));
    await settle();
    let run: Promise<void> | undefined;
    await act(async () => void (run = host.app.runCommand("op.doc.delete")));
    const dialog = await screen.findByRole("alertdialog", { name: "Move “Plan” to the trash?" });
    expect(await isDeleted(full.id)).toBe(false);
    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Move to trash" })),
    );
    await run;
    expect(await isDeleted(full.id)).toBe(true);
  });

  test("the palette searches documents by body text and opens the one chosen", async () => {
    const { host, backend } = await setup();
    const doc = await backend.ops.doc.create({
      workspaceId: WS,
      title: "Recipes",
      markdown: "Grandma's tomato soup with basil",
    });
    render(<LydieApp host={host} />);
    await act(async () => host.app.runCommand("core.palette"));
    const box = await screen.findByRole("combobox", { name: "Command palette" });
    await act(async () => fireEvent.change(box, { target: { value: "basil" } }));
    await waitFor(() => screen.queryByRole("option", { name: /Recipes/ }) !== null);
    // Commands that merely contain the letters rank under the documents.
    expect(screen.getAllByRole("option")[0]!.textContent).toContain("Recipes");
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    await settle();
    expect(host.app.activeTab()?.path).toBe(docPath(doc.id));
    expect(screen.queryByRole("combobox", { name: "Command palette" })).toBeNull();
  });

  test("palette: grouped with icons when empty; title matches lead with their group as breadcrumb", async () => {
    const { host } = await setup();
    render(<LydieApp host={host} />);
    await act(async () => host.app.runCommand("core.palette"));
    const box = await screen.findByRole("combobox", { name: "Command palette" });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(5);
    for (const option of options) expect(option.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Tabs")).toBeTruthy();
    await act(async () => fireEvent.change(box, { target: { value: "split" } }));
    const first = screen.getAllByRole("option")[0]!;
    expect(first.textContent).toContain("Tabs");
    expect(first.textContent).toContain("Split");
  });

  test("palette: the open document is a pill whose actions lead; removing it leaves them out", async () => {
    menuRuns.length = 0;
    const { host, backend } = await setup();
    const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Plan" });
    render(<LydieApp host={host} />);
    await act(async () => host.app.openDoc(doc.id));
    await settle();
    await act(async () => host.app.runCommand("core.palette"));
    const box = await screen.findByRole("combobox", { name: "Command palette" });
    await waitFor(() => screen.queryByTestId("picker-context") !== null);
    expect(screen.getByTestId("picker-context").textContent).toContain("Plan");
    const titles = () => screen.getAllByRole("option").map((o) => o.textContent ?? "");
    // The document's menu items and operations come first; Restore only applies to deleted ones.
    expect(titles()[0]).toContain("Stamp page");
    expect(titles()[1]).toContain("Delete document");
    expect(titles().some((t) => t.includes("Restore document"))).toBe(false);

    await act(async () => fireEvent.change(box, { target: { value: "stamp" } }));
    expect(titles()[0]).toContain("Stamp page");
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(menuRuns).toEqual([doc.id]);

    await act(async () => host.app.runCommand("core.palette"));
    const again = await screen.findByRole("combobox", { name: "Command palette" });
    await waitFor(() => screen.queryByTestId("picker-context") !== null);
    await act(async () => fireEvent.keyDown(again, { key: "Backspace" }));
    expect(screen.queryByTestId("picker-context")).toBeNull();
    expect(titles().some((t) => t.includes("Delete document") || t.includes("Stamp page"))).toBe(
      false,
    );
  });

  test("palette: a command with choices opens them as a page; the chosen one is its args", async () => {
    const runs: unknown[] = [];
    const queries: string[] = [];
    const picker = definePlugin({
      id: "test-choices",
      name: "Test choices",
      activate(ctx) {
        ctx.commands.register({
          id: "test.pickFruit",
          title: "Pick fruit",
          choices: {
            placeholder: "Search fruit",
            list: async (query) => {
              queries.push(query);
              return [
                { id: "apple", title: "Apple" },
                { id: "pear", title: "Pear", current: true },
              ].filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
            },
          },
          run: ({ args }) => void runs.push(args),
        });
      },
    });
    const { host } = await setup({ plugins: [picker] });
    render(<LydieApp host={host} />);
    const titles = () => screen.getAllByRole("option").map((o) => o.textContent ?? "");
    const open = async () => {
      if (!screen.queryByRole("combobox", { name: "Command palette" })) {
        await act(async () => host.app.runCommand("core.palette"));
      }
      const box = await screen.findByRole("combobox", { name: "Command palette" });
      await act(async () => fireEvent.change(box, { target: { value: "pick fruit" } }));
      await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
      await waitFor(() => screen.queryByRole("option", { name: /Apple/ }) !== null);
      return box;
    };

    const box = await open();
    // Entering the page leaves the palette open, with the command as its pill and an empty search.
    expect(runs).toEqual([]);
    expect(screen.getByTestId("picker-context").textContent).toContain("Pick fruit");
    expect((box as HTMLInputElement).value).toBe("");
    expect(box.getAttribute("placeholder")).toBe("Search fruit");
    expect(titles()).toEqual(["Apple", "Pear(current)"]);
    await act(async () => fireEvent.change(box, { target: { value: "pe" } }));
    await waitFor(() => titles().length === 1);
    expect(queries.at(-1)).toBe("pe");
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    await settle();
    expect(runs).toEqual(["pear"]);
    expect(screen.queryByRole("combobox", { name: "Command palette" })).toBeNull();

    // Escape and Backspace in the empty search go back to the commands, without closing.
    const again = await open();
    await act(async () => fireEvent.keyDown(again, { key: "Escape" }));
    expect(screen.queryByRole("combobox", { name: "Command palette" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: /Apple/ })).toBeNull();
    const third = await open();
    await act(async () => fireEvent.keyDown(third, { key: "Backspace" }));
    expect(screen.queryByRole("option", { name: /Apple/ })).toBeNull();
    expect(runs).toEqual(["pear"]);
  });

  test("Cmd+Z outside the editor undoes the active tab's operations", async () => {
    const { host, backend } = await setup();
    const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Before" });
    render(<LydieApp host={host} />);
    await act(async () => host.app.openDoc(doc.id));
    await settle();
    await act(async () => {
      await backend.ops.doc.rename(
        { id: doc.id, title: "After" },
        { scope: host.app.historyScope() },
      );
    });
    await waitFor(() => backend.history.canUndo(host.app.historyScope()));
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "z", code: "KeyZ", ctrlKey: true, metaKey: false });
    });
    await waitFor(() => backend.history.canRedo(host.app.historyScope()));
    expect(host.toasts.get()).toEqual([]);
    expect((await backend.ops.doc.get({ id: doc.id })).document.title).toBe("Before");
    // Inside a text field Cmd+Z belongs to the field.
    const input = document.createElement("input");
    document.body.append(input);
    await act(async () => {
      fireEvent.keyDown(input, { key: "z", code: "KeyZ", ctrlKey: true });
    });
    await settle();
    expect(backend.history.canRedo(host.app.historyScope())).toBe(true);
    input.remove();
  });

  test("keyboard: new tab, close, reopen, split, back and forward", async () => {
    const { host, backend } = await setup();
    const a = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await backend.ops.doc.create({ workspaceId: WS, title: "B" });
    render(<LydieApp host={host} />);
    const key = (init: Record<string, unknown>) =>
      act(async () => {
        fireEvent.keyDown(document.body, { ctrlKey: true, ...init });
      });
    await act(async () => host.app.openDoc(a.id));
    await act(async () => host.app.openDoc(b.id));
    await settle();
    // Back/forward within the tab.
    await key({ key: "[", code: "BracketLeft" });
    expect(host.app.activeTab()?.path).toBe(docPath(a.id));
    await key({ key: "]", code: "BracketRight" });
    expect(host.app.activeTab()?.path).toBe(docPath(b.id));
    // New tab, close it, reopen it.
    await key({ key: "t", code: "KeyT" });
    expect(screen.getAllByTestId("tab")).toHaveLength(2);
    await key({ key: "w", code: "KeyW" });
    expect(screen.getAllByTestId("tab")).toHaveLength(1);
    await key({ key: "T", code: "KeyT", shiftKey: true });
    expect(screen.getAllByTestId("tab")).toHaveLength(2);
    // Split right.
    await key({ key: "\\", code: "Backslash" });
    expect(screen.getAllByTestId("tab-group")).toHaveLength(2);
    // Cmd+1 goes to the first tab of the focused group.
    await key({ key: "1", code: "Digit1" });
    expect(host.app.activeTab()).not.toBeNull();
  });

  test("Linear's keys: G then X sequences and bare keys, only outside text, dialogs and lists", async () => {
    const { host } = await setup();
    const runs: string[] = [];
    for (const [id, keybinding] of [
      ["test.goX", "G X"],
      ["test.help", "?"],
      ["test.y", "Y"],
    ] as const) {
      host.contributions.add("command", "test", {
        id,
        title: id,
        keybinding,
        run: () => void runs.push(id),
      });
    }
    render(
      <>
        <LydieApp host={host} />
        <input aria-label="Field" />
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a list like react-aria's */}
        <div role="listbox" tabIndex={-1} aria-label="List" />
      </>,
    );
    await settle();
    const press = (init: { key: string; code?: string; shiftKey?: boolean; repeat?: boolean }) =>
      act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, init));

    await press({ key: "g", code: "KeyG" });
    await press({ key: "Shift" });
    await press({ key: "x", code: "KeyX" });
    expect(runs).toEqual(["test.goX"]);
    // X alone is nothing; a key that does not continue the sequence is read on its own.
    await press({ key: "x", code: "KeyX" });
    await press({ key: "g", code: "KeyG" });
    await press({ key: "y", code: "KeyY" });
    expect(runs).toEqual(["test.goX", "test.y"]);
    await press({ key: "?", code: "Slash", shiftKey: true });
    expect(runs).toEqual(["test.goX", "test.y", "test.help"]);
    // Held down, a bare key does not repeat.
    await press({ key: "y", code: "KeyY", repeat: true });
    expect(runs).toHaveLength(3);

    // Typing, a list's own keys and an open overlay keep their letters.
    for (const label of ["Field", "List"]) {
      act(() => screen.getByLabelText(label).focus());
      await press({ key: "g", code: "KeyG" });
      await press({ key: "x", code: "KeyX" });
      await press({ key: "y", code: "KeyY" });
    }
    act(() => (document.activeElement as HTMLElement).blur());
    await act(async () => host.app.runCommand("core.palette"));
    await press({ key: "y", code: "KeyY" });
    expect(runs).toHaveLength(3);
  });

  test("back and forward buttons and two-finger swipes follow the tab's history", async () => {
    const { host, backend, platform } = await setup({
      platform: { capabilities: { trackpad: true } },
    });
    const a = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await backend.ops.doc.create({ workspaceId: WS, title: "B" });
    render(<LydieApp host={host} />);
    const back = () => screen.getByRole("button", { name: /^Go back/ });
    const forward = () => screen.getByRole("button", { name: /^Go forward/ });
    await act(async () => host.app.openDoc(a.id));
    await act(async () => host.app.openDoc(b.id));
    await settle();
    expect(back().hasAttribute("disabled")).toBe(false);
    expect(forward().hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.click(back()));
    expect(host.app.activeTab()?.path).toBe(docPath(a.id));
    expect(back().hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.click(forward()));
    expect(host.app.activeTab()?.path).toBe(docPath(b.id));
    // Scrolling left past the start goes back when the fingers lift.
    const scroll = (phase: "began" | "changed" | "ended", deltaX: number, timeStamp: number) =>
      platform.test.trackpadScroll({
        phase,
        momentumPhase: "none",
        deltaX,
        deltaY: 0,
        swipeEnabled: true,
        timeStamp,
        x: 400,
        y: 300,
      });
    await act(async () => {
      scroll("began", 0, 0);
      for (let i = 1; i <= 20; i++) scroll("changed", -12, i * 16);
    });
    expect(host.app.activeTab()?.path).toBe(docPath(b.id));
    await act(async () => scroll("ended", 0, 21 * 16));
    expect(host.app.activeTab()?.path).toBe(docPath(a.id));
  });

  test("collapsed, the left edge (not the toggle) peeks at the sidebar until the pointer leaves", async () => {
    const { host } = await setup();
    host.shell.set((s) => ({ ...s, sidebarOpen: false }));
    render(<LydieApp host={host} />);
    await settle();
    const ledge = document.querySelector<HTMLElement>("div[data-sidebar-peek-trigger]")!;
    const toggle = screen.getByRole("button", { name: /^Expand sidebar/ });
    const away = screen.getByTestId("tab-bar");
    const peek = () => screen.queryByTestId("sidebar-peek")?.dataset.peek ?? "closed";
    // The pointer has to have been elsewhere first (an edge dragged to collapse it).
    fireEvent.pointerMove(ledge);
    await settle(150);
    expect(peek()).toBe("closed");
    fireEvent.pointerMove(away);
    fireEvent.pointerMove(ledge);
    await settle(150);
    expect(peek()).toBe("open");
    expect(screen.getByTestId("sidebar").closest("[inert]")).toBeNull();
    fireEvent.pointerMove(screen.getByTestId("sidebar"));
    await settle(400);
    expect(peek()).toBe("open");
    // A menu opened from the peek is drawn outside the shell and holds it open.
    const portal = document.body.appendChild(document.createElement("div"));
    fireEvent.pointerMove(portal);
    await settle(400);
    expect(peek()).toBe("open");
    portal.remove();
    fireEvent.pointerMove(away);
    await settle(300);
    expect(peek()).toBe("leaving");
    await settle(300);
    expect(peek()).toBe("closed");
    expect(screen.getByTestId("sidebar").closest("[inert]")).not.toBeNull();
    // Hovering the toggle does not peek; pressing it expands the sidebar.
    fireEvent.pointerMove(toggle);
    await settle(150);
    expect(peek()).toBe("closed");
    fireEvent.pointerMove(ledge);
    await settle(150);
    expect(peek()).toBe("open");
    fireEvent.keyDown(window, { key: "Escape" });
    await settle(250);
    expect(peek()).toBe("closed");
    // Opened for good, the sidebar is in the layout again.
    await act(async () => fireEvent.click(toggle));
    await settle();
    expect(peek()).toBe("closed");
    expect(document.querySelector("div[data-sidebar-peek-trigger]")).toBeNull();
  });

  test("the first collapse on a device points at the edge that peeks; the peek puts it away", async () => {
    const { host } = await setup();
    render(<LydieApp host={host} />);
    await settle();
    const hint = () => screen.queryByTestId("peek-hint")?.dataset.shown !== undefined;
    const setOpen = (sidebarOpen: boolean) =>
      act(async () => host.shell.set((s) => ({ ...s, sidebarOpen })));
    expect(hint()).toBe(false);
    await setOpen(false);
    await settle();
    expect(hint()).toBe(true);
    expect(screen.getByText(/left edge to show the sidebar/).tagName).toBe("OUTPUT");
    const ledge = () => document.querySelector<HTMLElement>("div[data-sidebar-peek-trigger]");
    await waitFor(() => ledge() !== null);
    expect(hint()).toBe(true);
    fireEvent.pointerMove(screen.getByTestId("tab-bar"));
    fireEvent.pointerMove(ledge()!);
    await settle(150);
    expect(hint()).toBe(false);
    await setOpen(true);
    await setOpen(false);
    await settle();
    expect(hint()).toBe(false);
  });

  test("a browser tab has no back and forward buttons", async () => {
    const { host } = await setup({ platform: { capabilities: { browserTab: true } } });
    render(<LydieApp host={host} />);
    await settle();
    expect(screen.queryByRole("button", { name: /^Go back/ })).toBeNull();
  });

  test("tabs leave a document when it goes to the trash, but not one opened from the trash", async () => {
    const { host, backend } = await setup();
    const folder = await backend.ops.doc.create({ workspaceId: WS, title: "Folder" });
    const child = await backend.ops.doc.create({
      workspaceId: WS,
      title: "Child",
      parentId: folder.id,
    });
    const other = await backend.ops.doc.create({ workspaceId: WS, title: "Other" });
    const pathOf = (tabId: string) => host.layout.getTab(tabId)?.path;
    render(<LydieApp host={host} />);

    // Back to the page before.
    await act(async () => host.app.openDoc(other.id));
    const first = host.app.activeTab()!.id;
    await act(async () => host.app.openDoc(child.id));
    await settle();
    await act(async () => void (await backend.ops.doc.delete({ id: child.id })));
    await waitFor(() => pathOf(first) === docPath(other.id));
    expect(host.layout.getTab(first)!.forward).toEqual([]);

    // No history: to the parent.
    await act(async () => void (await backend.ops.doc.restore({ id: child.id })));
    await act(async () => host.app.openDoc(child.id, { mode: "tab" }));
    const second = host.app.activeTab()!.id;
    await settle();
    await act(async () => void (await backend.ops.doc.delete({ id: child.id })));
    await waitFor(() => pathOf(second) === docPath(folder.id));

    // The folder goes with its child: back would land on the folder, so to a new tab page.
    await act(async () => void (await backend.ops.doc.restore({ id: child.id })));
    await act(async () => host.app.openDoc(child.id));
    await settle();
    expect(pathOf(second)).toBe(docPath(child.id));
    await act(async () => void (await backend.ops.doc.delete({ id: folder.id })));
    await waitFor(() => pathOf(second) === "/");

    // Opened from the trash: it stays.
    await act(async () => host.app.openDoc(child.id));
    await settle(100);
    expect(pathOf(second)).toBe(docPath(child.id));
  });

  test("the layout is restored after a restart", async () => {
    const storage = createMemoryStorage();
    const first = await setup({ storage });
    const a = await first.backend.ops.doc.create({ workspaceId: WS, title: "A" });
    const b = await first.backend.ops.doc.create({ workspaceId: WS, title: "B" });
    first.host.app.openDoc(a.id);
    first.host.app.openDoc(b.id, { mode: "split" });
    first.host.app.setTabState(first.host.app.activeTab()!.id, { scroll: 42 });
    const before = first.host.layout.getState();
    await first.close();
    closers.splice(closers.indexOf(first.close), 1);

    const second = await setup({ path: first.path, storage });
    expect(second.host.layout.getState()).toEqual(before);
    expect(second.host.app.activeTab()?.path).toBe(docPath(b.id));
  });

  test("a page with a preload opens once its data is here; the open page stays meanwhile", async () => {
    const ready = new Map<string, () => void>();
    const slow = definePlugin({
      id: "test-slow",
      name: "Slow pages",
      activate(ctx) {
        ctx.views.register({
          path: "/slow/:id",
          component: () => null,
          // "/slow/here" has its data already.
          preload: (path) =>
            path === "/slow/here"
              ? undefined
              : new Promise<void>((resolve) => ready.set(path, resolve)),
        });
      },
    });
    const { host } = await setup({ plugins: [slow], holdMs: 80 });
    const path = () => host.app.activeTab()?.path;
    const start = path();

    host.app.open("/slow/here");
    expect(path()).toBe("/slow/here");

    host.app.open("/slow/a");
    expect(path()).toBe("/slow/here");
    ready.get("/slow/a")!();
    await settle(0);
    expect(path()).toBe("/slow/a");

    // Data that does not come in time: the page opens anyway and shows its own loading state.
    host.app.open("/slow/b");
    expect(path()).toBe("/slow/a");
    await settle(120);
    expect(path()).toBe("/slow/b");

    // Going elsewhere drops a waiting page.
    host.app.open("/slow/c");
    host.app.open("/slow/here");
    ready.get("/slow/c")!();
    await settle(120);
    expect(path()).toBe("/slow/here");
    expect(start).not.toBe("/slow/here");
  });

  test("prefetchDoc holds a page's queries: the view's first read has the body and its parents", async () => {
    const { backend } = await setup();
    const parent = await backend.ops.doc.create({ workspaceId: WS, title: "Parent" });
    const child = await backend.ops.doc.create({
      workspaceId: WS,
      title: "Child",
      parentId: parent.id,
      markdown: "Hello",
    });
    const waiting = prefetchDoc(backend, child.id);
    expect(waiting).toBeInstanceOf(Promise);
    await waiting;
    const body = backend.live("doc.get", { id: child.id, includeBody: true }).getSnapshot();
    expect(body.isLoading).toBe(false);
    expect(body.data[0]?.body?.markdown).toBe("Hello");
    expect(backend.live("doc.get", { id: parent.id }).getSnapshot().data[0]?.document.title).toBe(
      "Parent",
    );
    // All of it is here: nothing to wait for.
    expect(prefetchDoc(backend, child.id)).toBeUndefined();
  });

  test("prefetchDoc holds a collection page's row view: relation titles paint with the page", async () => {
    const { backend } = await setup();
    const projects = await backend.ops.database.create({ workspaceId: WS, title: "Projects" });
    const project = await backend.ops.database.createRow({
      databaseId: projects.database.id,
      title: "Mobile onboarding",
    });
    const tasks = await backend.ops.database.create({ workspaceId: WS, title: "Tasks" });
    const relation = await backend.ops.database.addProperty({
      databaseId: tasks.database.id,
      name: "Project",
      type: "relation",
      config: { relation: { databaseId: projects.database.id } },
    });
    const task = await backend.ops.database.createRow({
      databaseId: tasks.database.id,
      title: "Write copy",
    });
    await backend.ops.database.setValues({
      databaseId: tasks.database.id,
      rowIds: [task.id],
      set: { [relation.id]: [project.id] },
    });

    await prefetchDoc(backend, task.id);
    const definition = backend.live("database.get", { id: tasks.database.id }).getSnapshot();
    const params = pageRowViewParams(definition.data[0]!, { title: "Write copy" })!;
    const view = backend.live("database.view", params).getSnapshot();
    expect(view.isLoading).toBe(false);
    const item = view.data.find((i) => i.kind === "row" && i.row.id === task.id);
    const row = item?.kind === "row" ? item.row : null;
    expect(row?.computed[relation.id]).toEqual([
      expect.objectContaining({ id: project.id, title: "Mobile onboarding" }),
    ]);
  });
});
