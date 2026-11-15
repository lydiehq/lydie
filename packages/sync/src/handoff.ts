// "Copy to cloud": copy a local workspace (the browser's private database, or a local database
// with no folder) into a hosted workspace, keeping ids, tree order, properties, links, databases,
// attachments and trash state. Then the window reopens in hosted scope.
//
// It is a bulk import expressed as operations, not a replay of the local operation log: the log
// is pruned as it uploads and does not describe documents the file bridge indexed. The plan is
// derived from the current state, and every operation id is derived from (target workspace,
// document, step), so running it again (after a crash, a closed tab, or a partial failure) sends
// the same ids and the server answers `duplicate` for whatever it already applied.
//
// One id changes: the Getting started page's id is derived from its workspace's id, so it takes
// the target's derived id (Home finds the page by it). Links to it are by title, so only its
// children's parent, its attachments and its own operations follow.
import { gettingStartedId, isStoredType, uuidFromBits } from "@lydie/contract";
import type { DatabaseConfig, DatabaseProperty, DatabaseView } from "@lydie/contract";
import { queries } from "@lydie/store";
import type { Store } from "@lydie/store";
import * as Y from "yjs";

import { sha256Hex } from "./attachments.ts";
import type { PutTransport, UploadTarget } from "./attachments.ts";
import { createCollab } from "./collab/collab.ts";
import type { Collab } from "./collab/collab.ts";
import { createMemoryYjsPersistence } from "./collab/persistence.ts";
import type { ApiClient } from "./http.ts";
import { formatScope } from "./session.ts";
import type { WindowScope } from "./session.ts";
import type { AppliedOperation, BlobPort, FetchLike, KeyValueStorage } from "./types.ts";
import { createUploader, MAX_BATCH } from "./upload.ts";
import type { RejectedChange } from "./upload.ts";

export type HandoffSource = {
  store: Pick<Store, "query" | "getDoc">;
  workspaceId: string;
  // Where the attachment bytes are.
  blob?: BlobPort;
};

export type HandoffTarget = {
  api: ApiClient;
  userId: string;
  workspaceId: string;
  // Teamspace for top-level pages; null puts them in the user's private section.
  teamspaceId: string | null;
  // The contract's API version (`LYDIE_VERSION`), recorded on each operation.
  version: string;
};

type SourceDoc = {
  id: string;
  parentId: string | null;
  title: string;
  sortKey: string;
  properties: Record<string, unknown>;
  createdAt: string;
  deletedAt: string | null;
  depth: number;
};

// A database (its document is in `docs`), with its live properties and views in order, and the
// ones in the trash.
type SourceDatabase = {
  id: string;
  config: DatabaseConfig;
  createdAt: string;
  // Set when it was turned back into a page (the definition stays for database.restore).
  deletedAt: string | null;
  properties: DatabaseProperty[];
  views: DatabaseView[];
  trashed: { properties: DatabaseProperty[]; views: DatabaseView[] };
};

type SourceAttachment = {
  id: string;
  documentId: string | null;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
  deletedAt: string | null;
};

export type HandoffSummary = {
  documents: number;
  // Documents in the trash (they arrive in the trash).
  trashed: number;
  // Documents with a body to copy.
  bodies: number;
  // Documents that are databases (their properties, views and settings come with them).
  databases: number;
  attachments: number;
  attachmentBytes: number;
  operations: number;
  // Ids already in the target workspace: an earlier, interrupted hand-off. They are skipped.
  existingInTarget: string[];
  // Ids used by another workspace you can see. These documents cannot be copied.
  conflicts: Array<{ id: string; title: string; workspaceId: string }>;
  // Attachments whose bytes are not on this device; their records are copied without the file.
  missingBytes: string[];
  warnings: string[];
};

export type HandoffPlan = {
  source: HandoffSource;
  target: HandoffTarget;
  summary: HandoffSummary;
  docs: SourceDoc[];
  databases: SourceDatabase[];
  attachments: SourceAttachment[];
  // The source's Getting started page (`from`) and the id it takes in the target (`to`), unless
  // the target already has a Getting started page of its own (decided by the run, `claim`).
  gettingStarted: { from: string; to: string } | null;
};

