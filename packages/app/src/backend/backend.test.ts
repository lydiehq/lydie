// One suite, two backends: the in-process one and the remote one over a ServiceChannel. Passing
// both proves the renderer behaves the same whether the database is local or in another process.
import { afterEach, describe, expect, test } from "bun:test";

import { createLocalServiceChannel } from "@lydie/platform";
import type { Backend, LiveHandle, LiveState } from "@lydie/plugin-api";
import { createRuntime } from "@lydie/runtime";
import type { Exports } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";
import { openNodeStore } from "@lydie/store/node";

import { createEventHub, createLocalBackend } from "./local.ts";
import { handledOperations } from "./registry.ts";
import { applyLiveEvent, createRemoteBackend } from "./remote.ts";
import { encodeRows, serveBackend } from "./serve.ts";
import { backendService } from "./service.ts";

const WS = "01973200-0000-0000-0000-000000000000";
const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

type StatusOverride = NonNullable<Parameters<typeof createLocalBackend>[0]["status"]>;

async function openLocal(
  extra: {
    status?: StatusOverride;
    resolveRemoteUrl?: (id: string) => Promise<string | null>;
    exports?: Exports;
  } = {},
) {
  const { exports, ...backendExtra } = extra;
  const tmp = process.env.TMPDIR ?? "/tmp";
  const path = `${tmp.replace(/\/$/, "")}/lydie-app-${crypto.randomUUID()}.sqlite`;
  const store = await openNodeStore({ path });
  const hub = createEventHub();
  const { blob } = createMemoryPorts();
  const runtime = createRuntime({
    registry: handledOperations(),
    ...store.ports,
    blob,
    events: hub.port,
    actor: { type: "user", id: "u1" },
    ...(exports ? { exports } : {}),
  });
  const backend = createLocalBackend({
    store,
    runtime,
    blob,
    events: hub,
    info: { workspaceId: WS, workspaceName: "Test", persistent: true },
    lingerMs: 0,
    ...backendExtra,
  });
  cleanup.push(async () => {
    await backend.close();
    await store.close();
    for (const suffix of ["", "-wal", "-shm"])
      await Bun.file(path + suffix)
        .delete()
        .catch(() => {});
  });
  return backend;
}

async function openRemote(extra: Parameters<typeof openLocal>[0] = {}) {
  const local = await openLocal(extra);
  const channel = createLocalServiceChannel();
  channel.register(backendService, serveBackend(local));
  const remote = await createRemoteBackend(channel, { lingerMs: 0 });
  cleanup.push(() => remote.close());
  return remote;
}

