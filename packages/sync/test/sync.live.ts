// Live tests against a running hosted core (API, PowerSync Service, collab). Self-contained: every
// run signs up its own users and creates its own workspaces. Skipped when the stack is down.
// Run: `bun --filter=@lydie/sync run test:live` (LYDIE_API_URL overrides http://localhost:4100).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gettingStartedId } from "@lydie/contract";
import { queries } from "@lydie/store";
import type { Store } from "@lydie/store";
import { createDirectoryBlob, openNodeStore } from "@lydie/store/node";
import * as Y from "yjs";

import { sha256Hex } from "../src/attachments.ts";
import { createCollab } from "../src/collab/collab.ts";
import { createMemoryYjsPersistence } from "../src/collab/persistence.ts";
import { planHandoff, runHandoff } from "../src/handoff.ts";
import { createHostedBackendParts } from "../src/hosted.ts";
import type { HostedParts } from "../src/hosted.ts";
import { isApiError } from "../src/http.ts";
import { createFileYjsPersistence } from "../src/node.ts";
import { createSession } from "../src/session.ts";
import type { Session } from "../src/session.ts";
import type { SecretStorage } from "../src/types.ts";
import { testUuid } from "./fake-core.ts";
import { createDoc, insertDatabase, moveDoc, renameDoc, trashDoc } from "./store.ts";
import { waitFor } from "./wait.ts";

const API = process.env.LYDIE_API_URL ?? "http://localhost:4100";
const VERSION = "2026-11-12";

async function stackStatus(): Promise<string | null> {
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) return `API unhealthy at ${API} (${health.status})`;
  } catch {
    return `API not reachable at ${API}`;
  }
  const powersync = process.env.LYDIE_POWERSYNC_URL ?? "http://localhost:4180";
  try {
    const live = await fetch(`${powersync}/probes/liveness`, { signal: AbortSignal.timeout(2000) });
    if (!live.ok) return `PowerSync Service unhealthy at ${powersync} (${live.status})`;
  } catch {
    return `PowerSync Service not reachable at ${powersync}`;
  }
  return null;
}

const down = await stackStatus();
if (down) {
  console.warn(
    `\n[@lydie/sync test:live] SKIPPED: the hosted core is not running (${down}).\n` +
      "Start the hosted core, then run `bun run test:live` again.\n",
  );
}

const run = Date.now().toString(36);
const dirs: string[] = [];
const toClose: Array<() => Promise<void>> = [];

function memorySecrets(): SecretStorage {
  const data = new Map<string, string>();
  return {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

// Sign-in and sign-up are rate limited per IP (other suites on this machine share the bucket), and
// another agent may restart the API: wait instead of failing.
async function patiently<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const transient = isApiError(error) && (error.status === 429 || error.kind === "network");
      if (!transient || attempt >= 12) throw error;
      await new Promise((resolve) => setTimeout(resolve, 7_000));
    }
  }
}

async function signUp(name: string): Promise<Session> {
  const session = createSession({ baseUrl: API, secrets: memorySecrets(), version: VERSION });
  await patiently(() =>
    session.signUp({ email: `${name}-${run}@test.lydie.dev`, password: "password1234", name }),
  );
  return session;
}

// One device: its own directory, database, blob store and Yjs files, signed in as `session`'s user.
async function device(name: string, session: Session, workspaceId: string, dir?: string) {
  const root = dir ?? mkdtempSync(join(tmpdir(), `lydie-live-${name}-`));
  if (!dir) dirs.push(root);
  const blob = createDirectoryBlob(join(root, "blobs"));
  mkdirSync(join(root, "yjs"), { recursive: true });
  const parts: HostedParts<null> = await createHostedBackendParts({
    scope: { kind: "hosted", workspaceId },
    baseUrl: API,
    version: VERSION,
    secrets: memorySecrets(),
    session,
    // Two "devices" share this process, and PowerSync's Node driver locks by file name: give each
    // its own name (separate processes would not need this).
    openStore: ({ dbFilename, mode }) =>
      openNodeStore({ path: join(root, `${name}-${dbFilename}`), mode }),
    createRuntime: () => null,
    blob,
    yjs: () => createFileYjsPersistence(join(root, "yjs")),
  });
  await parts.start();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await parts.close();
  };
  toClose.push(close);
  return { parts, store: parts.store, blob, root, close };
}

