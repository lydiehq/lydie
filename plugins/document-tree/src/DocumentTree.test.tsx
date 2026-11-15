// The tree as other plugins use it (the hosted spaces sidebar): one space's top level, drops from
// another tree through `onForeignDrop`, drops within the tree as `doc.move`.
import { afterEach, describe, expect, mock, test } from "bun:test";

import { BackendProvider, HostProvider } from "@lydie/plugin-api";
import type { Backend, ChildEntry, HostBridge, LiveState, ToastOptions } from "@lydie/plugin-api";
import type { ConfirmOptions } from "@lydie/plugin-api/ui";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { DocumentTree } from "./DocumentTree.tsx";

afterEach(cleanup);

const T = "2026-11-13T00:00:00.000Z";
const doc = (id: string, title: string, teamspaceId: string | null): ChildEntry => ({
  id,
  workspaceId: "ws",
  parentId: null,
  title,
  sortKey: id,
  properties: {},
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  childCount: 0,
  teamspaceId,
});

const NONE: never[] = [];
const SYNCED = { sync: "synced" };
const pages = [doc("A1", "Roadmap", "t1"), doc("A2", "Notes", "t1"), doc("B1", "Diary", null)];
// Only the roadmap has a body; the others are empty pages.
const bodies: Record<string, string> = { A1: "Ship it", A2: "  \n", B1: "" };