export type HandoffPhase = "documents" | "bodies" | "attachments" | "trash" | "done";

export type HandoffProgress = { phase: HandoffPhase; done: number; total: number };

export type HandoffBodies = {
  // Converts a stored Markdown body into the editor's Yjs document, as one update from a fresh
  // Y.Doc (y-prosemirror over the editor schema, field "default"). The app provides it; this
  // package may not import the Markdown engine or the editor.
  toYjs(markdown: string, docId: string): Uint8Array | Promise<Uint8Array>;
  // A collab pool for the target user. Default: a private one for the duration of the run.
  collab?: Collab;
};

export type HandoffOptions = {
  bodies?: HandoffBodies;
  // Remembers finished phases so a resumed run skips them (everything is idempotent anyway).
  storage?: KeyValueStorage;
  put?: PutTransport;
  onProgress?: (progress: HandoffProgress) => void;
  signal?: AbortSignal;
  // Per-document wait for a body to reach the server. Default 30 s.
  bodyTimeoutMs?: number;
};

export type HandoffResult = {
  // Open the next window with this scope.
  scope: WindowScope;
  ok: boolean;
  applied: number;
  duplicates: number;
  rejected: RejectedChange[];
  bodies: { pushed: number; skipped: number; failed: string[] };
  attachments: { uploaded: number; missing: string[]; failed: string[] };
  // Source ids that took another id in the target (the Getting started page), so the app can move
  // what it keeps per document on this device (favorites, recent pages).
  renamed: Record<string, string>;
};

// ---- Plan (the dry run)

export async function planHandoff(
  source: HandoffSource,
  target: HandoffTarget,
  options: { bodies?: boolean } = {},
): Promise<HandoffPlan> {
  const tree = await source.store.query(
    queries.listTree(source.workspaceId, { includeDeleted: true }),
  );
  const docs: SourceDoc[] = tree.map((d) => ({
    id: d.id,
    parentId: d.parentId,
    title: d.title,
    sortKey: d.sortKey,
    properties: d.properties,
    createdAt: d.createdAt,
    deletedAt: d.deletedAt,
    depth: d.depth,
  }));
  const attachments: SourceAttachment[] = (
    await source.store.query(queries.attachments(source.workspaceId, { includeDeleted: true }))
  )
    .map((a) => ({
      id: a.id,
      documentId: a.documentId,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      sha256: a.sha256,
      createdAt: a.createdAt,
      deletedAt: a.deletedAt,
    }))
    // Oldest first, so ids and order match the source.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let bodies = 0;
  const databases: SourceDatabase[] = [];
  for (const doc of docs) {
    const found = await source.store.getDoc(doc.id, { includeBody: true });
    if (found?.body?.markdown) bodies++;
    const [database] = await source.store.query(queries.database(doc.id));
    if (!database) continue;
    const properties = await source.store.query(
      queries.databaseProperties(doc.id, { includeDeleted: true }),
    );
    const views = await source.store.query(queries.databaseViews(doc.id, { includeDeleted: true }));
    databases.push({
      id: database.id,
      config: database.config,
      createdAt: database.createdAt,
      deletedAt: database.deletedAt,
      properties: properties.filter((p) => !p.deletedAt),
      views: views.filter((v) => !v.deletedAt),
      trashed: {
        // The title property is never in the trash (and a definition holds only one).
        properties: properties.filter((p) => p.deletedAt && p.type !== "title"),
        views: views.filter((v) => v.deletedAt),
      },
    });
  }

  // Ids already on the server, in the target or elsewhere.
  const ids = new Set(docs.map((d) => d.id));
  const from = gettingStartedId(source.workspaceId);
  const to = gettingStartedId(target.workspaceId);
  let toInTarget = false;
  const existingInTarget: string[] = [];
  const conflicts: HandoffSummary["conflicts"] = [];
  const { workspaces } = await target.api.get<{ workspaces: Array<{ id: string }> }>(
    "/v1/workspaces",
  );
  for (const workspace of workspaces) {
    const { entries } = await target.api.get<{ entries: Array<{ id: string; title: string }> }>(
      `/v1/workspaces/${encodeURIComponent(workspace.id)}/tree?includeDeleted=true`,
    );
    for (const entry of entries) {
      if (workspace.id === target.workspaceId && entry.id === to) toInTarget = true;
      if (!ids.has(entry.id)) continue;
      if (workspace.id === target.workspaceId) existingInTarget.push(entry.id);
      else conflicts.push({ id: entry.id, title: entry.title, workspaceId: workspace.id });
    }
  }
  const gettingStarted =
    from !== to && ids.has(from) && !conflicts.some((c) => c.id === from) ? { from, to } : null;
  // Only a guess for the summary: with other pages already copied, the target's page is most
  // likely this one, renamed by the earlier attempt.
  if (gettingStarted && toInTarget && existingInTarget.length > 0) existingInTarget.push(from);

  const missingBytes: string[] = [];
  if (source.blob) {
    for (const a of attachments) {
      const has = source.blob.has
        ? await source.blob.has(a.sha256)
        : (await source.blob.get(a.sha256)) !== null;
      if (!has) missingBytes.push(a.id);
    }
  } else {
    missingBytes.push(...attachments.map((a) => a.id));
  }

  const warnings: string[] = [];
  if (bodies > 0 && options.bodies === false) {
    warnings.push(
      `${bodies} document bodies cannot be copied without a Markdown → Yjs converter; ` +
        "only titles, properties and links will arrive.",
    );
  }
  if (missingBytes.length > 0) {
    warnings.push(`${missingBytes.length} attachment file(s) are not on this device.`);
  }
  if (conflicts.length > 0) {
    warnings.push(`${conflicts.length} document id(s) are already used in another workspace.`);
  }

  const trashed = docs.filter((d) => d.deletedAt !== null).length;
  const summary: HandoffSummary = {
    documents: docs.length,
    trashed,
    bodies,
    databases: databases.length,
    attachments: attachments.length,
    attachmentBytes: attachments.reduce((sum, a) => sum + a.size, 0),
    operations:
      docs.length +
      databaseSteps(databases, docs) +
      databases.filter((d) => d.deletedAt !== null).length +
      trashRoots(docs).length +
      attachments.length +
      attachments.filter((a) => a.deletedAt !== null).length,
    existingInTarget,
    conflicts,
    missingBytes,
    warnings,
  };
  return { source, target, summary, docs, databases, attachments, gettingStarted };
}

