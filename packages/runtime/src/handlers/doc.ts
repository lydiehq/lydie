import { isUuid, LydieError } from "@lydie/contract";
import type { Attachment, Document, Operations, Properties, Warning } from "@lydie/contract";

import { isRelativeLink, resolveLinks, targetKey } from "../links.ts";
import type { DbRead, DbTx, DocPatch, LinkRow } from "../ports.ts";
import { placeKey } from "../position.ts";
import { bodyLinkRows, cachedRelationKeys, propertyLinks } from "../property-links.ts";
import type { Handlers, MutationContext } from "../runtime.ts";
import { applyEdits, bodyVersion, linkKey } from "../text.ts";
import type { Extracted, ExtractedLink } from "../text.ts";
import { openThreads } from "./thread.ts";

export async function requireDoc(tx: DbRead, id: string): Promise<Document> {
  const doc = await tx.docs.get(id);
  if (!doc) throw new LydieError("not_found", `Document ${id} not found`);
  return doc;
}

export async function requireLive(tx: DbRead, id: string): Promise<Document> {
  const doc = await requireDoc(tx, id);
  if (doc.deletedAt) {
    throw new LydieError("not_found", `Document ${id} is in the trash`, {
      hint: "Restore it with doc.restore first.",
    });
  }
  return doc;
}

async function requireParent(tx: DbRead, workspaceId: string, parentId: string): Promise<void> {
  const parent = await requireLive(tx, parentId);
  if (parent.workspaceId !== workspaceId) {
    throw new LydieError("invalid_input", `Parent ${parentId} is in another workspace`);
  }
}

export function unsupported(what: string): never {
  throw new LydieError("internal", `${what} is not supported by this backend`);
}

// Stable key of a link as written, to carry its resolution over when the body is re-extracted.
const writtenAs = (l: {
  kind: string;
  syntax?: string | undefined;
  targetRef: string;
  sourceProperty?: string | null | undefined;
}) => `${l.kind}\u0000${l.syntax ?? ""}\u0000${l.targetRef}\u0000${l.sourceProperty ?? ""}`;