function setup(top: ChildEntry[] = pages, { activeDocId }: { activeDocId?: string } = {}) {
  const activeTab = activeDocId ? { id: "tab", path: `/d/${activeDocId}` } : null;
  const confirms: ConfirmOptions[] = [];
  let answer = true;
  const queried: Record<string, unknown>[] = [];
  const executed: { id: string; input: unknown }[] = [];
  const transactions: { label: string; ops: { id: string; input: unknown }[] }[] = [];
  const opened: { id: string; mode: unknown }[] = [];
  const toasts: ToastOptions[] = [];
  const handles = new Map<string, unknown>();
  const backend = {
    info: { mode: "synced", workspaceId: "ws", workspaceName: "Team", persistent: true },
    status: { get: () => SYNCED, subscribe: () => () => {} },
    execute: async (id: string, input: unknown) => {
      executed.push({ id, input });
      return {};
    },
    transaction: async (label: string, fn: (ops: unknown) => Promise<unknown>) => {
      const ops: { id: string; input: unknown }[] = [];
      transactions.push({ label, ops });
      const record = (ns: string) =>
        new Proxy(
          {},
          {
            get: (_, m) => async (input: unknown) =>
              void ops.push({ id: `${ns}.${String(m)}`, input }),
          },
        );
      return fn(new Proxy({}, { get: (_, ns) => record(String(ns)) }));
    },
    query: async (name: string, params: { id?: string }) => {
      const page = top.find((p) => p.id === params.id);
      if (name === "doc.get" && page)
        return [{ document: page, body: { markdown: bodies[page.id] ?? "", version: 1 } }];
      return [];
    },
    live: (name: string, params: Record<string, unknown>) => {
      const key = JSON.stringify([name, params]);
      const known = handles.get(key);
      if (known) return known;
      if (name === "doc.children") queried.push(params);
      const data =
        name === "doc.children" && params.parentId === null
          ? top.filter(
              (p) => params.teamspaceId === undefined || p.teamspaceId === params.teamspaceId,
            )
          : [];
      const state: LiveState<unknown> = { data, isLoading: false, error: undefined };
      const handle = { key, getSnapshot: () => state, subscribe: () => () => {} };
      handles.set(key, handle);
      return handle;
    },
  } as unknown as Backend;
  const host = {
    app: {
      backend,
      storage: { get: () => null, set() {} },
      notify: (toast: ToastOptions) => void toasts.push(toast),
      confirm: async (options: ConfirmOptions) => {
        confirms.push(options);
        return answer;
      },
      formatKeybinding: () => "⌘Z",
      historyScope: () => "default",
      openDoc: (id: string, options?: { mode?: unknown }) =>
        opened.push({ id, mode: options?.mode }),
      modeFor: (gesture: { metaKey?: boolean; button?: number }) =>
        gesture.button === 1 || gesture.metaKey ? "tab" : "replace",
      activeTab: () => activeTab,
      subscribeActiveTab: () => () => {},
    },
    contributions: { list: () => NONE, subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  const setAnswer = (next: boolean) => void (answer = next);
  return { backend, host, queried, executed, transactions, opened, confirms, toasts, setAnswer };
}

// Bun's DOM has no DataTransfer: a minimal one that keeps types like a browser does.
function dataTransfer() {
  const data: Record<string, string> = {};
  return {
    types: [] as string[],
    effectAllowed: "all",
    dropEffect: "none",
    setData(type: string, value: string) {
      if (!(type in data)) this.types.push(type);
      data[type] = value;
    },
    getData: (type: string) => data[type] ?? "",
  };
}

function drag(from: HTMLElement, to: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(from, { dataTransfer: transfer });
  fireEvent.dragOver(to, { dataTransfer: transfer, clientY: 0 });
  fireEvent.drop(to, { dataTransfer: transfer, clientY: 0 });
}

// Delete looks at the documents (and may ask) before it acts: let those promises settle.
const pressDelete = (tree: HTMLElement) =>
  act(async () => {
    fireEvent.keyDown(tree, { key: "Delete" });
    await new Promise((r) => setTimeout(r, 0));
  });

const row = (tree: string, title: string) =>
  within(screen.getByRole("tree", { name: tree })).getByRole("treeitem", {
    name: new RegExp(title),
  });

describe("document tree over one space", () => {
  test("filters the top level; drops from another tree go to its handler", async () => {
    const { backend, host, queried, executed } = setup();
    const foreign = mock(async () => {});
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree
            label="General"
            scroll="parent"
            dragKey="t1"
            space={{ teamspaceId: "t1" }}
            onForeignDrop={foreign}
          />
          <DocumentTree
            label="Private"
            scroll="parent"
            dragKey="private"
            space={{ teamspaceId: null, privateOwnerId: "me" }}
          />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    expect(queried).toContainEqual({ workspaceId: "ws", parentId: null, teamspaceId: "t1" });
    expect(queried).toContainEqual({
      workspaceId: "ws",
      parentId: null,
      teamspaceId: null,
      privateOwnerId: "me",
    });
    expect(
      within(screen.getByRole("tree", { name: "General" }))
        .getAllByRole("treeitem")
        .map((el) => el.dataset.docId),
    ).toEqual(["A1", "A2"]);

    // Within a tree: an ordinary move, inside the target.
    await act(async () => drag(row("General", "Notes"), row("General", "Roadmap")));
    expect(executed.at(-1)).toEqual({ id: "doc.move", input: { id: "A2", parentId: "A1" } });

    // From the other tree: the handler, with the placement.
    await act(async () => drag(row("Private", "Diary"), row("General", "Roadmap")));
    expect(foreign).toHaveBeenCalledWith("B1", { parentId: "A1" });
    expect(executed.filter((e) => e.id === "doc.move")).toHaveLength(1);

    // Into a tree without a handler: refused (no move, no handler).
    await act(async () => drag(row("General", "Roadmap"), row("Private", "Diary")));
    expect(executed.filter((e) => e.id === "doc.move")).toHaveLength(1);
    expect(foreign).toHaveBeenCalledTimes(1);
  });
});

describe("multiple selection", () => {
  test("Mod+click and Shift+click select; delete and drag act on the selection as one step", async () => {
    const { backend, host, executed, transactions, opened, confirms } = setup();
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    const tree = screen.getByRole("tree", { name: "Docs" });
    const selectedIds = () =>
      within(tree)
        .getAllByRole("treeitem")
        .filter((el) => el.getAttribute("aria-selected") === "true")
        .map((el) => el.dataset.docId);

    // A plain click opens; Mod+click adds to it instead of opening a tab.
    fireEvent.click(row("Docs", "Roadmap"));
    fireEvent.click(row("Docs", "Diary"), { metaKey: true });
    expect(opened).toEqual([{ id: "A1", mode: "replace" }]);
    expect(selectedIds()).toEqual(["A1", "B1"]);

    // Delete takes the selection, in one transaction, after asking (the roadmap has a body).
    await pressDelete(tree);
    expect(confirms.map((c) => c.message)).toEqual(["Move 2 documents to the trash?"]);
    expect(transactions.at(-1)).toEqual({
      label: "Move 2 documents to trash",
      ops: [
        { id: "doc.delete", input: { id: "A1" } },
        { id: "doc.delete", input: { id: "B1" } },
      ],
    });
    expect(executed.filter((e) => e.id === "doc.delete")).toHaveLength(0);
    expect(selectedIds()).toEqual([]);

    // Shift+click runs from the last Mod+clicked row; dragging one of them moves both.
    fireEvent.click(row("Docs", "Notes"), { shiftKey: true });
    expect(selectedIds()).toEqual(["A2", "B1"]);
    await act(async () => drag(row("Docs", "Diary"), row("Docs", "Roadmap")));
    expect(transactions.at(-1)).toEqual({
      label: "Move 2 documents",
      ops: [
        { id: "doc.move", input: { id: "A2", parentId: "A1" } },
        { id: "doc.move", input: { id: "B1", parentId: "A1" } },
      ],
    });

    // A selected row dropped onto another selected row goes nowhere.
    const before = transactions.length;
    await act(async () => drag(row("Docs", "Diary"), row("Docs", "Notes")));
    expect(transactions).toHaveLength(before);

    // Mod+A selects every row, Escape clears it, a plain arrow drops it.
    fireEvent.keyDown(tree, { key: "a", metaKey: true });
    expect(selectedIds()).toEqual(["A1", "A2", "B1"]);
    fireEvent.keyDown(tree, { key: "Escape" });
    expect(selectedIds()).toEqual([]);
    fireEvent.keyDown(tree, { key: "ArrowDown", shiftKey: true });
    expect(selectedIds().length).toBeGreaterThan(0);
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(selectedIds()).toEqual([]);
  });
});

describe("move to trash", () => {
  test("an empty page goes at once; one with a body asks first, and No keeps it", async () => {
    const { backend, host, executed, confirms, setAnswer } = setup();
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    const tree = screen.getByRole("tree", { name: "Docs" });
    const deleted = () => executed.filter((e) => e.id === "doc.delete").map((e) => e.input);

    fireEvent.click(row("Docs", "Diary"));
    await pressDelete(tree);
    expect(confirms).toEqual([]);
    expect(deleted()).toEqual([{ id: "B1" }]);

    // Whitespace is not content.
    fireEvent.click(row("Docs", "Notes"));
    await pressDelete(tree);
    expect(confirms).toEqual([]);
    expect(deleted()).toEqual([{ id: "B1" }, { id: "A2" }]);

    setAnswer(false);
    fireEvent.click(row("Docs", "Roadmap"));
    await pressDelete(tree);
    expect(confirms).toEqual([
      {
        message: "Move “Roadmap” to the trash?",
        detail: "You can restore it from the trash, or undo with ⌘Z.",
        confirmLabel: "Move to trash",
        destructive: true,
      },
    ]);
    expect(deleted()).toHaveLength(2);

    setAnswer(true);
    await pressDelete(tree);
    expect(deleted()).toEqual([{ id: "B1" }, { id: "A2" }, { id: "A1" }]);
  });

  test("the toast's Undo restores what it moved to the trash", async () => {
    const { backend, host, transactions, toasts } = setup();
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    const tree = screen.getByRole("tree", { name: "Docs" });

    fireEvent.click(row("Docs", "Diary"));
    await pressDelete(tree);
    const toast = toasts.at(-1);
    expect(toast).toMatchObject({
      title: "“Diary” moved to trash",
      description: "Undo with ⌘Z",
      action: { label: "Undo" },
    });
    await act(async () => toast?.action?.onPress());
    expect(transactions.at(-1)).toEqual({
      label: "Restore document",
      ops: [{ id: "doc.restore", input: { id: "B1" } }],
    });
  });
});

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

// A mouse that comes onto `el` at (x, y) and on a pixel. The card counts a move only where the
// position changes, and React Aria ignores the enter itself after a key press (keyboard modality).
function enter(el: Element, x: number, y: number) {
  fireEvent.pointerEnter(el, { pointerType: "mouse", clientX: x, clientY: y });
  fireEvent.pointerMove(el, { pointerType: "mouse", clientX: x + 1, clientY: y });
}

// happy-dom has no layout, and React Aria closes a card once the pointer is outside its row's box.
function placed(title: string, top: number) {
  const el = row("Docs", title);
  el.getBoundingClientRect = () => new DOMRect(0, top, 200, 28);
  return el;
}

function renderTree(options?: { activeDocId?: string }) {
  const { backend, host } = setup(pages, options);
  render(
    <BackendProvider backend={backend}>
      <HostProvider host={host}>
        <DocumentTree label="Docs" scroll="parent" />
      </HostProvider>
    </BackendProvider>,
  );
}

describe("hover card", () => {
  test("opens after a rest, switches at once while open, and a press puts it away", async () => {
    const { backend, host } = setup();
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    const card = () => screen.queryByTestId("doc-hover-card");
    // happy-dom has no layout: give the row and the card a place, row left and card right of it.
    const place = (el: Element, rect: DOMRect) => {
      el.getBoundingClientRect = () => rect;
    };
    const pointerAt = (x: number, y: number) =>
      fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: x, clientY: y });

    // A real pointer moves before it enters; React Aria only counts hover from a pointer.
    const roadmap = row("Docs", "Roadmap");
    place(roadmap, new DOMRect(0, 0, 200, 28));
    pointerAt(300, 14);
    enter(roadmap, 190, 14);
    await wait(1100);
    expect(card()).toBeNull();
    await wait(500);
    expect(card()?.textContent).toContain("Roadmap");

    // The pointer can leave the row for the card, and the card stays while it is there.
    place(card()!, new DOMRect(220, 0, 300, 200));
    fireEvent.pointerLeave(roadmap, { pointerType: "mouse" });
    pointerAt(210, 14);
    pointerAt(360, 120);
    await wait(400);
    expect(card()?.textContent).toContain("Roadmap");
    // Off both, it closes after a moment.
    pointerAt(100, 600);
    await wait(250);
    expect(card()).toBeNull();

    // Row to row soon after: the next card without the wait.
    enter(row("Docs", "Notes"), 100, 46);
    await wait(100);
    expect(card()?.textContent).toContain("Notes");

    // A click (or drag) closes it, and it stays away until the pointer leaves the row.
    fireEvent.pointerDown(row("Docs", "Notes"));
    await wait(10);
    expect(card()).toBeNull();
    fireEvent.pointerMove(row("Docs", "Notes"), {
      pointerType: "mouse",
      clientX: 120,
      clientY: 46,
    });
    await wait(1600);
    expect(card()).toBeNull();

    // Touch never opens it.
    fireEvent.pointerLeave(row("Docs", "Notes"), { pointerType: "mouse" });
    await wait(500);
    fireEvent.pointerEnter(row("Docs", "Diary"), { pointerType: "touch" });
    await wait(1600);
    expect(card()).toBeNull();
  }, 10_000);
});

