import { afterEach, describe, expect, test } from "bun:test";

import { gettingStartedId, isUuid, operations } from "@lydie/contract";
import * as Y from "yjs";

import { startTestCollabServer } from "../test/collab-server.ts";
import { createFakeCore, testUuid } from "../test/fake-core.ts";
import type { FakeCore } from "../test/fake-core.ts";
import { closeTestStores, createDoc, insertDatabase, openTestStore } from "../test/store.ts";
import { sha256Hex } from "./attachments.ts";
import { createCollab } from "./collab/collab.ts";
import { createMemoryYjsPersistence } from "./collab/persistence.ts";
import { deterministicUuid, planHandoff, runHandoff } from "./handoff.ts";
import { createApiClient } from "./http.ts";
import type { BlobPort, KeyValueStorage } from "./types.ts";

afterEach(() => closeTestStores());

describe("deterministic operation ids", () => {
  test("are valid ids, stable per key, distinct across keys", async () => {
    const a = await deterministicUuid("ws:doc:create", "2026-11-12T10:00:00.000Z");
    expect(isUuid(a)).toBe(true);
    expect(await deterministicUuid("ws:doc:create", "2026-11-12T10:00:00.000Z")).toBe(a);
    expect(await deterministicUuid("ws:doc:delete", "2026-11-12T10:00:00.000Z")).not.toBe(a);
    expect((await deterministicUuid("k", "garbage")).slice(0, 13)).toBe("00000000-0000");
  });
});

