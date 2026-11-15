// Real stores for tests (Node driver, temp files). Writes go through the store's ports the way
// @lydie/runtime does it: the rows and the operation-log entry in one transaction.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ViewConfig } from "@lydie/contract";
import type {
  DatabaseConfig,
  DatabaseProperty,
  DatabaseView,
  ViewConfigInput,
} from "@lydie/contract";
import type { Store } from "@lydie/store";
import { openNodeStore } from "@lydie/store/node";

import type { AppliedOperation } from "../src/types.ts";
import { makeOp, testUuid } from "./fake-core.ts";

const opened: Array<{ store: Store; dir: string }> = [];

export async function openTestStore(
  mode: "local" | "synced" = "synced",
  dir = mkdtempSync(join(tmpdir(), "lydie-sync-")),
): Promise<{ store: Store; dir: string; path: string }> {
  const path = join(dir, "db.sqlite");
  const store = await openNodeStore({ path, mode });
  opened.push({ store, dir });
  return { store, dir, path };
}

export async function closeTestStores(options: { keepDirs?: boolean } = {}) {
  for (const { store, dir } of opened.splice(0)) {
    await store.close().catch(() => {});
    if (!options.keepDirs) rmSync(dir, { recursive: true, force: true });
  }
}

type DocInput = {
  workspaceId: string;
  id?: string;
  parentId?: string | null;
  title: string;
  // Hosted: the space a top-level page goes into, as the UI passes it to doc.create.
  teamspaceId?: string | null;
};

// doc.create, applied locally and queued (what the runtime would record).
export async function createDoc(
  store: Store,
  input: DocInput,
  userId = "user-1",
): Promise<{ id: string; entry: AppliedOperation }> {
  const id = input.id ?? testUuid();
  const now = new Date().toISOString();
  const entry = makeOp(
    "doc.create",
    {
      workspaceId: input.workspaceId,
      id,
      parentId: input.parentId ?? null,
      title: input.title,
      properties: {},
      ...(input.teamspaceId !== undefined ? { teamspaceId: input.teamspaceId } : {}),
    },
    userId,
  );
  await store.ports.db.write(async (tx) => {
    await tx.docs.insert({
      id,
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      sortKey: "a0",
      properties: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: userId,
      updatedBy: userId,
    });
    await tx.oplog.append(entry);
  });
  return { id, entry };
}

type DatabaseInput = {
  workspaceId: string;
  // The database's document (create it first).
  id: string;
  config?: Partial<DatabaseConfig>;
  deletedAt?: string | null;
  // In order; `deletedAt` puts one in the trash.
  properties: Array<
    Pick<DatabaseProperty, "id" | "name" | "type" | "key"> & {
      config?: DatabaseProperty["config"];
      deletedAt?: string | null;
    }
  >;
  views: Array<
    Pick<DatabaseView, "id" | "name" | "type"> & {
      config?: ViewConfigInput;
      deletedAt?: string | null;
    }
  >;
};

// Turns a document into a database with this schema and these views, written straight to the
// tables (what a local runtime leaves behind; not queued).
export async function insertDatabase(store: Store, input: DatabaseInput) {
  const at = new Date().toISOString();
  const base = {
    workspaceId: input.workspaceId,
    databaseId: input.id,
    createdAt: at,
    updatedAt: at,
  };
  const key = (i: number) => `a${String.fromCharCode(48 + i)}`;
  await store.ports.db.write(async (tx) => {
    const dbs = tx.databases!;
    await dbs.insert({
      id: input.id,
      workspaceId: input.workspaceId,
      config: { filter: null, templateIds: [], extra: {}, ...input.config },
      createdAt: at,
      updatedAt: at,
      deletedAt: input.deletedAt ?? null,
    });
    for (const [i, p] of input.properties.entries()) {
      await dbs.insertProperty({
        ...base,
        ...p,
        config: p.config ?? {},
        sortKey: key(i),
        deletedAt: p.deletedAt ?? null,
      });
    }
    for (const [i, v] of input.views.entries()) {
      await dbs.insertView({
        ...base,
        ...v,
        config: ViewConfig.parse(v.config ?? {}),
        sortKey: key(i),
        deletedAt: v.deletedAt ?? null,
      });
    }
  });
}

export async function renameDoc(store: Store, id: string, title: string, userId = "user-1") {
  const entry = await withWorkspace(store, makeOp("doc.rename", { id, title }, userId));
  await store.ports.db.write(async (tx) => {
    await tx.docs.update(id, { title, updatedAt: new Date().toISOString(), updatedBy: userId });
    await tx.oplog.append(entry);
  });
  return entry;
}

export async function crudCount(store: Store): Promise<number> {
  return (await store.db.getUploadQueueStats()).count;
}

export async function moveDoc(
  store: Store,
  id: string,
  parentId: string | null,
  userId = "user-1",
) {
  const entry = await withWorkspace(store, makeOp("doc.move", { id, parentId }, userId));
  await store.ports.db.write(async (tx) => {
    await tx.docs.update(id, { parentId, updatedAt: new Date().toISOString(), updatedBy: userId });
    await tx.oplog.append(entry);
  });
  return entry;
}

export async function trashDoc(store: Store, id: string, userId = "user-1") {
  const entry = await withWorkspace(store, makeOp("doc.delete", { id }, userId));
  const now = new Date().toISOString();
  await store.ports.db.write(async (tx) => {
    await tx.docs.update(id, { deletedAt: now, updatedAt: now, updatedBy: userId });
    await tx.oplog.append(entry);
  });
  return entry;
}

// The runtime records the document's workspace on every entry.
async function withWorkspace(store: Store, entry: AppliedOperation) {
  const id = (entry.input as { id: string }).id;
  const found = await store.getDoc(id, { includeBody: false });
  return { ...entry, workspaceId: found?.document.workspaceId ?? null };
}