describe("hover card and tooltips", () => {
  test("a tooltip does not warm the card up, and a row's buttons hold it back", async () => {
    const { backend, host } = setup();
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});
    const card = () => screen.queryByTestId("doc-hover-card");
    const roadmap = row("Docs", "Roadmap");
    const add = within(roadmap).getByRole("button", { name: /New document inside/, hidden: true });

    // A tooltip is open (keyboard focus shows it at once)…
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => add.focus());
    fireEvent.keyUp(document.body, { key: "Tab" });
    await screen.findByRole("tooltip");
    // …and the card of a row entered right then still waits out its rest, leaving the tooltip.
    const notes = row("Docs", "Notes");
    enter(notes, 150, 46);
    await wait(400);
    expect(card()).toBeNull();
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    await wait(1300);
    expect(card()?.textContent).toContain("Notes");
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    // happy-dom has no layout: give the row and the card a place, then move off both.
    notes.getBoundingClientRect = () => new DOMRect(0, 0, 200, 28);
    card()!.getBoundingClientRect = () => new DOMRect(220, 0, 300, 200);
    fireEvent.pointerLeave(notes, { pointerType: "mouse" });
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 100, clientY: 600 });
    await wait(800);
    expect(card()).toBeNull();

    // On one of the row's buttons: no card, however long.
    const actions = add.parentElement!;
    enter(roadmap, 20, 14);
    await wait(300);
    fireEvent.pointerEnter(actions, { pointerType: "mouse" });
    await wait(1700);
    expect(card()).toBeNull();
    // Back on the row, the rest starts over.
    fireEvent.pointerLeave(actions, { pointerType: "mouse", relatedTarget: roadmap });
    await wait(1100);
    expect(card()).toBeNull();
    await wait(600);
    expect(card()?.textContent).toContain("Roadmap");
  }, 15_000);
});