type Device = Awaited<ReturnType<typeof device>>;

const docOn = async (store: Store, id: string) =>
  (await store.getDoc(id, { includeBody: false }))?.document ?? null;

async function eventually<T>(
  probe: () => Promise<T | null | undefined | false>,
  what: string,
  timeoutMs = 30_000,
) {
  return waitFor(probe, { timeoutMs, intervalMs: 100, what });
}

afterAll(async () => {
  for (const close of toClose.splice(0).reverse()) await close().catch(() => {});
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(down !== null)("hosted sync (live)", () => {
  let ada: Session;
  let gus: Session;
  let workspaceId: string;
  let generalId: string;
  let a: Device;
  let b: Device;

  beforeAll(async () => {
    [ada, gus] = await Promise.all([signUp("ada"), signUp("gus")]);
    workspaceId = (await ada.createWorkspace({ name: `Live ${run}` })).id;
    generalId = (await ada.teamspaces(workspaceId)).find((t) => t.isDefault)!.id;
    a = await device("a", ada, workspaceId);
    // Ada's second device signs in on its own.
    const adaElsewhere = createSession({
      baseUrl: API,
      secrets: memorySecrets(),
      version: VERSION,
    });
    await patiently(() =>
      adaElsewhere.signIn({ email: `ada-${run}@test.lydie.dev`, password: "password1234" }),
    );
    b = await device("b", adaElsewhere, workspaceId);
  }, 120_000);

  test("create, rename, move and trash on A appear on B", async () => {
    const parent = await createDoc(a.store, { workspaceId, title: "Parent" }, ada.user()!.id);
    const child = await createDoc(a.store, { workspaceId, title: "Child" }, ada.user()!.id);
    await eventually(
      async () => (await docOn(b.store, child.id))?.title === "Child",
      "create on B",
    );
    await renameDoc(a.store, child.id, "Renamed", ada.user()!.id);
    await moveDoc(a.store, child.id, parent.id, ada.user()!.id);
    await eventually(async () => {
      const doc = await docOn(b.store, child.id);
      return doc?.title === "Renamed" && doc.parentId === parent.id;
    }, "rename and move on B");
    await trashDoc(a.store, parent.id, ada.user()!.id);
    await eventually(async () => {
      const [p, c] = [await docOn(b.store, parent.id), await docOn(b.store, child.id)];
      return p?.deletedAt && c?.deletedAt;
    }, "trash (cascading) on B");
    await eventually(async () => a.parts.status.get().state === "synced", "A synced");
    expect(a.parts.status.get().pendingOperations).toBe(0);
    expect(a.parts.sync.rejected.get()).toEqual([]);
  }, 60_000);

  test("edits made offline on A upload after a restart", async () => {
    await a.close();
    // Offline: the app is not connected; edits only queue locally.
    const store = await openNodeStore({
      path: join(a.root, `a-lydie-hosted-${ada.user()!.id}.sqlite`),
      mode: "synced",
    });
    const offline = await createDoc(
      store,
      { workspaceId, title: "Written offline" },
      ada.user()!.id,
    );
    await renameDoc(store, offline.id, "Written offline, renamed", ada.user()!.id);
    expect(await store.oplog.list()).toHaveLength(2);
    await store.close();
    // Restart, back online.
    a = await device("a", ada, workspaceId, a.root);
    await eventually(
      async () => (await docOn(b.store, offline.id))?.title === "Written offline, renamed",
      "offline edits on B",
    );
    expect(await a.store.oplog.list()).toEqual([]);
  }, 60_000);

  test("top-level documents land in the named teamspace", async () => {
    const parts = await createHostedBackendParts({
      scope: { kind: "hosted", workspaceId },
      baseUrl: API,
      version: VERSION,
      secrets: memorySecrets(),
      session: ada,
      openStore: ({ dbFilename, mode }) => {
        const dir = mkdtempSync(join(tmpdir(), "lydie-live-ts-"));
        dirs.push(dir);
        return openNodeStore({ path: join(dir, `ts-${dbFilename}`), mode });
      },
      createRuntime: () => null,
    });
    toClose.push(() => parts.close());
    await parts.start();
    const doc = await createDoc(
      parts.store,
      { workspaceId, title: "In General", teamspaceId: generalId },
      ada.user()!.id,
    );
    await parts.sync.flush();
    const sharing = await ada.api.get<
      { document?: { teamspaceId?: string } } & Record<string, unknown>
    >(`/v1/documents/${doc.id}`);
    expect(JSON.stringify(sharing)).toContain(doc.id);
    // B (same user) sees it, so the server accepted it in a space Ada can read.
    await eventually(async () => docOn(b.store, doc.id), "teamspace doc on B");
  }, 60_000);

  test("collab typing converges, and an offline edit survives a restart", async () => {
    const doc = await createDoc(a.store, { workspaceId, title: "Body" }, ada.user()!.id);
    await a.parts.sync.flush();
    const onA = a.parts.collab!.open(doc.id);
    const onB = b.parts.collab!.open(doc.id);
    await Promise.all([onA.whenSynced(), onB.whenSynced()]);
    onA.ydoc.getText("body").insert(0, "Hello");
    await eventually(async () => onB.ydoc.getText("body").toJSON() === "Hello", "A → B");
    onB.ydoc.getText("body").insert(5, " world");
    await eventually(async () => onA.ydoc.getText("body").toJSON() === "Hello world", "B → A");
    await onA.whenSynced();
    onA.release();

    // A goes offline (collab unreachable), edits, and quits.
    const persistence = createFileYjsPersistence(join(a.root, "yjs"));
    const offline = createCollab({
      api: ada.api,
      url: "ws://127.0.0.1:9",
      persistence,
      idleDisconnectMs: 0,
    });
    const offlineDoc = offline.open(doc.id);
    await offlineDoc.loaded;
    expect(offlineDoc.ydoc.getText("body").toJSON()).toBe("Hello world");
    offlineDoc.ydoc.getText("body").insert(11, "!");
    offlineDoc.release();
    await offline.close();
    expect(await persistence.dirty()).toContain(doc.id);

    // Restart online: the dirty document is pushed without being opened.
    const restarted = createCollab({ api: ada.api, persistence, idleDisconnectMs: 0 });
    toClose.push(() => restarted.close());
    const pushed = await restarted.pushPending(20_000);
    expect(pushed.pushed).toContain(doc.id);
    await eventually(
      async () => onB.ydoc.getText("body").toJSON() === "Hello world!",
      "offline edit on B",
    );
    onB.release();
  }, 90_000);

  test("attachment round trip", async () => {
    const doc = await createDoc(a.store, { workspaceId, title: "With file" }, ada.user()!.id);
    const bytes = new TextEncoder().encode(`attachment ${run}`);
    const sha256 = await sha256Hex(bytes);
    await a.blob.put(sha256, bytes);
    const id = testUuid();
    const now = new Date().toISOString();
    await a.store.ports.db.write(async (tx) => {
      await tx.attachments!.insert({
        id,
        workspaceId,
        documentId: doc.id,
        filename: "note.txt",
        contentType: "text/plain",
        size: bytes.byteLength,
        sha256,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await tx.oplog.append({
        id: testUuid(),
        operation: "attachment.create",
        input: {
          workspaceId,
          id,
          documentId: doc.id,
          filename: "note.txt",
          contentType: "text/plain",
          size: bytes.byteLength,
          sha256,
        },
        actor: { type: "user", id: ada.user()!.id },
        sessionId: null,
        workspaceId,
        createdAt: now,
        version: VERSION,
      });
    });
    await eventually(
      async () => (await a.store.uploads.get(id))?.state === "uploaded",
      "bytes uploaded",
    );
    await eventually(async () => {
      const rows = await b.store.ports.db.read(async (tx) => tx.attachments!.get(id));
      return rows !== null;
    }, "attachment row on B");
    const downloaded = await b.parts.sync.attachments!.download(id);
    expect(new TextDecoder().decode(downloaded)).toBe(`attachment ${run}`);
    expect(await b.blob.get(sha256)).toEqual(downloaded);
  }, 60_000);

  describe("permissions", () => {
    let g: Device;
    let shared: string;
    let privateDoc: string;

    beforeAll(async () => {
      shared = (await createDoc(a.store, { workspaceId, title: "Shared" }, ada.user()!.id)).id;
      privateDoc = (await createDoc(a.store, { workspaceId, title: "Not shared" }, ada.user()!.id))
        .id;
      await a.parts.sync.flush();
      const invite = await ada.api.post<{ status: string }>(`/v1/documents/${shared}/invite`, {
        email: `gus-${run}@test.lydie.dev`,
        level: "view",
      });
      expect(invite.status).toBe("added_as_guest");
      g = await device("g", gus, workspaceId);
    }, 60_000);

    test("a guest syncs only the shared page", async () => {
      await eventually(async () => docOn(g.store, shared), "shared page on the guest");
      expect(await docOn(g.store, privateDoc)).toBeNull();
      const tree = await g.store.listTree(workspaceId, { includeDeleted: true });
      expect(tree.map((d) => d.id)).toEqual([shared]);
    }, 60_000);

    test("a rejected change is surfaced and rolled back to the server's state", async () => {
      await renameDoc(g.store, shared, "Guest was here", gus.user()!.id);
      expect((await docOn(g.store, shared))?.title).toBe("Guest was here");
      await eventually(async () => g.parts.sync.rejected.get().length > 0, "rejection");
      expect(g.parts.sync.rejected.get()[0]).toMatchObject({
        operation: "doc.rename",
        reason: { code: expect.stringMatching(/forbidden|not_found/) },
      });
      await eventually(async () => (await docOn(g.store, shared))?.title === "Shared", "rollback");
    }, 60_000);

    test("revoking access closes the open document and removes the rows", async () => {
      const open = g.parts.collab!.open(shared);
      await open.whenSynced();
      expect(open.state.get().readOnly).toBe(true);
      const sharing = await ada.api.get<{ grants: Array<{ id: string; principalId: string }> }>(
        `/v1/documents/${shared}/sharing`,
      );
      const grant = sharing.grants.find((x) => x.principalId === gus.user()!.id)!;
      await ada.api.request("DELETE", `/v1/documents/${shared}/grants/${grant.id}`);
      await eventually(
        async () => open.state.get().status === "unavailable",
        "document closed",
        45_000,
      );
      expect(open.state.get().reason).toBe("forbidden");
      await eventually(async () => (await docOn(g.store, shared)) === null, "rows removed");
      open.release();
    }, 90_000);
  });

  test("local → hosted hand-off keeps ids, tree, properties, trash, attachments and bodies", async () => {
    const localDir = mkdtempSync(join(tmpdir(), "lydie-live-local-"));
    dirs.push(localDir);
    const local = await openNodeStore({ path: join(localDir, "local.sqlite"), mode: "local" });
    toClose.push(() => local.close());
    const localBlob = createDirectoryBlob(join(localDir, "blobs"));
    const localWs = "LOCALWORKSPACE";
    const top = await createDoc(local, { workspaceId: localWs, title: "Notes" });
    const idea = await createDoc(local, { workspaceId: localWs, parentId: top.id, title: "Idea" });
    const old = await createDoc(local, { workspaceId: localWs, title: "Old" });
    const bytes = new TextEncoder().encode("handoff bytes");
    const sha256 = await sha256Hex(bytes);
    await localBlob.put(sha256, bytes);
    const attachmentId = testUuid();
    const now = new Date().toISOString();
    await local.ports.db.write(async (tx) => {
      await tx.bodies.put(idea.id, localWs, { markdown: "Links to [[Notes]]", version: "1" }, now);
      await tx.docs.update(top.id, { properties: { status: "draft" } });
      await tx.docs.update(old.id, { deletedAt: now });
      await tx.attachments!.insert({
        id: attachmentId,
        workspaceId: localWs,
        documentId: idea.id,
        filename: "h.txt",
        contentType: "text/plain",
        size: bytes.byteLength,
        sha256,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });

    const target = (await ada.createWorkspace({ name: `Handed off ${run}` })).id;
    const general = (await ada.teamspaces(target)).find((t) => t.isDefault)!.id;
    const source = { store: local, workspaceId: localWs, blob: localBlob };
    const targetSpec = {
      api: ada.api,
      userId: ada.user()!.id,
      workspaceId: target,
      teamspaceId: general,
      version: VERSION,
    };
    const plan = await planHandoff(source, targetSpec);
    expect(plan.summary).toMatchObject({
      documents: 3,
      trashed: 1,
      bodies: 1,
      attachments: 1,
      existingInTarget: [],
      conflicts: [],
      missingBytes: [],
    });
    // The app's Markdown → Yjs converter; the test stores the text in a paragraph.
    const toYjs = (markdown: string) => {
      const doc = new Y.Doc();
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(markdown)]);
      doc.getXmlFragment("default").insert(0, [paragraph]);
      return Y.encodeStateAsUpdate(doc);
    };
    const result = await runHandoff(plan, { bodies: { toYjs } });
    expect(result).toMatchObject({
      ok: true,
      scope: { kind: "hosted", workspaceId: target },
      bodies: { failed: [] },
      attachments: { uploaded: 1, failed: [], missing: [] },
      rejected: [],
    });

    // Either this client pushed the body through collab, or the server already built it from the
    // Markdown sent with doc.create (once it has the Markdown → Yjs codec); never both.
    expect(result.bodies.pushed + result.bodies.skipped).toBe(1);

    // The window "reopens" in hosted scope for the target workspace.
    const reopened = await device("handoff", ada, target);
    await eventually(async () => {
      const tree = await reopened.store.listTree(target, { includeDeleted: true });
      return tree.length === 3;
    }, "handed-off tree");
    const ideaDoc = await docOn(reopened.store, idea.id);
    expect(ideaDoc).toMatchObject({ parentId: top.id, title: "Idea", deletedAt: null });
    expect((await docOn(reopened.store, top.id))?.properties).toEqual({ status: "draft" });
    expect((await docOn(reopened.store, old.id))?.deletedAt).not.toBeNull();
    const links = await reopened.store.backlinks(top.id);
    expect(links.map((l) => l.source.id)).toContain(idea.id);
    await eventually(
      async () => reopened.store.ports.db.read(async (tx) => tx.attachments!.get(attachmentId)),
      "attachment on hosted",
    );
    const body = reopened.parts.collab!.open(idea.id);
    await body.whenSynced();
    expect(body.ydoc.getXmlFragment("default").toJSON()).toContain("Links to");
    body.release();

    // Running it again changes nothing (resume after a crash); the plan now sees the ids.
    const replan = await planHandoff(source, targetSpec);
    expect(replan.summary.existingInTarget.sort()).toEqual([top.id, idea.id, old.id].sort());
    const again = await runHandoff(replan, {
      bodies: {
        toYjs,
        collab: createCollab({ api: ada.api, persistence: createMemoryYjsPersistence() }),
      },
    });
    expect(again).toMatchObject({ ok: true, applied: 0, bodies: { pushed: 0, skipped: 1 } });
  }, 120_000);

  test("hand-off brings databases with their properties, views, values and relations", async () => {
    const localDir = mkdtempSync(join(tmpdir(), "lydie-live-local-db-"));
    dirs.push(localDir);
    const local = await openNodeStore({ path: join(localDir, "local.sqlite"), mode: "local" });
    toClose.push(() => local.close());
    const localWs = "LOCALWORKSPACEDB";
    const books = await createDoc(local, { workspaceId: localWs, title: "Books" });
    const authors = await createDoc(local, { workspaceId: localWs, title: "Authors" });
    const old = await createDoc(local, { workspaceId: localWs, title: "Old table" });
    const dune = await createDoc(local, {
      workspaceId: localWs,
      parentId: books.id,
      title: "Dune",
    });
    const herbert = await createDoc(local, {
      workspaceId: localWs,
      parentId: authors.id,
      title: "Frank Herbert",
    });
    const p = {
      title: testUuid(),
      status: testUuid(),
      rating: testUuid(),
      author: testUuid(),
      name: testUuid(),
      wrote: testUuid(),
      oldTitle: testUuid(),
    };
    const v = { table: testUuid(), board: testUuid(), authors: testUuid(), old: testUuid() };
    const reading = { id: testUuid(), name: "Reading", color: "blue" as const };
    await insertDatabase(local, {
      workspaceId: localWs,
      id: books.id,
      properties: [
        { id: p.title, name: "Title", type: "title", key: "name" },
        {
          id: p.status,
          name: "Status",
          type: "select",
          key: "status",
          config: { options: [reading, { id: testUuid(), name: "Done", color: "green" }] },
        },
        { id: p.rating, name: "Rating", type: "number", key: "rating" },
        {
          id: p.author,
          name: "Author",
          type: "relation",
          key: "author",
          config: {
            relation: {
              databaseId: authors.id,
              twoWay: true,
              reversePropertyId: p.wrote,
              limit: "many",
            },
          },
        },
      ],
      views: [
        { id: v.table, name: "All books", type: "table" },
        {
          id: v.board,
          name: "By status",
          type: "board",
          config: { groupBy: { propertyId: p.status, direction: "asc" } },
        },
      ],
    });
    await insertDatabase(local, {
      workspaceId: localWs,
      id: authors.id,
      properties: [
        { id: p.name, name: "Name", type: "title", key: "name" },
        {
          id: p.wrote,
          name: "Books",
          type: "relation",
          key: "books",
          config: {
            relation: {
              databaseId: books.id,
              twoWay: true,
              reversePropertyId: p.author,
              limit: "many",
            },
          },
        },
      ],
      views: [{ id: v.authors, name: "Table", type: "table" }],
    });
    await insertDatabase(local, {
      workspaceId: localWs,
      id: old.id,
      deletedAt: new Date().toISOString(),
      properties: [{ id: p.oldTitle, name: "Name", type: "title", key: "name" }],
      views: [{ id: v.old, name: "Table", type: "table" }],
    });
    await local.ports.db.write(async (tx) => {
      await tx.docs.update(dune.id, {
        properties: { status: "Reading", rating: 5, author: [herbert.id] },
      });
      await tx.docs.update(herbert.id, { properties: { books: [dune.id] } });
    });

    const target = (await ada.createWorkspace({ name: `Databases ${run}` })).id;
    const general = (await ada.teamspaces(target)).find((t) => t.isDefault)!.id;
    const source = { store: local, workspaceId: localWs };
    const targetSpec = {
      api: ada.api,
      userId: ada.user()!.id,
      workspaceId: target,
      teamspaceId: general,
      version: VERSION,
    };
    const plan = await planHandoff(source, targetSpec, { bodies: false });
    expect(plan.summary).toMatchObject({ documents: 5, databases: 3 });
    const result = await runHandoff(plan);
    expect(result).toMatchObject({ ok: true, rejected: [] });
    expect(result.applied).toBe(plan.summary.operations);

    const reopened = await device("handoff-db", ada, target);
    const s = reopened.store;
    await eventually(async () => {
      const views = await s.query(queries.databaseViews(books.id));
      return views.length === 2;
    }, "handed-off database views");
    const properties = await s.query(queries.databaseProperties(books.id));
    expect(properties.map((x) => [x.id, x.type, x.key])).toEqual([
      [p.title, "title", "name"],
      [p.status, "select", "status"],
      [p.rating, "number", "rating"],
      [p.author, "relation", "author"],
    ]);
    expect(properties[1]!.config.options?.[0]).toEqual(reading);
    expect(properties[3]!.config.relation).toMatchObject({
      databaseId: authors.id,
      reversePropertyId: p.wrote,
    });
    const views = await s.query(queries.databaseViews(books.id));
    expect(views.map((x) => [x.id, x.type, x.name])).toEqual([
      [v.table, "table", "All books"],
      [v.board, "board", "By status"],
    ]);
    expect(views[1]!.config.groupBy).toMatchObject({ propertyId: p.status });
    await eventually(async () => (await docOn(s, herbert.id))?.properties.books, "author's books");
    expect((await docOn(s, dune.id))?.properties).toEqual({
      status: "Reading",
      rating: 5,
      author: [herbert.id],
    });
    expect((await docOn(s, herbert.id))?.properties).toEqual({ books: [dune.id] });
    // Relation values are links on the core too.
    const linked = await ada.api.get<{ backlinks: Array<{ source: { id: string } }> }>(
      `/v1/documents/${herbert.id}/backlinks`,
    );
    expect(linked.backlinks.map((l) => l.source.id)).toContain(dune.id);
    // The database that was a page again is one again.
    await eventually(
      async () => (await s.query(queries.database(old.id)))[0]?.deletedAt,
      "turned-back database",
    );

    const again = await runHandoff(await planHandoff(source, targetSpec, { bodies: false }));
    expect(again).toMatchObject({ ok: true, applied: 0, rejected: [] });
  }, 120_000);

  test("hand-off makes the local user in person values the signed-in user", async () => {
    const localDir = mkdtempSync(join(tmpdir(), "lydie-live-local-people-"));
    dirs.push(localDir);
    const local = await openNodeStore({ path: join(localDir, "local.sqlite"), mode: "local" });
    toClose.push(() => local.close());
    const localWs = "LOCALWORKSPACEPEOPLE";
    const team = await createDoc(local, { workspaceId: localWs, title: "Team" });
    const row = await createDoc(local, { workspaceId: localWs, parentId: team.id, title: "Plan" });
    await insertDatabase(local, {
      workspaceId: localWs,
      id: team.id,
      properties: [
        { id: testUuid(), name: "Name", type: "title", key: "name" },
        { id: testUuid(), name: "Owner", type: "person", key: "owner" },
      ],
      views: [{ id: testUuid(), name: "Table", type: "table" }],
    });
    await local.ports.db.write(async (tx) => {
      await tx.docs.update(row.id, { properties: { owner: ["local"] } });
    });
    const target = (await ada.createWorkspace({ name: `People ${run}` })).id;
    const result = await runHandoff(
      await planHandoff(
        { store: local, workspaceId: localWs },
        {
          api: ada.api,
          userId: ada.user()!.id,
          workspaceId: target,
          teamspaceId: (await ada.teamspaces(target)).find((t) => t.isDefault)!.id,
          version: VERSION,
        },
        { bodies: false },
      ),
    );
    expect(result).toMatchObject({ ok: true, rejected: [] });

    const reopened = await device("handoff-people", ada, target);
    const synced = await eventually(async () => docOn(reopened.store, row.id), "handed-off row");
    expect(synced.properties).toEqual({ owner: [ada.user()!.id] });
    expect(synced.createdBy).toBe(ada.user()!.id);
  }, 120_000);

  test("hand-off brings trashed properties and views to the trash, where they can be restored", async () => {
    const localDir = mkdtempSync(join(tmpdir(), "lydie-live-local-trashed-"));
    dirs.push(localDir);
    const local = await openNodeStore({ path: join(localDir, "local.sqlite"), mode: "local" });
    toClose.push(() => local.close());
    const localWs = "LOCALWORKSPACETRASHED";
    const books = await createDoc(local, { workspaceId: localWs, title: "Books" });
    const dune = await createDoc(local, {
      workspaceId: localWs,
      parentId: books.id,
      title: "Dune",
    });
    const gone = new Date().toISOString();
    const p = {
      title: testUuid(),
      status: testUuid(),
      oldStatus: testUuid(),
      notes: testUuid(),
      oldNotes: testUuid(),
    };
    const v = { table: testUuid(), board: testUuid() };
    await insertDatabase(local, {
      workspaceId: localWs,
      id: books.id,
      properties: [
        { id: p.title, name: "Title", type: "title", key: "name" },
        { id: p.oldStatus, name: "Status", type: "text", key: "status", deletedAt: gone },
        { id: p.status, name: "Status", type: "select", key: "status" },
        { id: p.oldNotes, name: "Notes", type: "text", key: "notes", deletedAt: gone },
        { id: p.notes, name: "Notes", type: "text", key: "notes", deletedAt: gone },
      ],
      views: [
        { id: v.table, name: "Table", type: "table" },
        { id: v.board, name: "Board", type: "board", deletedAt: gone },
      ],
    });
    await local.ports.db.write(async (tx) => {
      await tx.docs.update(dune.id, { properties: { status: "Reading", notes: "Spice" } });
    });
    const target = (await ada.createWorkspace({ name: `Trashed ${run}` })).id;
    const plan = await planHandoff(
      { store: local, workspaceId: localWs },
      {
        api: ada.api,
        userId: ada.user()!.id,
        workspaceId: target,
        teamspaceId: (await ada.teamspaces(target)).find((t) => t.isDefault)!.id,
        version: VERSION,
      },
      { bodies: false },
    );
    const result = await runHandoff(plan);
    expect(result).toMatchObject({ ok: true, rejected: [] });
    expect(result.applied).toBe(plan.summary.operations);

    const definition = () =>
      ada.api.get<{ properties: Array<{ id: string }>; views: Array<{ id: string }> }>(
        `/v1/databases/${books.id}`,
      );
    const live = await definition();
    expect(live.properties.map((x) => x.id)).toEqual([p.title, p.status]);
    expect(live.views.map((x) => x.id)).toEqual([v.table]);

    const reopened = await device("handoff-trashed", ada, target);
    const all = await eventually(async () => {
      const found = await reopened.store.query(
        queries.databaseProperties(books.id, { includeDeleted: true }),
      );
      return found.length === 5 && found;
    }, "trashed properties");
    expect(all.filter((x) => x.deletedAt).map((x) => x.id)).toEqual(
      expect.arrayContaining([p.oldStatus, p.oldNotes, p.notes]),
    );
    expect(all.filter((x) => !x.deletedAt).map((x) => x.id)).toEqual([p.title, p.status]);
    await eventually(async () => {
      const views = await reopened.store.query(
        queries.databaseViews(books.id, { includeDeleted: true }),
      );
      return views.find((x) => x.id === v.board)?.deletedAt;
    }, "trashed view");

    // Restoring brings them back with their row values; one whose key is taken again is refused,
    // as it was in the browser.
    await ada.api.post(`/v1/database-properties/${p.notes}/restore`, {});
    await ada.api.post(`/v1/database-views/${v.board}/restore`, {});
    const restored = await definition();
    expect(restored.properties.map((x) => x.id)).toContain(p.notes);
    expect(restored.views.map((x) => x.id).sort()).toEqual([v.table, v.board].sort());
    const refused = await ada.api.post(`/v1/database-properties/${p.oldStatus}/restore`, {}).then(
      () => null,
      (error: unknown) => error,
    );
    expect(isApiError(refused) && refused.status).toBe(409);
    const row = await eventually(async () => docOn(reopened.store, dune.id), "row");
    expect(row.properties).toEqual({ status: "Reading", notes: "Spice" });

    const again = await runHandoff(plan);
    expect(again).toMatchObject({ ok: true, applied: 0, rejected: [] });
  }, 120_000);

  test("hand-off reports the Getting started page's new id, or none when the target has one", async () => {
    const localDir = mkdtempSync(join(tmpdir(), "lydie-live-local-gs-"));
    dirs.push(localDir);
    const local = await openNodeStore({ path: join(localDir, "local.sqlite"), mode: "local" });
    toClose.push(() => local.close());
    const localWs = `LOCALWORKSPACEGS${run}`;
    const from = gettingStartedId(localWs);
    await createDoc(local, { workspaceId: localWs, id: from, title: "Getting started" });
    const handOff = async (gettingStarted: boolean) => {
      const target = (
        await ada.createWorkspace({
          name: `Getting started ${run} ${gettingStarted}`,
          gettingStarted,
        })
      ).id;
      const targetSpec = {
        api: ada.api,
        userId: ada.user()!.id,
        workspaceId: target,
        teamspaceId: (await ada.teamspaces(target)).find((t) => t.isDefault)!.id,
        version: VERSION,
      };
      const source = { store: local, workspaceId: localWs };
      const result = await runHandoff(await planHandoff(source, targetSpec, { bodies: false }));
      expect(result).toMatchObject({ ok: true, rejected: [] });
      // A repeated run decides the same way.
      const again = await runHandoff(await planHandoff(source, targetSpec, { bodies: false }));
      expect(again.renamed).toEqual(result.renamed);
      return { target, renamed: result.renamed };
    };

    const fresh = await handOff(false);
    expect(fresh.renamed).toEqual({ [from]: gettingStartedId(fresh.target) });
    const own = await handOff(true);
    expect(own.renamed).toEqual({});
  }, 120_000);
});