describe("hand-off", () => {
  async function source() {
    const { store } = await openTestStore("local");
    const blob: BlobPort & { data: Map<string, Uint8Array> } = {
      data: new Map(),
      put: async (k, v) => void blob.data.set(k, v),
      get: async (k) => blob.data.get(k) ?? null,
      delete: async (k) => void blob.data.delete(k),
      has: async (k) => blob.data.has(k),
    };
    const top = await createDoc(store, { workspaceId: "local-ws", title: "Top" });
    const child = await createDoc(store, {
      workspaceId: "local-ws",
      parentId: top.id,
      title: "Child",
    });
    const binned = await createDoc(store, { workspaceId: "local-ws", title: "Binned" });
    const now = new Date().toISOString();
    const bytes = new TextEncoder().encode("file");
    const sha256 = await sha256Hex(bytes);
    await blob.put(sha256, bytes);
    await store.ports.db.write(async (tx) => {
      await tx.bodies.put(child.id, "local-ws", { markdown: "See [[Top]]", version: "1" }, now);
      await tx.docs.update(binned.id, { deletedAt: now });
      await tx.attachments!.insert({
        id: "0192b5a5-3234-7574-0000-000000000000",
        workspaceId: "local-ws",
        documentId: child.id,
        filename: "f.txt",
        contentType: "text/plain",
        size: bytes.byteLength,
        sha256,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });
    return { store, blob, top, child, binned };
  }

  test("plans, uploads parents first with ids and trash state, and is idempotent", async () => {
    const { store, blob, top, child, binned } = await source();
    const core = createFakeCore();
    const api = createApiClient({
      baseUrl: "http://core.test",
      token: () => "token-1",
      fetch: core.fetch,
    });
    const target = {
      api,
      userId: "user-1",
      workspaceId: "hosted-ws",
      teamspaceId: "ts-1",
      version: "2026-11-12",
    };
    const plan = await planHandoff({ store, workspaceId: "local-ws", blob }, target, {
      bodies: false,
    });
    expect(plan.summary).toMatchObject({
      documents: 3,
      trashed: 1,
      bodies: 1,
      attachments: 1,
      operations: 5,
      existingInTarget: [],
      conflicts: [],
      missingBytes: [],
    });
    expect(plan.summary.warnings[0]).toContain("converter");

    const storage = new Map<string, string>();
    const kv: KeyValueStorage = {
      get: async (k) => storage.get(k) ?? null,
      set: async (k, v) => void storage.set(k, v),
      delete: async (k) => void storage.delete(k),
    };
    const result = await runHandoff(plan, { storage: kv });
    expect(result).toMatchObject({
      ok: true,
      applied: 5,
      duplicates: 0,
      scope: { kind: "hosted", workspaceId: "hosted-ws" },
    });
    const sent = core.applied.map((e) => [e.operation, (e.input as { id: string }).id]);
    expect(sent.slice(0, 3).map(([op]) => op)).toEqual(["doc.create", "doc.create", "doc.create"]);
    // Parents before children, then the attachment, then trash.
    const order = sent.map(([op, id]) => `${op}:${id}`);
    expect(order.indexOf(`doc.create:${top.id}`)).toBeLessThan(
      order.indexOf(`doc.create:${child.id}`),
    );
    expect(order.slice(-2)).toEqual([
      "attachment.create:0192b5a5-3234-7574-0000-000000000000",
      `doc.delete:${binned.id}`,
    ]);
    const childCreate = core.applied.find((e) => (e.input as { id: string }).id === child.id)!;
    expect(childCreate.input).toMatchObject({
      workspaceId: "hosted-ws",
      parentId: top.id,
      markdown: "See [[Top]]",
    });
    expect(childCreate.input).not.toHaveProperty("teamspaceId");
    const topCreate = core.applied.find((e) => (e.input as { id: string }).id === top.id)!;
    expect(topCreate.input).toMatchObject({ teamspaceId: "ts-1", parentId: null });
    expect(core.blobs.size).toBe(1);
    expect(storage.size).toBe(0);

    // Running it again (e.g. the first run's answer was lost) applies nothing twice.
    const again = await runHandoff(plan);
    expect(again).toMatchObject({ ok: true, applied: 0, duplicates: 5 });
    expect(core.applied).toHaveLength(5);
  });

  describe("the Getting started page", () => {
    const from = gettingStartedId("local-ws");
    const to = gettingStartedId("hosted-ws");

    async function withGettingStarted() {
      const { store } = await openTestStore("local");
      const blob: BlobPort = {
        put: async () => {},
        get: async () => null,
        delete: async () => {},
      };
      await createDoc(store, { workspaceId: "local-ws", title: "Notes" });
      await createDoc(store, { workspaceId: "local-ws", id: from, title: "Getting started" });
      const child = await createDoc(store, {
        workspaceId: "local-ws",
        parentId: from,
        title: "Links and backlinks",
      });
      const now = new Date().toISOString();
      await store.ports.db.write(async (tx) => {
        await tx.bodies.put(
          from,
          "local-ws",
          {
            markdown: "See [[Links and backlinks]]",
            version: "1",
          },
          now,
        );
        await tx.attachments!.insert({
          id: "0192b5a5-3234-7574-0000-000000000001",
          workspaceId: "local-ws",
          documentId: from,
          filename: "f.txt",
          contentType: "text/plain",
          size: 4,
          sha256: "0".repeat(64),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      });
      const core = createFakeCore();
      const api = createApiClient({
        baseUrl: "http://core.test",
        token: () => "token-1",
        fetch: core.fetch,
      });
      const target = {
        api,
        userId: "user-1",
        workspaceId: "hosted-ws",
        teamspaceId: null,
        version: "2026-11-12",
      };
      const plan = await planHandoff({ store, workspaceId: "local-ws", blob }, target, {
        bodies: false,
      });
      return { core, plan, child };
    }

    const inputOf = (core: FakeCore, operation: string, id: string) =>
      core.applied.find((e) => e.operation === operation && (e.input as { id: string }).id === id)
        ?.input as Record<string, unknown> | undefined;

    test("takes the id derived from the target workspace, with its children and attachments", async () => {
      const { core, plan, child } = await withGettingStarted();
      expect(plan.gettingStarted).toEqual({ from, to });

      const result = await runHandoff(plan);
      expect(result).toMatchObject({ ok: true, applied: 4, duplicates: 0, rejected: [] });
      // The app moves what it keeps per document id (favorites, recents) with it.
      expect(result.renamed).toEqual({ [from]: to });
      expect(inputOf(core, "doc.create", from)).toBeUndefined();
      expect(inputOf(core, "doc.create", to)).toMatchObject({
        title: "Getting started",
        parentId: null,
        markdown: "See [[Links and backlinks]]",
      });
      expect(inputOf(core, "doc.create", child.id)).toMatchObject({ parentId: to });
      expect(
        inputOf(core, "attachment.create", "0192b5a5-3234-7574-0000-000000000001"),
      ).toMatchObject({
        documentId: to,
      });

      // A second run sends the same operations: nothing is created twice.
      const again = await runHandoff(plan);
      expect(again).toMatchObject({ ok: true, applied: 0, duplicates: 4 });
      expect(again.renamed).toEqual({ [from]: to });
      expect(core.applied).toHaveLength(4);
    });

    test("keeps its id when the target has a Getting started page of its own", async () => {
      const { core, plan, child } = await withGettingStarted();
      // The target workspace was created with its own page under the derived id.
      core.decide = (entry) =>
        entry.operation === "doc.create" && (entry.input as { id: string }).id === to
          ? { status: "rejected", error: { code: "conflict", message: "exists" } }
          : { status: "applied" };

      const result = await runHandoff(plan);
      expect(result).toMatchObject({ ok: true, applied: 4, rejected: [] });
      expect(result.renamed).toEqual({});
      expect(inputOf(core, "doc.create", from)).toMatchObject({ title: "Getting started" });
      expect(inputOf(core, "doc.create", child.id)).toMatchObject({ parentId: from });
      expect(
        inputOf(core, "attachment.create", "0192b5a5-3234-7574-0000-000000000001"),
      ).toMatchObject({
        documentId: from,
      });

      // A resumed run gets the same answer for the same operation, so decides the same way.
      const kv = new Map([[`lydie.handoff:local-ws:hosted-ws`, JSON.stringify(["documents"])]]);
      const again = await runHandoff(plan, {
        storage: {
          get: async (k) => kv.get(k) ?? null,
          set: async (k, v) => void kv.set(k, v),
          delete: async (k) => void kv.delete(k),
        },
      });
      expect(again).toMatchObject({ ok: true, applied: 0, rejected: [], renamed: {} });
      expect(core.applied).toHaveLength(4);
      expect(core.applied.some((e) => (e.input as { id?: string }).id === to)).toBe(false);
    });
  });

  describe("databases", () => {
    const ws = "local-ws";

    async function withDatabases() {
      const { store } = await openTestStore("local");
      const projects = await createDoc(store, { workspaceId: ws, title: "Projects" });
      const tasks = await createDoc(store, { workspaceId: ws, title: "Tasks" });
      // A database turned back into a page: its definition stays for database.restore.
      const archive = await createDoc(store, { workspaceId: ws, title: "Archive" });
      const launch = await createDoc(store, {
        workspaceId: ws,
        parentId: projects.id,
        title: "Launch",
      });
      const template = await createDoc(store, {
        workspaceId: ws,
        parentId: projects.id,
        title: "Project template",
      });
      const post = await createDoc(store, { workspaceId: ws, parentId: tasks.id, title: "Post" });
      const p = {
        name: testUuid(),
        status: testUuid(),
        pages: testUuid(),
        due: testUuid(),
        done: testUuid(),
        tags: testUuid(),
        pid: testUuid(),
        tasks: testUuid(),
        count: testUuid(),
        taskName: testUuid(),
        project: testUuid(),
        archiveName: testUuid(),
      };
      const v = { table: testUuid(), board: testUuid(), tasks: testUuid(), archive: testUuid() };
      const options = [
        { id: testUuid(), name: "Active", color: "blue" as const },
        { id: testUuid(), name: "Paused", color: "gray" as const },
      ];
      const relation = (databaseId: string, reversePropertyId: string) => ({
        relation: { databaseId, twoWay: true, reversePropertyId, limit: "many" as const },
      });
      await insertDatabase(store, {
        workspaceId: ws,
        id: projects.id,
        config: { templateIds: [template.id] },
        properties: [
          { id: p.name, name: "Name", type: "title", key: "name" },
          { id: p.status, name: "Status", type: "select", key: "status", config: { options } },
          { id: p.pages, name: "Pages", type: "number", key: "pages" },
          { id: p.due, name: "Due", type: "date", key: "due" },
          { id: p.done, name: "Done", type: "checkbox", key: "done" },
          {
            id: p.tags,
            name: "Tags",
            type: "multiSelect",
            key: "tags",
            config: { options: [{ id: testUuid(), name: "web", color: "green" }] },
          },
          { id: p.pid, name: "ID", type: "uniqueId", key: "pid", config: { prefix: "PRJ" } },
          {
            id: p.tasks,
            name: "Tasks",
            type: "relation",
            key: "tasks",
            config: relation(tasks.id, p.project),
          },
          {
            id: p.count,
            name: "Task count",
            type: "rollup",
            key: "taskCount",
            config: {
              rollup: {
                relationPropertyId: p.tasks,
                targetPropertyId: p.taskName,
                function: "count",
              },
            },
          },
        ],
        views: [
          {
            id: v.table,
            name: "All projects",
            type: "table",
            config: { sorts: [{ propertyId: p.due, direction: "desc" }] },
          },
          {
            id: v.board,
            name: "By status",
            type: "board",
            config: { groupBy: { propertyId: p.status, direction: "asc" } },
          },
        ],
      });
      await insertDatabase(store, {
        workspaceId: ws,
        id: tasks.id,
        properties: [
          { id: p.taskName, name: "Name", type: "title", key: "name" },
          {
            id: p.project,
            name: "Project",
            type: "relation",
            key: "project",
            config: relation(projects.id, p.tasks),
          },
        ],
        views: [{ id: v.tasks, name: "Table", type: "table" }],
      });
      await insertDatabase(store, {
        workspaceId: ws,
        id: archive.id,
        deletedAt: new Date().toISOString(),
        properties: [{ id: p.archiveName, name: "Name", type: "title", key: "name" }],
        views: [{ id: v.archive, name: "Table", type: "table" }],
      });
      await store.ports.db.write(async (tx) => {
        await tx.docs.update(launch.id, {
          properties: {
            status: "Active",
            pages: 12,
            due: "2026-12-01",
            done: true,
            tags: ["web"],
            pid: 1,
            tasks: [post.id],
          },
        });
        await tx.docs.update(post.id, { properties: { project: [launch.id] } });
      });
      const core = createFakeCore();
      const api = createApiClient({
        baseUrl: "http://core.test",
        token: () => "token-1",
        fetch: core.fetch,
      });
      const target = {
        api,
        userId: "user-1",
        workspaceId: "hosted-ws",
        teamspaceId: null,
        version: "2026-11-12",
      };
      const plan = await planHandoff({ store, workspaceId: ws }, target, { bodies: false });
      return { core, plan, projects, tasks, archive, launch, template, post, p, v, options };
    }

    test("arrive with their properties, views, settings and row values", async () => {
      const { core, plan, projects, tasks, archive, launch, template, post, p, v, options } =
        await withDatabases();
      expect(plan.summary).toMatchObject({ documents: 6, databases: 3 });

      const result = await runHandoff(plan);
      expect(result).toMatchObject({ ok: true, rejected: [] });
      expect(result.applied).toBe(plan.summary.operations);
      // Every input is one the core accepts.
      for (const entry of core.applied) {
        const op = operations[entry.operation as keyof typeof operations];
        expect(op.input.safeParse(entry.input).success).toBe(true);
      }
      const order = core.applied.map((e) => {
        const input = e.input as { id?: string; documentId?: string; databaseId?: string };
        return `${e.operation}:${input.documentId ?? input.id ?? input.databaseId}`;
      });
      const step = (s: string) => {
        const i = order.indexOf(s);
        expect(i).toBeGreaterThanOrEqual(0);
        return i;
      };
      const input = (operation: string, id: string) =>
        core.applied.find((e) => {
          const i = e.input as { id?: string; documentId?: string; databaseId?: string };
          return e.operation === operation && (i.documentId ?? i.id ?? i.databaseId) === id;
        })?.input as Record<string, unknown>;

      // The document first, then the database on it with the source's ids, then its definition.
      for (const db of [projects, tasks, archive]) {
        expect(step(`doc.create:${db.id}`)).toBeLessThan(step(`database.create:${db.id}`));
        expect(step(`database.create:${db.id}`)).toBeLessThan(
          step(`database.setDefinition:${db.id}`),
        );
      }
      expect(input("database.create", projects.id)).toMatchObject({
        workspaceId: "hosted-ws",
        documentId: projects.id,
        titlePropertyId: p.name,
        viewId: v.table,
      });
      const definition = input("database.setDefinition", projects.id).definition as {
        config: unknown;
        properties: Array<{ id: string; type: string; key: string; config: unknown }>;
        views: Array<{ id: string; type: string; name: string; config: unknown }>;
      };
      expect(definition.config).toEqual({ filter: null, templateIds: [template.id], extra: {} });
      expect(definition.properties.map((x) => [x.id, x.type, x.key])).toEqual([
        [p.name, "title", "name"],
        [p.status, "select", "status"],
        [p.pages, "number", "pages"],
        [p.due, "date", "due"],
        [p.done, "checkbox", "done"],
        [p.tags, "multiSelect", "tags"],
        [p.pid, "uniqueId", "pid"],
        [p.tasks, "relation", "tasks"],
        [p.count, "rollup", "taskCount"],
      ]);
      expect(definition.properties[1]!.config).toEqual({ options });
      expect(definition.properties[7]!.config).toEqual({
        relation: {
          databaseId: tasks.id,
          twoWay: true,
          reversePropertyId: p.project,
          limit: "many",
        },
      });
      expect(definition.views.map((x) => [x.id, x.type, x.name])).toEqual([
        [v.table, "table", "All projects"],
        [v.board, "board", "By status"],
      ]);
      expect(definition.views[1]!.config).toMatchObject({
        groupBy: { propertyId: p.status, direction: "asc" },
      });

      // Row values come with the rows, except relations: those are set once both databases
      // exist, so the core indexes them as links.
      expect(input("doc.create", launch.id).properties).toEqual({
        status: "Active",
        pages: 12,
        due: "2026-12-01",
        done: true,
        tags: ["web"],
        pid: 1,
      });
      const relations = core.applied.filter((e) => e.operation === "database.setValues");
      expect(relations.map((e) => e.input)).toEqual([
        {
          databaseId: projects.id,
          updates: [{ rowId: launch.id, set: { [p.tasks]: [post.id] } }],
          exact: true,
        },
        {
          databaseId: tasks.id,
          updates: [{ rowId: post.id, set: { [p.project]: [launch.id] } }],
          exact: true,
        },
      ]);
      const lastDefinition = Math.max(
        ...[projects, tasks, archive].map((db) => step(`database.setDefinition:${db.id}`)),
      );
      expect(step(`database.setValues:${projects.id}`)).toBeGreaterThan(lastDefinition);

      // The database turned back into a page goes back to being one, with the rest of the trash.
      expect(order.at(-1)).toBe(`database.delete:${archive.id}`);

      // A second run sends the same operations: nothing is applied twice.
      const again = await runHandoff(plan);
      expect(again).toMatchObject({ ok: true, applied: 0, duplicates: result.applied });
    });

    test("person values that are the local user become the signed-in user", async () => {
      const { store } = await openTestStore("local");
      const people = await createDoc(store, { workspaceId: ws, title: "People" });
      // Turned back into a page: its values come back with database.restore.
      const old = await createDoc(store, { workspaceId: ws, title: "Old" });
      const row = await createDoc(store, { workspaceId: ws, parentId: people.id, title: "Row" });
      const oldRow = await createDoc(store, {
        workspaceId: ws,
        parentId: old.id,
        title: "Old row",
      });
      const page = await createDoc(store, { workspaceId: ws, title: "Page" });
      const person = (id: string) => ({ id, name: "Owner", type: "person" as const, key: "owner" });
      await insertDatabase(store, {
        workspaceId: ws,
        id: people.id,
        properties: [
          { id: testUuid(), name: "Name", type: "title", key: "name" },
          person(testUuid()),
          { id: testUuid(), name: "Reviewer", type: "person", key: "reviewer" },
        ],
        views: [{ id: testUuid(), name: "Table", type: "table" }],
      });
      await insertDatabase(store, {
        workspaceId: ws,
        id: old.id,
        deletedAt: new Date().toISOString(),
        properties: [person(testUuid())],
        views: [{ id: testUuid(), name: "Table", type: "table" }],
      });
      await store.ports.db.write(async (tx) => {
        await tx.docs.update(row.id, {
          properties: { owner: ["local", "someone-else"], reviewer: "local", note: "local" },
        });
        await tx.docs.update(oldRow.id, { properties: { owner: ["local"] } });
        // Not a database row: "owner" is plain text.
        await tx.docs.update(page.id, { properties: { owner: "local" } });
      });
      const core = createFakeCore();
      const api = createApiClient({
        baseUrl: "http://core.test",
        token: () => "token-1",
        fetch: core.fetch,
      });
      const target = {
        api,
        userId: "user-1",
        workspaceId: "hosted-ws",
        teamspaceId: null,
        version: "2026-11-12",
      };
      const plan = await planHandoff({ store, workspaceId: ws }, target, { bodies: false });
      expect(await runHandoff(plan)).toMatchObject({ ok: true, rejected: [] });
      const created = (id: string) =>
        core.applied.find(
          (e) => e.operation === "doc.create" && (e.input as { id: string }).id === id,
        )?.input as { properties: Record<string, unknown> };
      expect(created(row.id).properties).toEqual({
        owner: ["user-1", "someone-else"],
        reviewer: "user-1",
        note: "local",
      });
      expect(created(oldRow.id).properties).toEqual({ owner: ["user-1"] });
      expect(created(page.id).properties).toEqual({ owner: "local" });
    });

    test("trashed properties and views arrive in the trash, ready to restore", async () => {
      const { store } = await openTestStore("local");
      const library = await createDoc(store, { workspaceId: ws, title: "Library" });
      const book = await createDoc(store, { workspaceId: ws, parentId: library.id, title: "Dune" });
      const gone = new Date().toISOString();
      const p = {
        name: testUuid(),
        status: testUuid(),
        oldStatus: testUuid(),
        notes: testUuid(),
        oldNotes: testUuid(),
        created: testUuid(),
      };
      const v = { table: testUuid(), board: testUuid() };
      await insertDatabase(store, {
        workspaceId: ws,
        id: library.id,
        properties: [
          { id: p.name, name: "Name", type: "title", key: "name" },
          // Deleted, then made again under the same key.
          { id: p.oldStatus, name: "Status", type: "text", key: "status", deletedAt: gone },
          { id: p.status, name: "Status", type: "select", key: "status" },
          // Two deleted properties under one key: they cannot be in one definition.
          { id: p.oldNotes, name: "Notes", type: "text", key: "notes", deletedAt: gone },
          { id: p.notes, name: "Notes", type: "text", key: "notes", deletedAt: gone },
          { id: p.created, name: "Created", type: "createdTime", key: "ctime", deletedAt: gone },
        ],
        views: [
          { id: v.table, name: "Table", type: "table" },
          { id: v.board, name: "Board", type: "board", deletedAt: gone },
        ],
      });
      await store.ports.db.write(async (tx) => {
        await tx.docs.update(book.id, { properties: { status: "Reading", notes: "kept" } });
      });
      const core = createFakeCore();
      const api = createApiClient({
        baseUrl: "http://core.test",
        token: () => "token-1",
        fetch: core.fetch,
      });
      const target = {
        api,
        userId: "user-1",
        workspaceId: "hosted-ws",
        teamspaceId: null,
        version: "2026-11-12",
      };
      const plan = await planHandoff({ store, workspaceId: ws }, target, { bodies: false });
      const result = await runHandoff(plan);
      expect(result).toMatchObject({ ok: true, rejected: [] });
      expect(result.applied).toBe(plan.summary.operations);
      for (const entry of core.applied) {
        const op = operations[entry.operation as keyof typeof operations];
        expect(op.input.safeParse(entry.input).success).toBe(true);
      }

      // The trashed parts come first, with the title (a definition needs it), in rounds whose keys
      // differ; the live definition after them moves them to the trash.
      const definitions = core.applied
        .filter((e) => e.operation === "database.setDefinition")
        .map((e) => {
          const { definition } = e.input as {
            definition: { properties: Array<{ id: string }>; views: Array<{ id: string }> };
          };
          return {
            properties: definition.properties.map((x) => x.id),
            views: definition.views.map((x) => x.id),
          };
        });
      expect(definitions).toEqual([
        { properties: [p.name, p.oldStatus, p.oldNotes, p.created], views: [v.board] },
        { properties: [p.name, p.notes], views: [] },
        { properties: [p.name, p.status], views: [v.table] },
      ]);
      const operationsInOrder = core.applied.map((e) => e.operation);
      expect(operationsInOrder.indexOf("database.create")).toBeLessThan(
        operationsInOrder.indexOf("database.setDefinition"),
      );
      // Their values stay in the rows, as in the source.
      const created = core.applied.find(
        (e) => e.operation === "doc.create" && (e.input as { id: string }).id === book.id,
      )!.input as { properties: Record<string, unknown> };
      expect(created.properties).toEqual({ status: "Reading", notes: "kept" });

      const again = await runHandoff(plan);
      expect(again).toMatchObject({ ok: true, applied: 0, duplicates: result.applied });
    });

    test("a resumed run after the documents were sent still sends the databases", async () => {
      const { core, plan, projects } = await withDatabases();
      const kv = new Map([[`lydie.handoff:local-ws:hosted-ws`, JSON.stringify(["documents"])]]);
      const result = await runHandoff(plan, {
        storage: {
          get: async (k) => kv.get(k) ?? null,
          set: async (k, v) => void kv.set(k, v),
          delete: async (k) => void kv.delete(k),
        },
      });
      expect(result).toMatchObject({ ok: true, rejected: [] });
      expect(core.applied.some((e) => e.operation === "doc.create")).toBe(false);
      expect(
        core.applied.some(
          (e) =>
            e.operation === "database.setDefinition" &&
            (e.input as { id: string }).id === projects.id,
        ),
      ).toBe(true);
    });
  });

  test("pushes bodies through collab once, and leaves a non-empty server copy alone", async () => {
    const { store, blob, child } = await source();
    const core = createFakeCore();
    const api = createApiClient({
      baseUrl: "http://core.test",
      token: () => "token-1",
      fetch: core.fetch,
    });
    const target = {
      api,
      userId: "user-1",
      workspaceId: "hosted-ws",
      teamspaceId: null,
      version: "2026-11-12",
    };
    const server = await startTestCollabServer();
    const pools: Array<ReturnType<typeof createCollab>> = [];
    const collab = () => {
      const pool = createCollab({
        token: async () => ({
          url: server.url,
          token: "user-1",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
        }),
        persistence: createMemoryYjsPersistence(),
        idleDisconnectMs: 0,
      });
      pools.push(pool);
      return pool;
    };
    const toYjs = (markdown: string) => {
      const doc = new Y.Doc();
      doc.getText("body").insert(0, markdown);
      return Y.encodeStateAsUpdate(doc);
    };
    try {
      const plan = await planHandoff({ store, workspaceId: "local-ws", blob }, target);
      const first = await runHandoff(plan, { bodies: { toYjs, collab: collab() } });
      expect(first.bodies).toEqual({ pushed: 1, skipped: 0, failed: [] });
      expect(await server.text(child.id)).toBe("See [[Top]]");
      const second = await runHandoff(plan, { bodies: { toYjs, collab: collab() } });
      expect(second.bodies).toEqual({ pushed: 0, skipped: 1, failed: [] });
      expect(await server.text(child.id)).toBe("See [[Top]]");
    } finally {
      for (const pool of pools) await pool.close();
      await server.stop();
    }
  });
});