describe("hover card only when meant", () => {
  const card = () => screen.queryByTestId("doc-hover-card");

  test("a row that comes under a still pointer waits for it to move", async () => {
    renderTree();
    await act(async () => {});
    const roadmap = placed("Roadmap", 0);
    // The pointer rests at (50, 14); the row arrives under it (a scroll, a folder opening).
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 50, clientY: 14 });
    fireEvent.pointerEnter(roadmap, { pointerType: "mouse", clientX: 50, clientY: 14 });
    fireEvent.pointerMove(roadmap, { pointerType: "mouse", clientX: 50, clientY: 14 });
    await wait(1600);
    expect(card()).toBeNull();
    // Once it moves, the usual rest.
    fireEvent.pointerMove(roadmap, { pointerType: "mouse", clientX: 52, clientY: 14 });
    await wait(1100);
    expect(card()).toBeNull();
    await wait(500);
    expect(card()?.textContent).toContain("Roadmap");
  }, 10_000);

  test("a key press puts it away until the pointer moves again", async () => {
    renderTree();
    await act(async () => {});
    const roadmap = placed("Roadmap", 0);
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 300, clientY: 14 });
    enter(roadmap, 60, 14);
    await wait(1600);
    expect(card()?.textContent).toContain("Roadmap");

    // A modifier (as in Mod+click) leaves it; typing puts it away and keeps it away.
    fireEvent.keyDown(document.body, { key: "Meta" });
    await wait(10);
    expect(card()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "a" });
    await wait(300);
    expect(card()).toBeNull();
    fireEvent.pointerMove(roadmap, { pointerType: "mouse", clientX: 61, clientY: 14 });
    await wait(1600);
    expect(card()).toBeNull();

    // A real move starts the rest over, without the open card's head start.
    fireEvent.pointerMove(roadmap, { pointerType: "mouse", clientX: 63, clientY: 14 });
    await wait(1100);
    expect(card()).toBeNull();
    await wait(500);
    expect(card()?.textContent).toContain("Roadmap");
  }, 10_000);

  test("no card for the open document", async () => {
    renderTree({ activeDocId: "A1" });
    await act(async () => {});
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 300, clientY: 14 });
    enter(placed("Roadmap", 0), 70, 14);
    await wait(1600);
    expect(card()).toBeNull();
    fireEvent.pointerLeave(row("Docs", "Roadmap"), { pointerType: "mouse" });
    enter(placed("Notes", 32), 70, 46);
    await wait(1600);
    expect(card()?.textContent).toContain("Notes");
  }, 10_000);
});