function waitFor<T>(
  handle: LiveHandle<T>,
  predicate: (state: LiveState<T>) => boolean,
  timeoutMs = 3000,
): Promise<LiveState<T>> {
  return new Promise((resolve, reject) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out; last state: ${JSON.stringify(handle.getSnapshot())}`));
    }, timeoutMs);
    const check = () => {
      const state = handle.getSnapshot();
      if (state.isLoading || !predicate(state)) return;
      clearTimeout(timer);
      queueMicrotask(off);
      resolve(state);
    };
    off = handle.subscribe(check);
    check();
  });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejection");
}

for (const [kind, open] of [
  ["local", openLocal],
  ["remote", openRemote],
] as const) {
  describe(`${kind} backend`, () => {
    test("info", async () => {
      const backend: Backend = await open();
      expect(backend.info).toEqual({
        mode: "local",
        workspaceId: WS,
        workspaceName: "Test",
        persistent: true,
      });
    });

    test("operations and typed errors", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Hello" });
      expect(doc.title).toBe("Hello");
      const got = await backend.ops.doc.get({ id: doc.id });
      expect(got.document.id).toBe(doc.id);
      const error = (await rejection(
        backend.ops.doc.get({ id: "0197ffff-ffff-ffff-ffff-ffffffffffff" }),
      )) as { code?: string; name?: string };
      expect(error.code).toBe("not_found");
      expect(error.name).toBe("LydieError");
    });

    test("live children: updates on change, keeps unchanged rows identical", async () => {
      const backend = await open();
      const a = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
      await backend.ops.doc.create({ workspaceId: WS, title: "B" });
      const handle = backend.live("doc.children", { workspaceId: WS, parentId: null });
      expect(backend.live("doc.children", { parentId: null, workspaceId: WS })).toBe(handle);
      const keep = handle.subscribe(() => {});
      cleanup.push(async () => keep());
      const first = await waitFor(handle, (s) => s.data.length === 2);
      await backend.ops.doc.rename({ id: a.id, title: "A2" });
      const second = await waitFor(handle, (s) => s.data.some((d) => d.title === "A2"));
      const b1 = first.data.find((d) => d.title === "B");
      const b2 = second.data.find((d) => d.title === "B");
      expect(b2).toBe(b1!);
      expect(second.data.find((d) => d.title === "A2")).not.toBe(
        first.data.find((d) => d.title === "A")!,
      );
    });

    test("rename and move paint optimistically, before the write commits", async () => {
      const backend = await open();
      const a = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
      const b = await backend.ops.doc.create({ workspaceId: WS, title: "B" });
      const handle = backend.live("doc.children", { workspaceId: WS, parentId: null });
      const keep = handle.subscribe(() => {});
      cleanup.push(async () => keep());
      await waitFor(handle, (s) => s.data.length === 2);
      const renamed = backend.ops.doc.rename({ id: a.id, title: "A!" });
      if (kind === "local") {
        // Synchronously patched; the remote backend paints on the round trip instead.
        expect(handle.getSnapshot().data.map((d) => d.title)).toEqual(["A!", "B"]);
      }
      await renamed;
      await waitFor(handle, (s) => s.data[0]?.title === "A!");
      const moved = backend.ops.doc.move({ id: b.id, parentId: null, beforeId: a.id });
      if (kind === "local")
        expect(handle.getSnapshot().data.map((d) => d.title)).toEqual(["B", "A!"]);
      await moved;
      await waitFor(handle, (s) => s.data[0]?.title === "B");
      // A failing rename puts the real rows back.
      const failed = await rejection(backend.ops.doc.rename({ id: a.id, title: "" }));
      expect(failed).toBeDefined();
      await waitFor(handle, (s) => s.data[1]?.title === "A!");
    });

    test("create, trash and rename paint before the write lands; failures roll back", async () => {
      const backend = await open();
      const a = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
      const handle = backend.live("doc.children", { workspaceId: WS, parentId: null });
      const keep = handle.subscribe(() => {});
      cleanup.push(async () => keep());
      await waitFor(handle, (s) => s.data.length === 1);
      // Shown before the operation settles (remote: after the frame-batched notification).
      const flush = () => new Promise((r) => setTimeout(r, 0));
      let landed = false;
      const created = backend.ops.doc
        .create({ workspaceId: WS, title: "B" })
        .then((doc) => ((landed = true), doc));
      await Promise.resolve();
      await Promise.resolve();
      if (kind === "remote") await new Promise((r) => queueMicrotask(() => r(null)));
      const titles = () => handle.getSnapshot().data.map((d) => d.title);
      expect(landed).toBe(false);
      expect(titles()).toEqual(["A", "B"]);
      const b = await created;
      // The optimistic row is the real one (same client-minted id), not a duplicate.
      await waitFor(handle, (s) => s.data.length === 2 && s.data[1]!.id === b.id);
      await flush();
      expect(titles()).toEqual(["A", "B"]);
      const trashed = backend.ops.doc.delete({ id: a.id });
      await Promise.resolve();
      if (kind === "remote") await new Promise((r) => queueMicrotask(() => r(null)));
      expect(titles()).toEqual(["B"]);
      await trashed;
      await waitFor(handle, (s) => s.data.length === 1);
      // A rename that fails is undone on screen.
      const failed = rejection(backend.ops.doc.rename({ id: b.id, title: "" }));
      await failed;
      await waitFor(handle, (s) => s.data[0]?.title === "B");
    });

    test("the undo label names a change from the moment it paints (LYD-259)", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({ workspaceId: WS, title: "A" }, { scope: "l" });
      await waitUntil(() => backend.history.state("l").canUndo);
      const labels: (string | null)[] = [];
      const off = backend.history.subscribe((scope) => {
        if (scope === "l") labels.push(backend.history.state("l").undoLabel);
      });
      // Shown before the rename is written (its optimistic paint is already on screen).
      const renaming = backend.ops.doc.rename(
        { id: doc.id, title: "B" },
        { scope: "l", label: "Rename it" },
      );
      expect(backend.history.state("l").undoLabel).toBe("Rename it");
      expect(backend.history.state("l")).toBe(backend.history.state("l"));
      await renaming;
      await waitUntil(() => backend.history.state("l").undoLabel === "Rename it");
      await new Promise((r) => setTimeout(r, 20));
      // Never the older step once the change was shown.
      expect(labels.slice(labels.indexOf("Rename it"))).not.toContain(null);
      expect(labels.slice(labels.indexOf("Rename it")).every((l) => l === "Rename it")).toBe(true);
      // A failed change gives the label back.
      await rejection(
        backend.ops.doc.rename({ id: doc.id, title: "" }, { scope: "l", label: "Bad" }),
      );
      await waitUntil(() => backend.history.state("l").undoLabel === "Rename it");
      // history: false records nothing, so it shows nothing.
      const silent = backend.ops.doc.rename(
        { id: doc.id, title: "C" },
        { scope: "l", history: false },
      );
      expect(backend.history.state("l").undoLabel).toBe("Rename it");
      await silent;
      off();
    });

    test("history per scope: undo and redo", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create(
        { workspaceId: WS, title: "One" },
        { scope: "tab1" },
      );
      await backend.ops.doc.rename({ id: doc.id, title: "Two" }, { scope: "tab1" });
      const seen: string[] = [];
      const off = backend.history.subscribe((scope) => seen.push(scope));
      backend.history.state("tab1");
      await waitUntil(() => backend.history.canUndo("tab1"));
      expect(backend.history.canUndo("other")).toBe(false);
      expect(await backend.history.undo("tab1")).toBe(true);
      expect((await backend.ops.doc.get({ id: doc.id })).document.title).toBe("One");
      await waitUntil(() => backend.history.canRedo("tab1"));
      expect(await backend.history.redo("tab1")).toBe(true);
      expect((await backend.ops.doc.get({ id: doc.id })).document.title).toBe("Two");
      off();
      expect(seen).toContain("tab1");
    });

    test("undo right after an operation undoes that operation", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({ workspaceId: WS, title: "One" }, { scope: "q" });
      await backend.ops.doc.rename({ id: doc.id, title: "Two" }, { scope: "q", coalesce: "t" });
      // Not awaited: Cmd+Z pressed while the rename is still being written.
      const renaming = backend.ops.doc.rename({ id: doc.id, title: "Three" }, { scope: "q" });
      await backend.history.undo("q");
      await renaming;
      expect((await backend.ops.doc.get({ id: doc.id })).document.title).toBe("Two");
    });

    test("history: false keeps body saves off the undo stack", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Doc" }, { scope: "s" });
      await backend.history.undo("s");
      await waitUntil(() => !backend.history.canUndo("s"));
      await backend.ops.doc.restore({ id: doc.id }, { history: false });
      await backend.ops.doc.updateBody({ id: doc.id, markdown: "hi" }, { history: false });
      await new Promise((r) => setTimeout(r, 20));
      expect(backend.history.canUndo("s")).toBe(false);
    });

    test("transaction: one undo step; failure rolls back", async () => {
      const backend = await open();
      const id = await backend.transaction(
        "Two docs",
        async (ops) => {
          const parent = await ops.doc.create({ workspaceId: WS, title: "P" });
          await ops.doc.create({ workspaceId: WS, title: "C", parentId: parent.id });
          return parent.id;
        },
        { scope: "t" },
      );
      const children = backend.live("doc.children", { workspaceId: WS, parentId: id });
      await waitFor(children, (s) => s.data.length === 1);
      await waitUntil(() => backend.history.canUndo("t"));
      await rejection(
        backend.transaction("Fails", async (ops) => {
          await ops.doc.create({ workspaceId: WS, title: "Never" });
          throw new Error("stop");
        }),
      );
      const top = await waitFor(
        backend.live("doc.children", { workspaceId: WS, parentId: null }),
        () => true,
      );
      expect(top.data.map((d) => d.title)).toEqual(["P"]);
    });

    test("live trash list follows delete and restore", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({ workspaceId: WS, title: "Gone" });
      const trash = backend.live("trash.list", { workspaceId: WS });
      await waitFor(trash, (s) => s.data.length === 0);
      await backend.ops.doc.delete({ id: doc.id });
      await waitFor(trash, (s) => s.data.length === 1);
      await backend.ops.doc.restore({ id: doc.id });
      await waitFor(trash, (s) => s.data.length === 0);
    });

    test("doc.get with body and full-text search", async () => {
      const backend = await open();
      const doc = await backend.ops.doc.create({
        workspaceId: WS,
        title: "Notes",
        markdown: "The quick brown fox",
      });
      const got = await waitFor(backend.live("doc.get", { id: doc.id, includeBody: true }), (s) =>
        Boolean(s.data[0]?.body),
      );
      expect(got.data[0]!.body!.markdown).toContain("quick brown");
      const hits = await waitFor(
        backend.live("doc.search", { workspaceId: WS, text: "brown" }),
        (s) => s.data.length === 1,
      );
      expect(hits.data[0]!.id).toBe(doc.id);
    });

    test("one-shot queries", async () => {
      const backend = await open();
      await backend.ops.doc.create({
        workspaceId: WS,
        title: "Quarterly roadmap",
        markdown: "plans",
      });
      const hits = await backend.query("doc.search", { workspaceId: WS, text: "roadm" });
      expect(hits.map((h) => h.title)).toEqual(["Quarterly roadmap"]);
      expect(await backend.query("trash.list", { workspaceId: WS })).toEqual([]);
    });

    test("status and layouts", async () => {
      const backend = await open();
      expect(backend.status.get().sync).toBe("local-only");
      await backend.layouts.save("main", { hello: 1 });
      expect(await backend.layouts.load("main")).toEqual({ hello: 1 });
    });

    test("workspace.export reports its progress", async () => {
      let bytes = 0;
      const backend = await open({
        exports: {
          async save({ data }) {
            bytes = (await new Response(data).arrayBuffer()).byteLength;
            return { url: "file:///tmp/export.zip", expiresAt: null };
          },
        },
      });
      const parent = await backend.ops.doc.create({ workspaceId: WS, title: "A" });
      await backend.ops.doc.create({ workspaceId: WS, title: "B", parentId: parent.id });
      const seen: { done: number; total: number }[] = [];
      const result = await backend.execute(
        "workspace.export",
        { workspaceId: WS },
        { onProgress: (progress) => seen.push(progress) },
      );
      expect(result.url).toBe("file:///tmp/export.zip");
      expect(bytes).toBeGreaterThan(0);
      expect(seen).toEqual([
        { done: 1, total: 2 },
        { done: 2, total: 2 },
      ]);
    });

    test("attachments: add and read back", async () => {
      const backend = await open();
      const attachment = await backend.attachments.add({
        workspaceId: WS,
        filename: "a.txt",
        contentType: "text/plain",
        data: new TextEncoder().encode("bytes"),
      });
      const url = await backend.attachments.url(attachment.id);
      expect(url).toStartWith("blob:");
      URL.revokeObjectURL(url!);
      expect(await backend.attachments.url("0197ffff-ffff-ffff-ffff-ffffffffffff")).toBeNull();
    });

    test("doc.links: links as written, resolved live", async () => {
      const backend = await open();
      const source = await backend.ops.doc.create({
        workspaceId: WS,
        title: "Source",
        markdown: "See [[Target#Part]] and [[Missing]].\n",
      });
      const handle = backend.live("doc.links", { id: source.id });
      const keep = handle.subscribe(() => {});
      cleanup.push(async () => keep());
      const first = await waitFor(handle, (s) => s.data.length === 2);
      expect(first.data.map((l) => [l.targetRef, l.targetHeading, l.target])).toEqual([
        ["Target", "Part", null],
        ["Missing", null, null],
      ]);
      // Creating the target resolves the dangling link.
      const target = await backend.ops.doc.create({ workspaceId: WS, title: "Target" });
      const second = await waitFor(handle, (s) => s.data[0]?.target?.id === target.id);
      expect(second.data[1]!.target).toBeNull();
      expect((await backend.query("doc.links", { id: source.id }))[0]!.target?.title).toBe(
        "Target",
      );
    });

    test("doc.recent: most recently changed first, live", async () => {
      const backend = await open();
      const first = await backend.ops.doc.create({ workspaceId: WS, title: "First" });
      const second = await backend.ops.doc.create({ workspaceId: WS, title: "Second" });
      const handle = backend.live("doc.recent", { workspaceId: WS, limit: 1 });
      const keep = handle.subscribe(() => {});
      cleanup.push(async () => keep());
      await waitFor(handle, (s) => s.data[0]?.id === second.id);
      await backend.ops.doc.rename({ id: first.id, title: "First again" });
      const after = await waitFor(handle, (s) => s.data[0]?.id === first.id);
      expect(after.data.map((d) => d.title)).toEqual(["First again"]);
    });

    test("databases: live definition, list and view; value edits paint optimistically", async () => {
      const backend = await open();
      const created = await backend.ops.database.create({ workspaceId: WS, title: "Tasks" });
      const id = created.database.id;
      const status = await backend.ops.database.addProperty({
        databaseId: id,
        name: "Status",
        type: "select",
        config: { options: [{ name: "Todo" }, { name: "Done" }] },
      });
      const a = await backend.ops.database.createRow({ databaseId: id, title: "A" });
      await backend.ops.database.createRow({ databaseId: id, title: "B" });

      const definition = backend.live("database.get", { id });
      const offDefinition = definition.subscribe(() => {});
      cleanup.push(async () => offDefinition());
      const def = await waitFor(definition, (s) => s.data[0]?.properties.length === 2);
      expect(def.data[0]!.views).toHaveLength(1);
      expect((await backend.query("database.get", { id }))[0]!.database.id).toBe(id);
      const page = await backend.ops.doc.create({ workspaceId: WS, title: "Plain" });
      expect(await backend.query("database.get", { id: page.id })).toEqual([]);

      const list = await backend.query("database.list", { workspaceId: WS });
      expect(list.map((d) => d.title)).toEqual(["Tasks"]);

      const view = backend.live("database.view", { databaseId: id });
      const offView = view.subscribe(() => {});
      cleanup.push(async () => offView());
      const first = await waitFor(view, (s) => s.data.filter((i) => i.kind === "row").length === 2);
      const meta = first.data.find((i) => i.kind === "meta");
      expect(meta && meta.kind === "meta" ? meta.total : -1).toBe(2);
      const rowB = first.data.find((i) => i.kind === "row" && i.row.title === "B");

      const set = backend.ops.database.setValues({
        databaseId: id,
        rowIds: [a.id],
        set: { [status.id]: "Done" },
      });
      const valueOf = (s: LiveState<(typeof first.data)[number]>) => {
        const item = s.data.find((i) => i.kind === "row" && i.row.id === a.id);
        return item?.kind === "row" ? item.row.properties.Status : undefined;
      };
      if (kind === "local") expect(valueOf(view.getSnapshot())).toBe("Done");
      await set;
      const after = await waitFor(view, (s) => valueOf(s) === "Done");
      // The untouched row keeps its identity.
      expect(after.data.find((i) => i.kind === "row" && i.row.title === "B")).toBe(rowB!);

      const once = await backend.query("database.view", { databaseId: id });
      expect(once.filter((i) => i.kind === "row")).toHaveLength(2);
    });
  });
}

describe("hosted seams", () => {
  for (const [kind, open] of [
    ["local", openLocal],
    ["remote", openRemote],
  ] as const) {
    test(`${kind}: status override, rejected changes and remote attachment URLs`, async () => {
      let status = {
        sync: "auth-expired" as const,
        pendingOperations: 2,
        pendingUploads: 0,
        conflicts: 0,
        lastSyncedAt: null,
        error: null,
        rejected: [
          {
            operationId: "op1",
            operation: "doc.rename",
            reason: { code: "forbidden", message: "No access" },
            rejectedAt: "2026-11-13T00:00:00.000Z",
          },
        ],
      };
      const listeners = new Set<() => void>();
      const dismissed: (readonly string[] | undefined)[] = [];
      const backend = await open({
        status: {
          get: () => status,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          dismissRejected: (ids) => {
            dismissed.push(ids);
            status = { ...status, rejected: [] };
            for (const listener of listeners) listener();
          },
        },
        resolveRemoteUrl: async (id) => `https://files.example/${id}`,
      });
      expect(backend.status.get().sync).toBe("auth-expired");
      expect(backend.status.get().rejected).toHaveLength(1);
      backend.status.dismissRejected?.(["op1"]);
      await waitUntil(() => (backend.status.get().rejected?.length ?? 0) === 0);
      expect(dismissed).toEqual([["op1"]]);
      const attachment = await backend.ops.attachment.create({
        workspaceId: WS,
        filename: "remote.png",
        contentType: "image/png",
        size: 3,
        sha256: "0".repeat(64),
      });
      expect(await backend.attachments.url(attachment.id)).toBe(
        `https://files.example/${attachment.id}`,
      );
    });
  }
});

describe("wire encoding", () => {
  test("encodeRows reuses runs and applyLiveEvent keeps identity", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const d = { id: "d" };
    const previous = [a, b, c];
    const next = [a, b, d, c];
    const rows = encodeRows(previous, next);
    expect(rows).toEqual([[0, 2], { v: d }, [2, 1]]);
    const state = applyLiveEvent(
      { data: previous, isLoading: false, error: undefined },
      { t: "diff", rows, isLoading: false },
    );
    expect(state.data[0]).toBe(a);
    expect(state.data[3]).toBe(c);
    expect(state.data[2]).toEqual(d);
    const same = { data: previous, isLoading: false, error: undefined };
    expect(
      applyLiveEvent(same, { t: "diff", rows: encodeRows(previous, previous), isLoading: false }),
    ).toBe(same);
  });
});

async function waitUntil(predicate: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