// Rows per database.setValues of relation values.
const RELATION_BATCH = 1000;

// Who a local workspace runs as (the browser's runtime, the file bridge), and so the person its
// person picker offers as "Me". It matches no one in a hosted workspace.
const LOCAL_USER_ID = "local";

// Person properties by frontmatter key, of every database (one turned back into a page gets its
// values back with database.restore), live or in the trash (restoring one brings its values back).
function peopleOf(database: SourceDatabase): Set<string> {
  return new Set(
    [...database.properties, ...database.trashed.properties]
      .filter((p) => p.type === "person")
      .map((p) => p.key),
  );
}

// Where a property's value lives; a definition may not use one twice (the runtime's check in
// database.setDefinition).
function slotOf(p: DatabaseProperty): string {
  if (isStoredType(p.type)) return `note.${p.key}`;
  if (p.type === "title" || p.type === "createdTime" || p.type === "updatedTime") {
    return `file.${p.type}`;
  }
  return `formula.${p.key}`;
}

// The trashed properties and views as definitions sent before the live one, which then moves them
// to the trash (database.setDefinition deletes live ones it does not list). With the title, as a
// definition needs it; in more than one round when trashed properties share a slot (a key deleted
// twice). Empty when nothing is in the trash.
function trashedRounds(
  database: SourceDatabase,
): Array<{ properties: DatabaseProperty[]; views: DatabaseView[] }> {
  const { properties, views } = database.trashed;
  const title = database.properties.find((p) => p.type === "title");
  if (!title || (properties.length === 0 && views.length === 0)) return [];
  const rounds: Array<{ slots: Set<string>; properties: DatabaseProperty[] }> = [];
  for (const p of properties) {
    let round = rounds.find((r) => !r.slots.has(slotOf(p)));
    if (!round) rounds.push((round = { slots: new Set([slotOf(title)]), properties: [] }));
    round.slots.add(slotOf(p));
    round.properties.push(p);
  }
  if (rounds.length === 0) rounds.push({ slots: new Set(), properties: [] });
  return rounds.map((r, i) => ({
    properties: [title, ...r.properties],
    views: i === 0 ? views : [],
  }));
}