describe("rows (as in v1)", () => {
  test("the icon of a page with pages inside is the toggle; dragged rows are marked", async () => {
    const folder = { ...doc("F1", "Projects", null), childCount: 2 };
    const { backend, host, queried } = setup([folder, doc("P1", "Plain", null)]);
    render(
      <BackendProvider backend={backend}>
        <HostProvider host={host}>
          <DocumentTree label="Docs" scroll="parent" />
        </HostProvider>
      </BackendProvider>,
    );
    await act(async () => {});

    // A page without pages inside has its icon and no toggle.
    const plain = row("Docs", "Plain");
    expect(within(plain).queryByRole("button", { name: "Expand" })).toBeNull();
    expect(plain.querySelector("[data-doc-icon]")).not.toBeNull();

    // With pages inside, the icon sits in the toggle (the caret takes its place on hover).
    const toggle = within(row("Docs", "Projects")).getByRole("button", { name: "Expand" });
    expect(toggle.querySelector("[data-doc-icon]")).not.toBeNull();
    await act(async () => fireEvent.click(toggle));
    expect(queried).toContainEqual({ workspaceId: "ws", parentId: "F1" });
    expect(row("Docs", "Projects").getAttribute("aria-expanded")).toBe("true");
    within(row("Docs", "Projects")).getByRole("button", { name: "Collapse" });

    // The dragged row dims until the drag ends.
    const transfer = dataTransfer();
    fireEvent.dragStart(row("Docs", "Plain"), { dataTransfer: transfer });
    expect(row("Docs", "Plain").dataset.dragging).toBe("true");
    fireEvent.dragEnd(row("Docs", "Plain"), { dataTransfer: transfer });
    expect(row("Docs", "Plain").dataset.dragging).toBeUndefined();
  });
});