// Rebuilds a document's link rows: its body links (`body`, freshly extracted; null keeps the
// stored ones) and the links in its properties ([[links]], relation values). `fresh`: the
// document was created in this transaction and has no link rows yet.
export async function indexLinks(
  ctx: MutationContext,
  doc: Document,
  body: readonly ExtractedLink[] | null,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<void> {
  if (body === null && !ctx.tx.links.from) return;
  const existing = fresh ? [] : ((await ctx.tx.links.from?.(doc.id)) ?? []);
  // A link keeps pointing at the document it resolved to before (by id) while that document is
  // live, even if its title no longer matches: renames never silently break links. The file bridge
  // rewrites the link text on rename, as Obsidian does. So a link written as before, whose target
  // is still live, keeps it without being resolved again (a typing save resolves nothing).
  const previous = new Map<string, string>();
  for (const link of existing) if (link.targetId) previous.set(writtenAs(link), link.targetId);
  const live = new Set<string>();
  if (previous.size > 0) {
    const ids = [...new Set(previous.values())];
    const docs = ctx.tx.docs.getMany
      ? await ctx.tx.docs.getMany(ids)
      : await Promise.all(ids.map((id) => ctx.tx.docs.get(id)));
    for (const d of docs) if (d && !d.deletedAt) live.add(d.id);
  }
  const wanted: { link: ExtractedLink; property: string | null; kept: string | undefined }[] = [];
  const want = (link: ExtractedLink, property: string | null) => {
    const before = previous.get(
      writtenAs({
        kind: link.kind,
        syntax: link.syntax,
        targetRef: link.target,
        sourceProperty: property,
      }),
    );
    wanted.push({ link, property, kept: before && live.has(before) ? before : undefined });
  };
  for (const link of body ?? []) want(link, null);
  for (const link of propertyLinks(doc.properties, await cachedRelationKeys(ctx.tx, doc))) {
    want(link, link.property);
  }
  // Relative links follow the source's folder, which may have changed: those always resolve.
  const unresolved = wanted.filter((w) => !w.kept || isRelativeLink(w.link));
  const resolved = await resolveLinks(
    ctx.tx,
    doc,
    unresolved.map((w) => w.link),
  );
  const targets = new Map(unresolved.map((w, i) => [w, resolved[i] ?? null]));
  const rows: LinkRow[] = body === null ? bodyLinkRows(existing) : [];
  for (const w of wanted) {
    const { link, property } = w;
    rows.push({
      id: ctx.ids.uuid(),
      workspaceId: doc.workspaceId,
      sourceId: doc.id,
      sourceBlockId: link.sourceBlockId,
      targetId: targets.get(w) ?? w.kept ?? null,
      targetRef: link.target,
      targetKey: targetKey(link.target),
      targetHeading: link.heading,
      targetBlockId: link.blockId,
      kind: link.kind,
      syntax: link.syntax,
      sourceProperty: property,
    });
  }
  if (fresh) {
    if (rows.length > 0) await ctx.tx.links.replaceFrom(doc.id, rows, { fresh });
    return;
  }
  // Most body saves (typing) leave the links as they were: writing them again would only wake
  // every live query that reads links (backlinks, outgoing links).
  if (ctx.tx.links.from && sameLinks(existing, rows)) return;
  await ctx.tx.links.replaceFrom(doc.id, rows);
}

function linkTuple(l: LinkRow): string {
  return JSON.stringify([
    l.workspaceId,
    l.targetId ?? null,
    l.targetRef,
    l.targetKey,
    l.targetHeading ?? null,
    l.targetBlockId ?? null,
    l.sourceBlockId ?? null,
    l.kind,
    l.syntax ?? null,
    l.sourceProperty ?? null,
  ]);
}

// The same links (ids aside), as multisets.
function sameLinks(a: readonly LinkRow[], b: readonly LinkRow[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(linkTuple).sort();
  const right = b.map(linkTuple).sort();
  return left.every((x, i) => x === right[i]);
}

// Whether properties can hold links at all (cheap check before touching the database).
function mayLink(properties: Properties): boolean {
  return Object.values(properties).some((v) =>
    (Array.isArray(v) ? v : [v]).some(
      (item) => typeof item === "string" && (item.includes("[[") || isUuid(item)),
    ),
  );
}

// After a document's properties changed: rebuilds its links if its property links differ.
export async function relinkProperties(
  ctx: MutationContext,
  doc: Document,
  before: Properties,
): Promise<void> {
  // Only the properties that changed matter: setting a status on a row that also holds relations
  // must not cost any reads.
  const changed = new Set(
    [...Object.keys(before), ...Object.keys(doc.properties)].filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(doc.properties[k]),
    ),
  );
  const pick = (p: Properties) =>
    Object.fromEntries(Object.entries(p).filter(([k]) => changed.has(k)));
  if (!mayLink(pick(doc.properties)) && !mayLink(pick(before))) return;
  const keys = await cachedRelationKeys(ctx.tx, doc);
  const now = propertyLinks(doc.properties, keys);
  if (JSON.stringify(now) === JSON.stringify(propertyLinks(before, keys))) return;
  await indexLinks(ctx, doc, null);
}

// A body save marks the document edited (updatedAt, updatedBy) at most once a minute per author:
// stamping every save of a burst of typing would rewrite the document row each time, waking every
// live query that reads documents. Another author's save stamps at once.
const BODY_STAMP_MS = 60_000;

function bodyStamp(
  ctx: MutationContext,
  doc: Document,
): { updatedAt: string; updatedBy: string } | null {
  const age = Date.parse(ctx.now) - Date.parse(doc.updatedAt);
  if (doc.updatedBy === ctx.actorRef && age >= 0 && age < BODY_STAMP_MS) return null;
  return { updatedAt: ctx.now, updatedBy: ctx.actorRef };
}

// `previous` is the body being replaced (null: the document had none), for version history.
// `fresh`: the document was created in this transaction (nothing derived from a body exists yet).
async function writeBody(
  ctx: MutationContext,
  doc: Document,
  markdown: string,
  previous: string | null,
  { restoredFrom, fresh = false }: { restoredFrom?: string; fresh?: boolean } = {},
): Promise<string> {
  const version = bodyVersion(markdown);
  const options = fresh ? { fresh } : undefined;
  await ctx.tx.bodies.put(doc.id, doc.workspaceId, { markdown, version }, ctx.now, options);
  await indexBody(ctx, doc, ctx.extract(markdown), options);
  ctx.emit("doc.bodyUpdated", doc.workspaceId, { id: doc.id, version }, { title: doc.title });
  const versions = ctx.versions;
  if (versions?.record) {
    const change = {
      documentId: doc.id,
      workspaceId: doc.workspaceId,
      before: previous,
      after: markdown,
      actor: ctx.actorRef,
      at: ctx.now,
      ...(restoredFrom ? { restoredFrom } : {}),
    };
    ctx.afterCommit(() => versions.record!(change));
  }
  return version;
}

// What a body save derives from the text: its links and its `^id` blocks. Also run by
// `runtime.reindexBodies` when the extractor changed since the bodies were saved.
export async function indexBody(
  ctx: MutationContext,
  doc: Document,
  extracted: Extracted,
  options?: { fresh?: boolean },
): Promise<void> {
  await indexLinks(ctx, doc, extracted.links, options);
  if (options?.fresh && extracted.blocks.length === 0) return;
  await ctx.tx.blocks?.replaceFor(
    doc.id,
    doc.workspaceId,
    extracted.blocks.map((b) => ({
      docId: doc.id,
      blockId: b.id,
      type: b.type,
      text: b.text,
      order: b.order,
    })),
    options,
  );
}

// Every document in a deleted document's subtree (they are all deleted: nothing live can sit under
// a deleted parent), with the root first.
async function subtreeIds(tx: DbTx, id: string): Promise<string[]> {
  return [id, ...(await tx.docs.descendants(id)).map((d) => d.id)];
}

// Purges a trashed document's subtree and the attachments that belong to it. `attachments`: the
// workspace's attachments (trashed ones included) when the caller has listed them already.
export async function purgeDocuments(
  ctx: MutationContext,
  root: Document,
  attachments?: readonly Attachment[],
): Promise<{ docIds: string[]; attachmentIds: string[] }> {
  if (!ctx.tx.docs.purge) unsupported("Purging documents");
  const docIds = await subtreeIds(ctx.tx, root.id);
  const attachmentIds: string[] = [];
  if (ctx.tx.attachments) {
    const owned = new Set(docIds);
    for (const a of attachments ??
      (await ctx.tx.attachments.list(root.workspaceId, { includeDeleted: true }))) {
      if (!a.documentId || !owned.has(a.documentId)) continue;
      await purgeAttachmentRow(ctx, a.id);
      attachmentIds.push(a.id);
    }
  }
  await ctx.tx.threads?.purgeFor(docIds);
  await ctx.tx.docs.purge(docIds);
  ctx.emit(
    "doc.purged",
    root.workspaceId,
    { id: root.id, purgedIds: docIds },
    { title: root.title },
  );
  return { docIds, attachmentIds };
}

export async function purgeAttachmentRow(ctx: MutationContext, id: string): Promise<void> {
  const attachments = ctx.tx.attachments ?? unsupported("Attachments");
  const row = await attachments.get(id);
  if (!row) return;
  await attachments.purge(id);
  const bytesRemoved = (await attachments.countBySha256(row.sha256)) === 0;
  if (bytesRemoved && ctx.blob) {
    const blob = ctx.blob;
    ctx.afterCommit(() => blob.delete(row.sha256));
  }
  ctx.emit(
    "attachment.purged",
    row.workspaceId,
    { id, sha256: row.sha256, bytesRemoved },
    { title: row.filename },
  );
}

// How to undo a body change. The whole previous body when that is small or the change is large;
// otherwise one edit that turns the new body back into the old one (with enough context to match
// once) guarded by the new body's version, so the journal does not hold a copy of every large
// document per save (LYD-170). If the body changed in between, the undo is a conflict and is
// dropped rather than applied to text it was not made for.
export function bodyInverse(
  id: string,
  previous: string,
  next: string,
  nextVersion: string,
):
  | { id: string; markdown: string }
  | {
      id: string;
      edits: { oldStr: string; newStr: string; replaceAll: false }[];
      expectedVersion: string;
    } {
  const full = { id, markdown: previous };
  if (previous.length < 1024) return full;
  const edit = inverseEdit(previous, next);
  if (!edit || edit.oldStr.length + edit.newStr.length >= previous.length / 2) return full;
  return { id, edits: [{ ...edit, replaceAll: false }], expectedVersion: nextVersion };
}

// One exact-string edit turning `next` into `previous`: the differing middle, widened until it
// occurs exactly once in `next`. null when no such edit exists (`next` is empty).
export function inverseEdit(
  previous: string,
  next: string,
): { oldStr: string; newStr: string } | null {
  const max = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < max && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  let from = prefix;
  let to = next.length - suffix;
  for (let grow = 16; ; grow *= 2) {
    const oldStr = next.slice(from, to);
    const at = oldStr ? next.indexOf(oldStr) : -1;
    if (oldStr && next.indexOf(oldStr, at + 1) === -1) {
      return { oldStr, newStr: previous.slice(from, previous.length - (next.length - to)) };
    }
    if (from === 0 && to === next.length) return null;
    from = Math.max(0, from - grow);
    to = Math.min(next.length, to + grow);
  }
}

export const docHandlers: Handlers<Operations> = {
  async "doc.create"(ctx, input) {
    // An id minted here is new; one given in the input may be taken.
    const id = input.id ?? ctx.ids.uuid();
    if (input.id && (await ctx.tx.docs.get(id))) {
      throw new LydieError("conflict", `Document ${id} already exists`);
    }
    if (input.parentId) await requireParent(ctx.tx, input.workspaceId, input.parentId);
    const sortKey = await placeKey(ctx.tx, input.workspaceId, input.parentId, input);
    const doc: Document = {
      id,
      workspaceId: input.workspaceId,
      parentId: input.parentId,
      title: input.title,
      sortKey,
      properties: input.properties,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      updatedBy: ctx.actorRef,
    };
    await ctx.tx.docs.insert(doc);
    ctx.pin({ id, sortKey });
    ctx.inverse("doc.delete", { id });
    ctx.emit("doc.created", doc.workspaceId, { document: doc });
    await ctx.tx.links.resolveDangling(doc.workspaceId, linkKey(doc.title), doc.id);
    // A minted id has no body, links or blocks anywhere. A given one may have rows left on this
    // device (a body kept after access was lost): those are replaced.
    const fresh = input.id === undefined;
    if (input.markdown !== undefined) await writeBody(ctx, doc, input.markdown, null, { fresh });
    else if (mayLink(doc.properties)) await indexLinks(ctx, doc, null, { fresh });
    return doc;
  },

  async "doc.rename"(ctx, input) {
    const doc = await requireLive(ctx.tx, input.id);
    if (doc.title === input.title) return doc;
    const patch = { title: input.title, updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await ctx.tx.docs.update(doc.id, patch);
    ctx.inverse("doc.rename", { id: doc.id, title: doc.title });
    ctx.emit("doc.renamed", doc.workspaceId, {
      id: doc.id,
      title: input.title,
      previousTitle: doc.title,
    });
    await ctx.tx.links.resolveDangling(doc.workspaceId, linkKey(input.title), doc.id);
    return { ...doc, ...patch };
  },

  async "doc.move"(ctx, input) {
    const doc = await requireLive(ctx.tx, input.id);
    if (input.parentId) {
      await requireParent(ctx.tx, doc.workspaceId, input.parentId);
      if (input.parentId === doc.id) {
        throw new LydieError("invalid_input", "A document cannot be moved into its own subtree");
      }
      const above = ctx.tx.docs.ancestors
        ? await ctx.tx.docs.ancestors(input.parentId)
        : await walkUp(ctx.tx, input.parentId);
      if (above.some((d) => d.id === doc.id)) {
        throw new LydieError("invalid_input", "A document cannot be moved into its own subtree");
      }
    }
    const sortKey = await placeKey(ctx.tx, doc.workspaceId, input.parentId, input, doc.id);
    if (sortKey === doc.sortKey && input.parentId === doc.parentId) return doc;
    const patch = {
      parentId: input.parentId,
      sortKey,
      updatedAt: ctx.now,
      updatedBy: ctx.actorRef,
    };
    await ctx.tx.docs.update(doc.id, patch);
    ctx.pin({ sortKey });
    ctx.inverse("doc.move", { id: doc.id, parentId: doc.parentId, sortKey: doc.sortKey });
    ctx.emit("doc.moved", doc.workspaceId, {
      id: doc.id,
      parentId: input.parentId,
      sortKey,
      previousParentId: doc.parentId,
    });
    return { ...doc, ...patch };
  },

  async "doc.delete"(ctx, input) {
    const doc = await requireDoc(ctx.tx, input.id);
    if (doc.deletedAt) return { id: doc.id, deletedAt: doc.deletedAt, deletedIds: [] };
    const live = (await ctx.tx.docs.descendants(doc.id)).filter((d) => !d.deletedAt);
    const deletedIds = [doc.id, ...live.map((d) => d.id)];
    const patch = { deletedAt: ctx.now, updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await updateAll(ctx.tx, deletedIds, patch);
    ctx.inverse("doc.restore", { id: doc.id });
    ctx.emit("doc.deleted", doc.workspaceId, { id: doc.id, deletedIds });
    return { id: doc.id, deletedAt: ctx.now, deletedIds };
  },

  async "doc.restore"(ctx, input) {
    const doc = await requireDoc(ctx.tx, input.id);
    if (!doc.deletedAt) return doc;
    // Restore what was deleted together with it, not descendants deleted separately before.
    const together = (await ctx.tx.docs.descendants(doc.id)).filter(
      (d) => d.deletedAt === doc.deletedAt,
    );
    let { parentId, sortKey } = doc;
    if (parentId) {
      const parent = await ctx.tx.docs.get(parentId);
      if (!parent || parent.deletedAt) {
        parentId = null;
        sortKey = await placeKey(ctx.tx, doc.workspaceId, null, {}, doc.id);
      }
    }
    const stamp = { updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await ctx.tx.docs.update(doc.id, { parentId, sortKey, deletedAt: null, ...stamp });
    await updateAll(
      ctx.tx,
      together.map((d) => d.id),
      { deletedAt: null, ...stamp },
    );
    ctx.inverse("doc.delete", { id: doc.id });
    ctx.emit("doc.restored", doc.workspaceId, {
      id: doc.id,
      restoredIds: [doc.id, ...together.map((d) => d.id)],
    });
    return { ...doc, parentId, sortKey, deletedAt: null, ...stamp };
  },

  async "doc.purge"(ctx, input) {
    const doc = await ctx.tx.docs.get(input.id);
    if (!doc) return { purgedIds: [] };
    if (!doc.deletedAt) {
      throw new LydieError("invalid_input", `Document ${doc.id} is not in the trash`, {
        hint: "Delete it with doc.delete first.",
      });
    }
    return { purgedIds: (await purgeDocuments(ctx, doc)).docIds };
  },

  async "doc.setProperties"(ctx, input) {
    const doc = await requireLive(ctx.tx, input.id);
    const properties: Properties = { ...doc.properties, ...input.set };
    for (const key of input.unset) delete properties[key];
    const changed = [...new Set([...Object.keys(input.set), ...input.unset])].filter(
      (key) => JSON.stringify(doc.properties[key]) !== JSON.stringify(properties[key]),
    );
    if (changed.length === 0) return doc;
    const patch = { properties, updatedAt: ctx.now, updatedBy: ctx.actorRef };
    await ctx.tx.docs.update(doc.id, patch);
    await relinkProperties(ctx, { ...doc, ...patch }, doc.properties);
    const set: Properties = {};
    const unset: string[] = [];
    for (const key of changed) {
      if (key in doc.properties) set[key] = doc.properties[key]!;
      else unset.push(key);
    }
    ctx.inverse("doc.setProperties", { id: doc.id, set, unset });
    ctx.emit(
      "doc.propertiesChanged",
      doc.workspaceId,
      { id: doc.id, properties },
      { keys: changed },
    );
    return { ...doc, ...patch };
  },

  async "doc.updateBody"(ctx, input) {
    const doc = await requireLive(ctx.tx, input.id);
    const stored = await ctx.tx.bodies.get(doc.id);
    const current = stored ?? { markdown: "", version: bodyVersion("") };
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
      throw new LydieError("conflict", "The body changed since it was read", {
        hint: "Fetch the document again and retry with the new version.",
        details: { currentVersion: current.version },
      });
    }
    const { markdown, warnings } =
      input.markdown !== undefined
        ? { markdown: input.markdown, warnings: [] }
        : applyEdits(current.markdown, input.edits ?? []);
    if (stored && markdown === stored.markdown) {
      return { document: doc, version: current.version, warnings };
    }
    const version = await writeBody(ctx, doc, markdown, stored?.markdown ?? null);
    const stamp = bodyStamp(ctx, doc);
    if (stamp) await ctx.tx.docs.update(doc.id, stamp);
    ctx.inverse("doc.updateBody", bodyInverse(doc.id, current.markdown, markdown, version));
    // A whole large body as input: journal the edit it amounts to instead (LYD-244).
    if (input.markdown !== undefined) {
      const forward = bodyInverse(doc.id, markdown, current.markdown, current.version);
      if ("edits" in forward) ctx.journal?.(forward);
    }
    return { document: { ...doc, ...stamp }, version, warnings };
  },

  // Composite: title, properties, then the body. The body goes last because a hosted body write
  // reaches collab before the transaction commits; whatever can still fail runs before it.
  async "doc.update"(ctx, input) {
    let doc = await requireLive(ctx.tx, input.id);
    if (input.title !== undefined && input.title !== doc.title) {
      doc = (await ctx.exec("doc.rename", { id: doc.id, title: input.title })) as Document;
    }
    const set = input.properties ?? {};
    const unset = input.unset ?? [];
    if (Object.keys(set).length > 0 || unset.length > 0) {
      // A row's values are checked against its database, as write_database_rows does.
      const database = doc.parentId ? await ctx.tx.databases?.get(doc.parentId) : null;
      if (database && !database.deletedAt) {
        await ctx.exec("database.writeRows", {
          databaseId: database.id,
          rows: [{ id: doc.id, values: set, unset }],
        });
        doc = await requireLive(ctx.tx, doc.id);
      } else {
        doc = (await ctx.exec("doc.setProperties", { id: doc.id, set, unset })) as Document;
      }
    }
    if (input.markdown === undefined && input.edits === undefined) {
      return { document: doc, version: null, warnings: [] };
    }
    return (await ctx.exec("doc.updateBody", {
      id: doc.id,
      ...(input.markdown !== undefined ? { markdown: input.markdown } : { edits: input.edits }),
      ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    })) as { document: Document; version: string; warnings: Warning[] };
  },

  async "doc.listVersions"(ctx, input) {
    const versions = ctx.versions ?? unsupported("Version history");
    await requireDoc(ctx.tx, input.id);
    return { versions: await versions.list(input.id, input.limit) };
  },

  async "doc.getVersion"(ctx, input) {
    const versions = ctx.versions ?? unsupported("Version history");
    await requireDoc(ctx.tx, input.id);
    const found = await versions.get(input.id, input.versionId);
    if (!found) throw new LydieError("not_found", `Version ${input.versionId} not found`);
    return found;
  },

  // A restore is a body write like any other (same index, event and inverse), so undo puts the
  // previous body back exactly. Version ids belong to the backend that keeps them: this handler is
  // for backends whose versions are local (the hosted core has its own).
  async "doc.restoreVersion"(ctx, input) {
    const versions = ctx.versions ?? unsupported("Version history");
    const doc = await requireLive(ctx.tx, input.id);
    const found = await versions.get(doc.id, input.versionId);
    if (!found) throw new LydieError("not_found", `Version ${input.versionId} not found`);
    const stored = await ctx.tx.bodies.get(doc.id);
    const current = stored ?? { markdown: "", version: bodyVersion("") };
    if (found.markdown === current.markdown) {
      return { versionId: found.version.id, previousVersionId: null, version: current.version };
    }
    const previousVersionId =
      (await versions.checkpoint?.(doc.id, current.markdown, ctx.now)) ?? null;
    const version = await writeBody(ctx, doc, found.markdown, stored?.markdown ?? null, {
      restoredFrom: input.versionId,
    });
    await ctx.tx.docs.update(doc.id, { updatedAt: ctx.now, updatedBy: ctx.actorRef });
    ctx.inverse("doc.updateBody", bodyInverse(doc.id, current.markdown, found.markdown, version));
    return { versionId: null, previousVersionId, version };
  },

  async "doc.get"(ctx, input) {
    const document = await requireDoc(ctx.tx, input.id);
    const body = input.includeBody ? await ctx.tx.bodies.get(document.id) : null;
    const threads = input.includeBody ? await openThreads(ctx.tx, document.id) : [];
    return threads.length > 0 ? { document, body, threads } : { document, body };
  },

  async "doc.listTree"(ctx, input) {
    if (input.rootId) await requireDoc(ctx.tx, input.rootId);
    const entries = await ctx.tx.docs.tree(input.workspaceId, {
      includeDeleted: input.includeDeleted,
      ...(input.rootId ? { rootId: input.rootId } : {}),
    });
    return { entries };
  },

  async "doc.listChildren"(ctx, input) {
    const parentId = input.parentId ?? null;
    if (parentId) await requireDoc(ctx.tx, parentId);
    const options = { includeDeleted: input.includeDeleted };
    if (ctx.tx.docs.childEntries) {
      return { entries: await ctx.tx.docs.childEntries(input.workspaceId, parentId, options) };
    }
    // Ports without childEntries: two reads whatever the number of children (the level, then the
    // live subtree below it to count grandchildren), not one read per child.
    const children = await ctx.tx.docs.children(input.workspaceId, parentId, options);
    if (children.length === 0) return { entries: [] };
    const below = await ctx.tx.docs.tree(input.workspaceId, {
      includeDeleted: false,
      ...(parentId ? { rootId: parentId } : {}),
    });
    const counts = new Map<string, number>();
    for (const d of below)
      if (d.parentId) counts.set(d.parentId, (counts.get(d.parentId) ?? 0) + 1);
    return { entries: children.map((c) => ({ ...c, childCount: counts.get(c.id) ?? 0 })) };
  },

  async "doc.search"(ctx, input) {
    return { hits: await (ctx.tx.search ?? ctx.search).query(input) };
  },

  async "doc.backlinks"(ctx, input) {
    await requireDoc(ctx.tx, input.id);
    return { backlinks: await ctx.tx.links.backlinks(input.id) };
  },

  async "doc.outgoingLinks"(ctx, input) {
    await requireDoc(ctx.tx, input.id);
    if (ctx.tx.links.outgoing) return { links: await ctx.tx.links.outgoing(input.id) };
    if (!ctx.tx.links.from) unsupported("Outgoing links");
    const rows = await ctx.tx.links.from(input.id);
    const targets = new Map<string, Awaited<ReturnType<typeof ctx.tx.docs.get>>>();
    for (const r of rows) {
      if (r.targetId && !targets.has(r.targetId)) {
        targets.set(r.targetId, await ctx.tx.docs.get(r.targetId));
      }
    }
    const ordered = [...rows].sort(
      (a, b) =>
        Number(Boolean(a.sourceProperty)) - Number(Boolean(b.sourceProperty)) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return {
      links: ordered.map((r) => {
        const t = r.targetId ? targets.get(r.targetId) : null;
        return {
          id: r.id,
          kind: r.kind,
          syntax: r.syntax ?? "wikilink",
          targetRef: r.targetRef,
          targetHeading: r.targetHeading ?? null,
          targetBlockId: r.targetBlockId ?? null,
          sourceBlockId: r.sourceBlockId ?? null,
          sourceProperty: r.sourceProperty ?? null,
          target:
            t && !t.deletedAt
              ? {
                  id: t.id,
                  title: t.title,
                  parentId: t.parentId,
                  workspaceId: t.workspaceId,
                  icon: typeof t.properties.icon === "string" ? t.properties.icon : null,
                }
              : null,
        };
      }),
    };
  },

  async "doc.blockBacklinks"(ctx, input) {
    await requireDoc(ctx.tx, input.id);
    const backlinks = ctx.tx.links.blockBacklinks
      ? await ctx.tx.links.blockBacklinks(input.id, input.blockId)
      : (await ctx.tx.links.backlinks(input.id)).filter((b) => b.targetBlockId === input.blockId);
    return { backlinks };
  },

  async "doc.unlinkedMentions"(ctx, input) {
    const doc = await requireDoc(ctx.tx, input.id);
    const search = ctx.tx.search ?? ctx.search;
    if (!search.mentions) unsupported("Unlinked mentions");
    const aliases = doc.properties.aliases;
    const phrases = [doc.title, ...(Array.isArray(aliases) ? aliases : [])];
    const mentions = await search.mentions({
      workspaceId: doc.workspaceId,
      targetId: doc.id,
      phrases,
      limit: input.limit,
    });
    return { mentions };
  },

  async "doc.unresolvedLinks"(ctx, input) {
    if (!ctx.tx.links.unresolved) unsupported("Listing unresolved links");
    return { links: await ctx.tx.links.unresolved(input.workspaceId) };
  },
};

// One patch for several documents, in one round trip where the port allows it.
async function updateAll(tx: DbTx, ids: readonly string[], patch: DocPatch): Promise<void> {
  if (tx.docs.updateMany && ids.length > 1) {
    await tx.docs.updateMany(ids.map((id) => ({ id, patch })));
  } else {
    for (const id of ids) await tx.docs.update(id, patch);
  }
}

async function walkUp(tx: DbRead, id: string): Promise<Document[]> {
  const out: Document[] = [];
  for (let cursor: string | null = id; cursor;) {
    const doc = await requireDoc(tx, cursor);
    out.push(doc);
    cursor = doc.parentId;
  }
  return out;
}