// Live relation properties by frontmatter key, of a database that is not turned back into a page
// (the runtime indexes relation values as links only for those).
function relationsOf(database: SourceDatabase): Map<string, DatabaseProperty> {
  if (database.deletedAt) return new Map();
  return new Map(database.properties.filter((p) => p.type === "relation").map((p) => [p.key, p]));
}

// The rows' relation values, by property id.
function relationUpdates(
  database: SourceDatabase,
  docs: readonly SourceDoc[],
): Array<{ rowId: string; set: Record<string, unknown> }> {
  const relations = relationsOf(database);
  if (relations.size === 0) return [];
  const updates: Array<{ rowId: string; set: Record<string, unknown> }> = [];
  for (const doc of docs) {
    if (doc.parentId !== database.id) continue;
    const set: Record<string, unknown> = {};
    for (const [key, p] of relations) {
      const value = doc.properties[key];
      if (value !== undefined && value !== null) set[p.id] = value;
    }
    if (Object.keys(set).length > 0) updates.push({ rowId: doc.id, set });
  }
  return updates;
}

// Operations of the databases step: create and define each (its trash first), then its relation
// values.
function databaseSteps(databases: readonly SourceDatabase[], docs: readonly SourceDoc[]): number {
  return databases.reduce(
    (sum, d) =>
      sum +
      2 +
      trashedRounds(d).length +
      Math.ceil(relationUpdates(d, docs).length / RELATION_BATCH),
    0,
  );
}

// Deleted documents whose parent is not deleted: deleting them cascades to the rest.
function trashRoots(docs: readonly SourceDoc[]): SourceDoc[] {
  const deleted = new Set(docs.filter((d) => d.deletedAt).map((d) => d.id));
  return docs.filter((d) => d.deletedAt && !(d.parentId && deleted.has(d.parentId)));
}

// ---- Run

export async function runHandoff(
  plan: HandoffPlan,
  options: HandoffOptions = {},
): Promise<HandoffResult> {
  const { source, target } = plan;
  const conflictIds = new Set(plan.summary.conflicts.map((c) => c.id));
  const docs = plan.docs.filter((d) => !conflictIds.has(d.id));
  const databases = plan.databases.filter((d) => !conflictIds.has(d.id));
  const checkpointKey = `lydie.handoff:${source.workspaceId}:${target.workspaceId}`;
  // Databases are a step of their own (a resumed run must not skip them), reported as part of
  // "documents".
  type Step = HandoffPhase | "databases";
  const finished = new Set<Step>(
    JSON.parse((await options.storage?.get(checkpointKey)) ?? "[]") as Step[],
  );
  const finish = async (phase: Step) => {
    finished.add(phase);
    await options.storage?.set(checkpointKey, JSON.stringify([...finished]));
  };
  const progress = (phase: HandoffPhase, done: number, total: number) =>
    options.onProgress?.({ phase, done, total });

  const result: HandoffResult = {
    scope: Object.freeze({ kind: "hosted", workspaceId: target.workspaceId }),
    ok: true,
    applied: 0,
    duplicates: 0,
    rejected: [],
    bodies: { pushed: 0, skipped: 0, failed: [] },
    attachments: { uploaded: 0, missing: [], failed: [] },
    renamed: {},
  };

  const op = (
    key: string,
    time: string,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<AppliedOperation> =>
    deterministicUuid(`${target.workspaceId}:${key}`, time).then((id) => ({
      id,
      operation,
      input,
      actor: { type: "user", id: target.userId },
      sessionId: null,
      workspaceId: target.workspaceId,
      createdAt: new Date().toISOString(),
      version: target.version,
    }));

  // `part`: where these entries sit in a phase sent in several parts.
  async function send(
    phase: HandoffPhase,
    entries: AppliedOperation[],
    part = { done: 0, total: entries.length },
  ) {
    let queue = entries;
    progress(phase, part.done, part.total);
    await createUploader({
      api: target.api,
      oplog: {
        list: async ({ limit } = {}) => queue.slice(0, limit ?? MAX_BATCH),
        remove: async (ids) => {
          const gone = new Set(ids);
          queue = queue.filter((e) => !gone.has(e.id));
        },
      },
      onResults(results) {
        for (const r of results) {
          if (r.status === "applied" && r.duplicate) result.duplicates++;
          else if (r.status === "applied") result.applied++;
        }
      },
      onRejected: (changes) => result.rejected.push(...changes),
      onProgress: () => progress(phase, part.done + entries.length - queue.length, part.total),
    }).drain(options.signal);
  }

  // The Getting started page's id in the target, once decided (`claim`).
  let renamed: { from: string; to: string } | null = null;
  const idOf = (id: string) => (renamed && id === renamed.from ? renamed.to : id);

  // Relation values are set after the databases (step 2), when the core can index them as links.
  const relationKeys = new Map(
    databases.map((d) => [d.id, new Set(relationsOf(d).keys())] as const),
  );

  // The local user in person values is the user doing the hand-off.
  const personKeys = new Map(databases.map((d) => [d.id, peopleOf(d)] as const));
  const asTargetUser = (value: unknown) =>
    value === LOCAL_USER_ID
      ? target.userId
      : Array.isArray(value)
        ? value.map((v) => (v === LOCAL_USER_ID ? target.userId : v))
        : value;

  async function create(doc: SourceDoc): Promise<AppliedOperation> {
    const found = await source.store.getDoc(doc.id, { includeBody: true });
    const id = idOf(doc.id);
    const later = doc.parentId ? relationKeys.get(doc.parentId) : undefined;
    const people = doc.parentId ? personKeys.get(doc.parentId) : undefined;
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc.properties)) {
      if (later?.has(key)) continue;
      properties[key] = people?.has(key) ? asTargetUser(value) : value;
    }
    const input: Record<string, unknown> = {
      workspaceId: target.workspaceId,
      id,
      parentId: doc.parentId && idOf(doc.parentId),
      title: doc.title,
      properties,
      sortKey: doc.sortKey,
    };
    // The server derives links from the Markdown (and keeps the body once it can convert it).
    if (found?.body?.markdown) input.markdown = found.body.markdown;
    if (doc.parentId === null) input.teamspaceId = target.teamspaceId;
    return op(`${id}:create`, doc.createdAt, "doc.create", input);
  }

  // Creates the Getting started page under the target's derived id, on its own. A target that
  // already has a Getting started page of its own refuses it; then the page keeps its id (and Home
  // shows the target's). The server keeps each operation's first outcome, so a resumed run, which
  // sends the same operation, decides the same way.
  async function claim(
    gettingStarted: { from: string; to: string },
    doc: SourceDoc,
  ): Promise<boolean> {
    renamed = gettingStarted;
    let queue = [await create(doc)];
    let ok = false;
    await createUploader({
      api: target.api,
      oplog: {
        list: async () => queue,
        remove: async () => {
          queue = [];
        },
      },
      onResults([r]) {
        ok = r?.status === "applied";
        if (ok && r?.duplicate) result.duplicates++;
        else if (ok) result.applied++;
      },
    }).drain(options.signal);
    if (ok) result.renamed[gettingStarted.from] = gettingStarted.to;
    else renamed = null;
    return ok;
  }

  // 1. Documents, parents first, in tree order with their sort keys. The Getting started page's
  //    id is decided once its parents are there, before its children are sent.
  const gettingStarted = plan.gettingStarted;
  const at = gettingStarted ? docs.findIndex((d) => d.id === gettingStarted.from) : -1;
  const total = docs.length + databaseSteps(databases, docs);
  if (!finished.has("documents")) {
    const before = at < 0 ? docs : docs.slice(0, at);
    const creates: AppliedOperation[] = [];
    for (const doc of before) creates.push(await create(doc));
    await send("documents", creates, { done: 0, total });
    if (at >= 0) {
      const claimed = await claim(gettingStarted!, docs[at]!);
      const after: AppliedOperation[] = [];
      // Refused: the page goes with the rest under its own id.
      for (const doc of docs.slice(claimed ? at + 1 : at)) after.push(await create(doc));
      await send("documents", after, { done: docs.length - after.length, total });
    }
    await finish("documents");
  } else if (at >= 0) {
    await claim(gettingStarted!, docs[at]!);
  }

  // A property or view as database.setDefinition takes it, pointing at the target's ids.
  const propertyInput = ({ id, name, type, key, config }: DatabaseProperty) => ({
    id,
    name,
    type,
    key,
    config: config.relation
      ? {
          ...config,
          relation: { ...config.relation, databaseId: idOf(config.relation.databaseId) },
        }
      : config,
  });
  const viewInput = ({ id, name, type, config }: DatabaseView) => ({ id, name, type, config });

  // 2. Databases, once their documents and rows exist: each document becomes a database with the
  //    source's title property and first view, then takes the whole definition (properties,
  //    options, views, settings; ids kept). Trashed properties and views are defined just before,
  //    so the live definition moves them to the trash, where they can be restored. Relation values
  //    last, once every database exists, so the core indexes them as links; `exact`, since both
  //    sides are copied as they are.
  if (!finished.has("databases")) {
    const steps: AppliedOperation[] = [];
    for (const d of databases) {
      const id = idOf(d.id);
      const title = d.properties.find((p) => p.type === "title");
      steps.push(
        await op(`${id}:database`, d.createdAt, "database.create", {
          workspaceId: target.workspaceId,
          documentId: id,
          ...(title ? { titlePropertyId: title.id } : {}),
          ...(d.views[0] ? { viewId: d.views[0].id } : {}),
        }),
      );
    }
    for (const d of databases) {
      const id = idOf(d.id);
      for (const [i, round] of trashedRounds(d).entries()) {
        steps.push(
          await op(`${id}:trashed-definition:${i}`, d.createdAt, "database.setDefinition", {
            id,
            definition: {
              config: d.config,
              properties: round.properties.map(propertyInput),
              views: round.views.map(viewInput),
            },
          }),
        );
      }
      steps.push(
        await op(`${id}:definition`, d.createdAt, "database.setDefinition", {
          id,
          definition: {
            config: d.config,
            properties: d.properties.map(propertyInput),
            views: d.views.map(viewInput),
          },
        }),
      );
    }
    for (const d of databases) {
      const id = idOf(d.id);
      const updates = relationUpdates(d, docs).map(({ rowId, set }) => ({
        rowId: idOf(rowId),
        set: Object.fromEntries(
          Object.entries(set).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.map((x) => (typeof x === "string" ? idOf(x) : x)) : v,
          ]),
        ),
      }));
      for (let i = 0; i < updates.length; i += RELATION_BATCH) {
        steps.push(
          await op(`${id}:relations:${i / RELATION_BATCH}`, d.createdAt, "database.setValues", {
            databaseId: id,
            updates: updates.slice(i, i + RELATION_BATCH),
            exact: true,
          }),
        );
      }
    }
    await send("documents", steps, { done: total - steps.length, total });
    await finish("databases");
  }

  // 3. Bodies through collab, before anything goes to the trash (trashed pages are read-only).
  if (!finished.has("bodies") && options.bodies) {
    const collab =
      options.bodies.collab ??
      createCollab({
        api: target.api,
        persistence: createMemoryYjsPersistence(),
        idleDisconnectMs: 0,
      });
    const withBodies: Array<{ id: string; markdown: string }> = [];
    for (const doc of docs) {
      const found = await source.store.getDoc(doc.id, { includeBody: true });
      if (found?.body?.markdown) withBodies.push({ id: doc.id, markdown: found.body.markdown });
    }
    progress("bodies", 0, withBodies.length);
    let done = 0;
    try {
      for (const { id, markdown } of withBodies) {
        options.signal?.throwIfAborted();
        const handle = collab.open(idOf(id));
        try {
          await handle.loaded;
          await handle.whenSynced(options.bodyTimeoutMs ?? 30_000);
          // Anything already there (an earlier run, or a server-side import) wins: applying a
          // fresh conversion twice would duplicate the text.
          if (handle.ydoc.store.clients.size > 0) {
            result.bodies.skipped++;
          } else {
            Y.applyUpdate(handle.ydoc, await options.bodies.toYjs(markdown, id));
            await handle.whenSynced(options.bodyTimeoutMs ?? 30_000);
            result.bodies.pushed++;
          }
        } catch {
          result.bodies.failed.push(idOf(id));
        } finally {
          handle.release();
        }
        progress("bodies", ++done, withBodies.length);
      }
    } finally {
      if (!options.bodies.collab) await collab.close();
    }
    if (result.bodies.failed.length === 0) await finish("bodies");
  }

  // 4. Attachments: bytes first (content-addressed, so a re-run uploads nothing twice), then the
  //    record with its original id.
  if (!finished.has("attachments")) {
    const creates: AppliedOperation[] = [];
    const docIds = new Set(docs.map((d) => d.id));
    let done = 0;
    progress("attachments", 0, plan.attachments.length);
    for (const a of plan.attachments) {
      options.signal?.throwIfAborted();
      if (a.documentId && !docIds.has(a.documentId)) continue;
      const data = source.blob ? await source.blob.get(a.sha256) : null;
      if (!data) {
        result.attachments.missing.push(a.id);
      } else {
        try {
          const { upload } = await target.api.post<{ upload: UploadTarget | null }>(
            "/v1/attachments/uploads",
            {
              workspaceId: target.workspaceId,
              documentId: a.documentId && idOf(a.documentId),
              contentType: a.contentType,
              size: a.size,
              sha256: a.sha256,
            },
          );
          if (upload) {
            await (options.put ?? fetchPut(target.api.fetch))(
              upload,
              data,
              () => {},
              options.signal,
            );
          }
          result.attachments.uploaded++;
        } catch {
          result.attachments.failed.push(a.id);
          continue;
        }
      }
      creates.push(
        await op(`${a.id}:attach`, a.createdAt, "attachment.create", {
          workspaceId: target.workspaceId,
          id: a.id,
          documentId: a.documentId && idOf(a.documentId),
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          sha256: a.sha256,
        }),
      );
      progress("attachments", ++done, plan.attachments.length);
    }
    await send("attachments", creates);
    if (result.attachments.failed.length === 0) await finish("attachments");
  }

  // 5. Trash state, last: trashed documents (their live descendants follow), databases turned back
  //    into pages, trashed attachments.
  if (!finished.has("trash")) {
    const deletes: AppliedOperation[] = [];
    for (const doc of trashRoots(docs)) {
      const id = idOf(doc.id);
      deletes.push(await op(`${id}:delete`, doc.deletedAt!, "doc.delete", { id }));
    }
    for (const d of databases) {
      if (!d.deletedAt) continue;
      const id = idOf(d.id);
      deletes.push(await op(`${id}:undatabase`, d.deletedAt, "database.delete", { id }));
    }
    for (const a of plan.attachments) {
      if (!a.deletedAt || result.attachments.failed.includes(a.id)) continue;
      deletes.push(await op(`${a.id}:delete`, a.deletedAt, "attachment.delete", { id: a.id }));
    }
    await send("trash", deletes);
    await finish("trash");
  }

  result.ok =
    result.rejected.length === 0 &&
    result.bodies.failed.length === 0 &&
    result.attachments.failed.length === 0;
  if (result.ok) {
    await finish("done");
    await options.storage?.delete(checkpointKey);
  }
  progress("done", 1, 1);
  return result;
}

export function handoffScope(target: { workspaceId: string }): string {
  return formatScope({ kind: "hosted", workspaceId: target.workspaceId });
}

const fetchPut =
  (fetchImpl: FetchLike): PutTransport =>
  async (target, data, onProgress, signal) => {
    const response = await fetchImpl(target.url, {
      method: target.method,
      headers: target.headers,
      body: data as Uint8Array<ArrayBuffer>,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    onProgress(data.byteLength, data.byteLength);
  };

// An id that is the same every time for the same key: the time part from `time` (so operations
// sort near when the change happened), the rest from SHA-256(key).
export async function deterministicUuid(key: string, time: string): Promise<string> {
  let ms = Date.parse(time);
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const hash = await sha256Hex(new TextEncoder().encode(key));
  return uuidFromBits((BigInt(Math.floor(ms)) << 80n) | BigInt(`0x${hash.slice(0, 20)}`));
}
