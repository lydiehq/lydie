import {
  checkValue,
  convertValue,
  formatUniqueId,
  isStoredType,
  LydieError,
  parseExpression,
  ViewConfig,
} from "@lydie/contract";
import type {
  Color,
  Database,
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseView,
  Document,
  FilterNode,
  GroupKey,
  Operations,
  ParsedInputOf,
  PropertyConfig,
  PropertyConfigInput,
  PropertyInput,
  PropertyType,
  PropertyValue,
  SchemaRewrite,
  SelectOption,
  ViewGroup,
  ViewInput,
  ViewType,
  WrittenRow,
} from "@lydie/contract";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

import type { ActivityHint } from "../activity.ts";
import {
  resolveFilterRefs,
  resolver,
  resolveView,
  resolveViewConfig,
  resolveWindow,
  rowResolver,
} from "../database/refs.ts";
import { bucketOf, runView } from "../database/view.ts";
import type { RowDoc, ViewContext } from "../database/view.ts";
import type { DatabasesRead, DatabasesWrite, DbRead, DbTx } from "../ports.ts";
import { placeKey } from "../position.ts";
import type { Handlers, MutationContext, QueryContext } from "../runtime.ts";
import { linkKey } from "../text.ts";
import { relinkProperties, requireDoc, requireLive, unsupported } from "./doc.ts";

// ---- Lookups

type Tx = DbRead | DbTx;

function dbs(tx: DbTx): DatabasesRead & DatabasesWrite;
function dbs(tx: DbRead): DatabasesRead;
function dbs(tx: Tx): DatabasesRead {
  return tx.databases ?? unsupported("Databases");
}

export async function requireDatabase(
  tx: Tx,
  id: string,
): Promise<{ database: Database; doc: Document }> {
  const database = await dbs(tx).get(id);
  if (!database || database.deletedAt)
    throw new LydieError("not_found", `Database ${id} not found`);
  const doc = await requireLive(tx, id);
  return { database, doc };
}

async function requireProperty(tx: Tx, id: string, options: { live?: boolean } = {}) {
  const p = await dbs(tx).property(id);
  if (!p || (options.live !== false && p.deletedAt)) {
    throw new LydieError("not_found", `Database property ${id} not found`);
  }
  return p;
}

async function requireView(tx: Tx, id: string, options: { live?: boolean } = {}) {
  const v = await dbs(tx).view(id);
  if (!v || (options.live !== false && v.deletedAt)) {
    throw new LydieError("not_found", `Database view ${id} not found`);
  }
  return v;
}

export async function definitionOf(tx: Tx, id: string): Promise<DatabaseDefinition> {
  const { database } = await requireDatabase(tx, id);
  const [properties, views] = await Promise.all([dbs(tx).properties(id), dbs(tx).views(id)]);
  return { database, properties, views };
}

const stamp = (ctx: MutationContext) => ({ updatedAt: ctx.now, updatedBy: ctx.actorRef });

function changedKeys(before: Document["properties"], after: Document["properties"]): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function changed(
  ctx: MutationContext,
  workspaceId: string,
  id: string,
  change: "database" | "properties" | "views" | "options",
) {
  ctx.emit("database.changed", workspaceId, { id, change });
}

// ---- Ordering of properties and views (fractional keys, like documents)

type Placement = {
  afterId?: string | undefined;
  beforeId?: string | undefined;
  sortKey?: string | undefined;
};

function placeAmong(
  items: readonly { id: string; sortKey: string }[],
  placement: Placement,
  excludeId?: string,
): string {
  if (placement.sortKey) return placement.sortKey;
  const list = items.filter((i) => i.id !== excludeId);
  const at = (id: string, field: string) => {
    const i = list.findIndex((x) => x.id === id);
    if (i === -1) throw new LydieError("invalid_input", `${field} ${id} is not in this database`);
    return i;
  };
  if (placement.afterId) {
    const i = at(placement.afterId, "afterId");
    return generateKeyBetween(list[i]!.sortKey, list[i + 1]?.sortKey ?? null);
  }
  if (placement.beforeId) {
    const i = at(placement.beforeId, "beforeId");
    return generateKeyBetween(list[i - 1]?.sortKey ?? null, list[i]!.sortKey);
  }
  return generateKeyBetween(list.at(-1)?.sortKey ?? null, null);
}

// ---- Validation

const FILE_KEYS: Partial<Record<PropertyType, string>> = {
  title: "name",
  createdTime: "ctime",
  updatedTime: "mtime",
};
const OPTION_TYPES: readonly PropertyType[] = ["select", "multiSelect", "status"];
const COLOR_CYCLE: readonly Color[] = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];
const STATUS_DEFAULTS: readonly [string, Color, SelectOption["group"]][] = [
  ["Not started", "default", "todo"],
  ["In progress", "blue", "inProgress"],
  ["Done", "green", "complete"],
];

// Fills in what a type needs (option ids, status defaults) and rejects what it cannot use.
async function normaliseConfig(
  ctx: MutationContext,
  databaseId: string,
  type: PropertyType,
  config: PropertyConfigInput,
): Promise<PropertyConfig> {
  const out = { ...config } as PropertyConfig;
  if (OPTION_TYPES.includes(type)) {
    let options = out.options ?? [];
    if (type === "status" && options.length === 0) {
      options = STATUS_DEFAULTS.map(([name, color, group]) => ({
        id: ctx.ids.uuid(),
        name,
        color,
        group,
      }));
    }
    const names = new Set<string>();
    out.options = (options as PropertyConfigInput["options"] & {}).map((o) => {
      if (names.has(o.name)) throw new LydieError("invalid_input", `Duplicate option "${o.name}"`);
      names.add(o.name);
      const option: SelectOption = {
        ...o,
        id: o.id ?? ctx.ids.uuid(),
        color: o.color ?? "default",
      };
      if (type === "status") option.group = o.group ?? "todo";
      else delete option.group;
      return option;
    });
  } else delete out.options;
  if (type === "relation") {
    const relation = out.relation;
    if (!relation)
      throw new LydieError("invalid_input", "A relation needs config.relation.databaseId");
    await requireDatabase(ctx.tx, relation.databaseId);
  } else delete out.relation;
  if (type === "rollup") {
    const rollup = out.rollup;
    if (!rollup) throw new LydieError("invalid_input", "A rollup needs config.rollup");
    const relation = await requireProperty(ctx.tx, rollup.relationPropertyId);
    if (relation.type !== "relation" || relation.databaseId !== databaseId) {
      throw new LydieError(
        "invalid_input",
        "rollup.relationPropertyId must be a relation of this database",
      );
    }
    const target = await requireProperty(ctx.tx, rollup.targetPropertyId);
    if (target.databaseId !== relation.config.relation?.databaseId) {
      throw new LydieError(
        "invalid_input",
        "rollup.targetPropertyId must belong to the related database",
      );
    }
  } else delete out.rollup;
  if (type === "formula") {
    try {
      if (out.expression?.trim()) parseExpression(out.expression);
    } catch (error) {
      throw new LydieError("invalid_input", `Invalid formula: ${(error as Error).message}`);
    }
  } else delete out.expression;
  if (type !== "number") {
    delete out.numberFormat;
    delete out.decimals;
    delete out.currency;
  }
  if (type !== "date") {
    delete out.includeTime;
    delete out.range;
  }
  if (type !== "uniqueId" || !out.prefix) delete out.prefix;
  return out;
}

function uniqueKey(wanted: string, taken: ReadonlySet<string>): string {
  const base = wanted.trim().replace(/^(file|formula|note|this)\./, "") || "property";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

// Keys in use: stored keys and formula names live in different namespaces of a .base file.
function takenKeys(
  properties: readonly DatabaseProperty[],
  type: PropertyType,
  excludeId?: string,
): Set<string> {
  const formulaLike = (t: PropertyType) =>
    t === "formula" || t === "rollup" || t === "createdBy" || t === "updatedBy";
  return new Set(
    properties
      .filter(
        (p) =>
          p.id !== excludeId &&
          (isStoredType(type) ? isStoredType(p.type) : formulaLike(type) && formulaLike(p.type)),
      )
      .map((p) => p.key),
  );
}

// ---- Row values

type Pending = Map<
  string,
  {
    doc: Document;
    next: Record<string, unknown>;
    changes: Map<string, { propertyId: string; key: string }>;
  }
>;

async function loadDocs(tx: Tx, ids: readonly string[]): Promise<Map<string, Document>> {
  const unique = [...new Set(ids)];
  const docs = tx.docs.getMany
    ? await tx.docs.getMany(unique)
    : (await Promise.all(unique.map((id) => tx.docs.get(id)))).filter(
        (d): d is Document => d !== null,
      );
  return new Map(docs.map((d) => [d.id, d]));
}

async function writeRows(ctx: MutationContext, pending: Pending): Promise<string[]> {
  const updates: {
    id: string;
    patch: { properties: Document["properties"]; updatedAt: string; updatedBy: string };
  }[] = [];
  for (const [id, { doc, next }] of pending) {
    if (JSON.stringify(next) === JSON.stringify(doc.properties)) continue;
    updates.push({ id, patch: { properties: next as Document["properties"], ...stamp(ctx) } });
  }
  if (ctx.tx.docs.updateMany) await ctx.tx.docs.updateMany(updates);
  else for (const u of updates) await ctx.tx.docs.update(u.id, u.patch);
  for (const u of updates) {
    const doc = pending.get(u.id)!.doc;
    await relinkProperties(ctx, { ...doc, ...u.patch }, doc.properties);
    ctx.emit(
      "doc.propertiesChanged",
      doc.workspaceId,
      { id: u.id, properties: u.patch.properties },
      rowHint(ctx, changedKeys(doc.properties, u.patch.properties)),
    );
  }
  return updates.map((u) => u.id);
}

// Runs `fn` as a schema rewrite of one database's rows (LYD-246): through the port's `rewrite`,
// which lets a backend that hides rows from the caller include them. Nested calls (a rewrite
// inside a rewrite of the same operation) run once. Rows written meanwhile are quiet in the
// activity log (`rowHint`), on every backend.
const activeRewrites = new WeakMap<MutationContext, SchemaRewrite>();
async function rewriting<T>(
  ctx: MutationContext,
  rewrite: SchemaRewrite,
  fn: () => Promise<T>,
): Promise<T> {
  if (activeRewrites.has(ctx)) return fn();
  const store = dbs(ctx.tx);
  activeRewrites.set(ctx, rewrite);
  try {
    return await (store.rewrite ? store.rewrite(rewrite, fn) : fn());
  } finally {
    activeRewrites.delete(ctx);
  }
}

// A rewritten row is not activity of its own: the schema change is one `database.changed` row
// (LYD-410). The event is still published (the file bridge writes the row's frontmatter).
function rowHint(ctx: MutationContext, keys: string[]): ActivityHint {
  return activeRewrites.has(ctx) ? { keys, quiet: true } : { keys };
}

// Records `database.setValues` inverses (exact) restoring the previous values of every change,
// one per database. Rows changed by a schema rewrite get their own step, tagged with it, so undo
// restores them the same way (`rewriteOf`; default: the rewrite being undone, if any).
function recordValuesInverse(
  ctx: MutationContext,
  pending: Pending,
  rewriteOf: (rowId: string) => SchemaRewrite | undefined = () => ctx.rewrite,
) {
  const byDatabase = new Map<
    string,
    { rowId: string; set: Record<string, PropertyValue>; unset: string[] }[]
  >();
  const rewrites = new Map<string, SchemaRewrite>();
  for (const [id, { doc, next, changes }] of pending) {
    const set: Record<string, PropertyValue> = {};
    const unset: string[] = [];
    for (const { propertyId, key } of changes.values()) {
      if (JSON.stringify(doc.properties[key]) === JSON.stringify(next[key])) continue;
      if (key in doc.properties) set[propertyId] = doc.properties[key]!;
      else unset.push(propertyId);
    }
    if (Object.keys(set).length === 0 && unset.length === 0) continue;
    const rewrite = rewriteOf(id);
    const group = `${doc.parentId!}\u0000${rewrite ? JSON.stringify(rewrite) : ""}`;
    const list = byDatabase.get(group) ?? [];
    list.push({ rowId: id, set, unset });
    byDatabase.set(group, list);
    if (rewrite) rewrites.set(group, rewrite);
  }
  for (const [group, updates] of byDatabase) {
    const databaseId = group.slice(0, group.indexOf("\u0000"));
    const rewrite = rewrites.get(group);
    ctx.inverse(
      "database.setValues",
      { databaseId, updates, exact: true },
      rewrite ? { rewrite } : undefined,
    );
  }
}

function track(pending: Pending, doc: Document, p: Pick<DatabaseProperty, "id" | "key">) {
  let entry = pending.get(doc.id);
  if (!entry)
    pending.set(doc.id, (entry = { doc, next: { ...doc.properties }, changes: new Map() }));
  entry.changes.set(p.id, { propertyId: p.id, key: p.key });
  return entry.next;
}

// ---- Unique ids (uniqueId properties: "LYD-12")

const wholeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

// 1 + the largest number under `key` in any row of the database, trashed rows included.
async function nextUniqueId(ctx: MutationContext, databaseId: string, key: string) {
  const store = dbs(ctx.tx);
  if (store.nextUniqueId) return store.nextUniqueId(databaseId, key);
  const { doc } = await requireDatabase(ctx.tx, databaseId);
  const rows = await ctx.tx.docs.children(doc.workspaceId, databaseId, { includeDeleted: true });
  let max = 0;
  for (const row of rows) {
    const v = row.properties[key];
    if (wholeNumber(v) && v > max) max = v;
  }
  return max + 1;
}

// Numbers every row of the database, trashed ones too, in creation order, as one rewrite with an
// exact inverse. `keep`: rows that already hold a number not used by an earlier row keep it (a
// property added over existing values); the others continue after the largest.
async function numberRows(
  ctx: MutationContext,
  p: DatabaseProperty,
  reason: SchemaRewrite["reason"],
  keep: boolean,
): Promise<number> {
  const info: SchemaRewrite = { databaseId: p.databaseId, propertyId: p.id, reason };
  return rewriting(ctx, info, async () => {
    const { doc } = await requireDatabase(ctx.tx, p.databaseId);
    const rows = await ctx.tx.docs.children(doc.workspaceId, p.databaseId, {
      includeDeleted: true,
    });
    rows.sort((a, b) =>
      a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.id < b.id ? -1 : 1,
    );
    const kept = new Set<string>();
    const used = new Set<number>();
    let next = 1;
    if (keep) {
      for (const row of rows) {
        const v = row.properties[p.key];
        if (!wholeNumber(v) || used.has(v)) continue;
        used.add(v);
        kept.add(row.id);
        next = Math.max(next, v + 1);
      }
    }
    const pending: Pending = new Map();
    for (const row of rows) {
      if (kept.has(row.id)) continue;
      const value = next++;
      if (row.properties[p.key] !== value) track(pending, row, p)[p.key] = value;
    }
    recordValuesInverse(ctx, pending, () => info);
    return (await writeRows(ctx, pending)).length;
  });
}

// The key "id" is a document's identity in a folder (the file bridge writes it on new files).
function checkUniqueIdKey(type: PropertyType, key: string) {
  if (type === "uniqueId" && key === "id") {
    throw new LydieError("invalid_input", 'The key "id" is reserved; pick another key', {
      hint: "In a folder, every page keeps its identity under id.",
    });
  }
}

const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];

// The value that puts a row in a group (Notion's "drag to column" / "new in column").
function groupValue(
  p: DatabaseProperty,
  key: GroupKey,
  bucket: "day" | "week" | "month" | "year" = "month",
): PropertyValue | undefined {
  if (key === null) return null;
  switch (p.type) {
    case "select":
    case "status":
    case "text":
    case "url":
    case "email":
    case "phone":
      return key;
    case "number":
      return Number.isFinite(Number(key)) ? Number(key) : undefined;
    case "checkbox":
      return key === "true";
    case "date":
      return bucket === "year" ? `${key}-01-01` : bucket === "month" ? `${key}-01` : key;
    case "multiSelect":
    case "person":
    case "relation":
      return [key];
    default:
      return undefined;
  }
}

// Values implied by a filter (Notion fills in what a new row needs to show up in the view): only
// conditions joined by "and" that pin one value.
function impliedValues(
  node: FilterNode | null,
  properties: readonly DatabaseProperty[],
  me: string | null,
  out: Record<string, PropertyValue>,
) {
  if (!node) return;
  if (node.type === "group") {
    if (node.combinator === "and")
      for (const c of node.children) impliedValues(c, properties, me, out);
    return;
  }
  if (node.type !== "condition") return;
  const p = properties.find((x) => x.id === node.propertyId);
  // Unique ids are assigned, never implied.
  if (!p || !isStoredType(p.type) || p.type === "uniqueId") return;
  const values =
    node.value === undefined || node.value === null
      ? []
      : Array.isArray(node.value)
        ? node.value
        : [node.value];
  const first = values[0];
  const scalar = (v: unknown): string | number | boolean | null =>
    typeof v === "object" && v !== null
      ? "me" in v
        ? me
        : null
      : (v as string | number | boolean);
  const v = scalar(first);
  if (v === null || v === undefined) return;
  const list =
    p.type === "multiSelect" || p.type === "person" || p.type === "relation" || p.type === "files";
  if ((node.op === "eq" || (node.op === "in" && values.length === 1)) && !list)
    out[p.id] = v as PropertyValue;
  else if ((node.op === "contains" || (node.op === "in" && values.length === 1)) && list)
    out[p.id] = [String(v)];
  else if (node.op === "eq" && p.type === "checkbox") out[p.id] = v === true;
}

function userOf(ctx: { actor: MutationContext["actor"] }): string | null {
  if (ctx.actor.type === "user") return ctx.actor.id;
  if (ctx.actor.type === "agent") return ctx.actor.onBehalfOf;
  return null;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- Views

const VIEW_NAMES: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  calendar: "Calendar",
  gallery: "Gallery",
};

// A board groups by the first status (else select) property, a calendar places rows by the first
// date property, when the caller did not say.
function completeView(
  type: ViewType,
  config: ViewConfig,
  properties: readonly DatabaseProperty[],
): ViewConfig {
  const out = { ...config, layout: { ...config.layout } };
  if (type === "board" && !out.groupBy) {
    const p =
      properties.find((x) => x.type === "status") ?? properties.find((x) => x.type === "select");
    if (p) out.groupBy = { propertyId: p.id, direction: "asc" };
  }
  if (type === "calendar" && !out.layout.calendarPropertyId) {
    const p = properties.find((x) => x.type === "date");
    if (p) out.layout.calendarPropertyId = p.id;
  }
  return out;
}

// ---- setValues

type SetValuesInput = {
  databaseId: string;
  rowIds?: string[] | undefined;
  set: Record<string, PropertyValue>;
  unset: string[];
  updates?: { rowId: string; set: Record<string, PropertyValue>; unset: string[] }[] | undefined;
  exact: boolean;
  newOptions?: Record<string, SelectOption[]> | undefined;
};

async function setValues(
  ctx: MutationContext,
  input: SetValuesInput,
): Promise<{ updated: string[] }> {
  const { database, doc: dbDoc } = await requireDatabase(ctx.tx, input.databaseId);
  const properties = new Map((await dbs(ctx.tx).properties(database.id)).map((p) => [p.id, p]));
  const updates =
    input.updates ??
    (input.rowIds ?? []).map((rowId) => ({ rowId, set: input.set, unset: input.unset }));
  const rows = await loadDocs(
    ctx.tx,
    updates.map((u) => u.rowId),
  );
  const pending: Pending = new Map();
  const reassigned = new Map<string, SchemaRewrite>();
  const newOptions = new Map<string, SelectOption[]>();
  const relationChanges: {
    row: Document;
    p: DatabaseProperty;
    before: string[];
    after: string[];
  }[] = [];

  const propertyFor = (id: string) => {
    const p = properties.get(id);
    if (!p)
      throw new LydieError(
        "invalid_input",
        `Property ${id} is not a live property of this database`,
      );
    if (!isStoredType(p.type))
      throw new LydieError("invalid_input", `${p.name} (${p.type}) is computed and cannot be set`);
    return p;
  };

  for (const u of updates) {
    const row = rows.get(u.rowId);
    // Undo may restore trashed rows' values (a uniqueId backfill numbers them too).
    if (!row || (row.deletedAt && !input.exact) || row.parentId !== database.id) {
      throw new LydieError(
        "invalid_input",
        `${u.rowId} is not a live row of database ${database.id}`,
      );
    }
    for (const [propertyId, raw] of Object.entries(u.set)) {
      const p = propertyFor(propertyId);
      let value: PropertyValue = raw;
      if (!input.exact) {
        const check = checkValue(p, raw);
        if (!check.ok) throw new LydieError("invalid_input", `${p.name}: ${check.message}`);
        value = check.value;
        if (OPTION_TYPES.includes(p.type) && value !== null) {
          const known = new Set(
            [...(p.config.options ?? []), ...(newOptions.get(p.id) ?? [])].map((o) => o.name),
          );
          for (const name of listOf(value)) {
            if (known.has(name)) continue;
            const pinned = input.newOptions?.[p.id]?.find((o) => o.name === name);
            const added = newOptions.get(p.id) ?? [];
            const color =
              COLOR_CYCLE[((p.config.options?.length ?? 0) + added.length) % COLOR_CYCLE.length]!;
            added.push(
              pinned ?? {
                id: ctx.ids.uuid(),
                name,
                color,
                ...(p.type === "status" ? { group: "todo" as const } : {}),
              },
            );
            newOptions.set(p.id, added);
            known.add(name);
          }
        }
      }
      const next = track(pending, row, p);
      if (p.type === "relation" && !input.exact) {
        relationChanges.push({
          row,
          p,
          before: listOf(row.properties[p.key]),
          after: listOf(value),
        });
      }
      if (value === null) delete next[p.key];
      else next[p.key] = value;
    }
    for (const propertyId of u.unset) {
      const p = propertyFor(propertyId);
      const next = track(pending, row, p);
      if (p.type === "relation" && !input.exact) {
        relationChanges.push({ row, p, before: listOf(row.properties[p.key]), after: [] });
      }
      delete next[p.key];
    }
  }

  // Two-way relations: add or remove this row on the other side.
  for (const change of relationChanges) {
    const config = change.p.config.relation;
    if (!config?.twoWay || !config.reversePropertyId) continue;
    const reverse = await dbs(ctx.tx).property(config.reversePropertyId);
    if (!reverse || reverse.deletedAt || reverse.type !== "relation") continue;
    const added = change.after.filter((id) => !change.before.includes(id));
    const removed = change.before.filter((id) => !change.after.includes(id));
    const targets = await loadDocs(
      ctx.tx,
      [...added, ...removed].filter((id) => !pending.has(id)),
    );
    const docOf = (id: string) => pending.get(id)?.doc ?? targets.get(id);
    for (const id of [...added, ...removed]) {
      const target = docOf(id);
      if (!target || target.deletedAt || target.parentId !== reverse.databaseId) continue;
      const next = track(pending, target, reverse);
      const current = listOf(next[reverse.key]);
      let list = added.includes(id)
        ? [...current.filter((x) => x !== change.row.id), change.row.id]
        : current.filter((x) => x !== change.row.id);
      if (reverse.config.relation?.limit === "one" && added.includes(id)) {
        // The target was related to another row: that row loses it, even when the caller cannot
        // see it (a schema rule, not the caller's edit).
        const reassign: SchemaRewrite = {
          databaseId: change.p.databaseId,
          propertyId: change.p.id,
          reason: "relation",
        };
        for (const previous of current.filter((x) => x !== change.row.id)) {
          const known = docOf(previous);
          const other = known ?? (await rewriting(ctx, reassign, () => ctx.tx.docs.get(previous)));
          if (!other || other.deletedAt || other.parentId !== change.p.databaseId) continue;
          if (!known) reassigned.set(other.id, reassign);
          const otherNext = track(pending, other, change.p);
          const remaining = listOf(otherNext[change.p.key]).filter((x) => x !== target.id);
          if (remaining.length > 0) otherNext[change.p.key] = remaining;
          else delete otherNext[change.p.key];
        }
        list = [change.row.id];
      }
      if (list.length > 0) next[reverse.key] = list;
      else delete next[reverse.key];
    }
  }

  for (const [propertyId, added] of newOptions) {
    const p = properties.get(propertyId)!;
    const config = { ...p.config, options: [...(p.config.options ?? []), ...added] };
    await dbs(ctx.tx).updateProperty(p.id, { config, ...stamp(ctx) });
    ctx.inverse("database.updateProperty", { id: p.id, config: p.config });
    changed(ctx, dbDoc.workspaceId, database.id, "options");
  }
  if (newOptions.size > 0) ctx.pin({ newOptions: Object.fromEntries(newOptions) });
  recordValuesInverse(ctx, pending, (id) => reassigned.get(id) ?? ctx.rewrite);
  // Rows reached only through a limit-one reassign are written as that rewrite.
  const own: Pending = new Map();
  const viaRewrite = new Map<string, { rewrite: SchemaRewrite; rows: Pending }>();
  for (const [id, entry] of pending) {
    const rewrite = reassigned.get(id);
    if (!rewrite) {
      own.set(id, entry);
      continue;
    }
    const key = JSON.stringify(rewrite);
    const batch = viaRewrite.get(key) ?? { rewrite, rows: new Map() };
    batch.rows.set(id, entry);
    viaRewrite.set(key, batch);
  }
  const updated = await writeRows(ctx, own);
  for (const { rewrite, rows } of viaRewrite.values()) {
    updated.push(...(await rewriting(ctx, rewrite, () => writeRows(ctx, rows))));
  }
  return { updated };
}

// Rewrites a property's values in every row of the database (option rename/delete, key change,
// type conversion) as one change with an exact inverse.
async function rewriteRows(
  ctx: MutationContext,
  p: DatabaseProperty,
  reason: SchemaRewrite["reason"],
  rewrite: (value: unknown, doc: Document) => { value: unknown } | null,
  key = p.key,
): Promise<number> {
  const info: SchemaRewrite = { databaseId: p.databaseId, propertyId: p.id, reason };
  return rewriting(ctx, info, async () => {
    const { doc: dbDoc } = await requireDatabase(ctx.tx, p.databaseId);
    const rows = await ctx.tx.docs.children(dbDoc.workspaceId, p.databaseId);
    const pending: Pending = new Map();
    for (const row of rows) {
      if (!(p.key in row.properties) && key === p.key) continue;
      const result = rewrite(row.properties[p.key], row);
      if (!result) continue;
      const next = track(pending, row, { id: p.id, key: p.key });
      delete next[p.key];
      if (result.value !== null && result.value !== undefined) next[key] = result.value;
    }
    recordValuesInverse(ctx, pending, () => info);
    return (await writeRows(ctx, pending)).length;
  });
}

// database.changePropertyType, run as a schema rewrite (see the handler).
async function changePropertyType(
  ctx: MutationContext,
  p: DatabaseProperty,
  input: ParsedInputOf<Operations["database.changePropertyType"]>,
) {
  if (p.type === "title" || input.type === "title") {
    throw new LydieError("invalid_input", "The title property keeps its type");
  }
  const store = dbs(ctx.tx);
  const { doc } = await requireDatabase(ctx.tx, p.databaseId);
  const rows = await ctx.tx.docs.children(doc.workspaceId, p.databaseId);
  // A new uniqueId numbers the rows afresh (below) instead of converting their values.
  const convert =
    input.convert && isStoredType(p.type) && isStoredType(input.type) && input.type !== "uniqueId";
  // Unique ids convert as shown ("LYD-12"), except to numbers.
  const from: PropertyType = p.type === "uniqueId" && input.type !== "number" ? "text" : p.type;
  const source = (value: unknown): PropertyValue =>
    from !== p.type && typeof value === "number"
      ? formatUniqueId(value, p.config.prefix)
      : ((value ?? null) as PropertyValue);

  // Options for the new type: kept from a select-like type, built from the values otherwise.
  let config: PropertyConfigInput = input.config ?? { ...p.config };
  if (!input.config && OPTION_TYPES.includes(input.type) && !OPTION_TYPES.includes(p.type)) {
    const names: string[] = [];
    if (convert) {
      for (const row of rows) {
        const v = convertValue(source(row.properties[p.key]), from, input.type);
        for (const n of listOf(v)) if (!names.includes(n)) names.push(n);
      }
    }
    config = {
      ...config,
      options: names.map((name, i) => ({
        id: ctx.ids.uuid(),
        name,
        color: COLOR_CYCLE[i % COLOR_CYCLE.length]!,
      })),
    };
  }
  // Undoing (or redoing) a type change puts the other config back as it was, without checking what
  // it points at: a relation whose target is gone (a folder imported with ids that do not match)
  // must still come back, or the change could never be undone.
  const info: SchemaRewrite = { databaseId: p.databaseId, propertyId: p.id, reason: "type" };
  const restoring =
    ctx.rewrite?.reason === "type" && ctx.rewrite.propertyId === p.id && input.config !== undefined;
  const normalised = restoring
    ? (input.config as PropertyConfig)
    : await normaliseConfig(ctx, p.databaseId, input.type, config);
  const key =
    isStoredType(input.type) === isStoredType(p.type)
      ? p.key
      : uniqueKey(p.key, takenKeys(await store.properties(p.databaseId), input.type, p.id));
  if (p.type !== "uniqueId") checkUniqueIdKey(input.type, key);

  let converted = 0;
  if (convert) {
    const titles = new Map<string, string>();
    if (p.type === "relation") {
      const ids = rows.flatMap((r) => listOf(r.properties[p.key]));
      for (const d of (await loadDocs(ctx.tx, ids)).values()) titles.set(d.id, d.title);
    }
    // Record the exact values first so undo restores them after the type is back.
    converted = await rewriteRows(ctx, p, "type", (value) => {
      const next = convertValue(source(value), from, input.type, {
        titleOf: (id) => titles.get(id) ?? null,
      });
      return JSON.stringify(next) === JSON.stringify(value ?? null) ? null : { value: next };
    });
  }
  await store.updateProperty(p.id, { type: input.type, key, config: normalised, ...stamp(ctx) });
  ctx.inverse(
    "database.changePropertyType",
    { id: p.id, type: p.type, config: p.config, convert: false },
    { rewrite: info },
  );
  if (key !== p.key) ctx.inverse("database.updateProperty", { id: p.id, key: p.key });
  const property = { ...p, type: input.type, key, config: normalised, ...stamp(ctx) };
  // After the type change, so undo restores the previous values while the property can hold them.
  if (input.type === "uniqueId" && p.type !== "uniqueId") {
    converted = await numberRows(ctx, property, "type", false);
  }
  ctx.pin({ config: normalised });
  changed(ctx, p.workspaceId, p.databaseId, "properties");
  return { property, converted };
}

// ---- Handlers

export const databaseHandlers: Handlers<Operations> = {
  async "database.create"(ctx, input) {
    let doc: Document;
    if (input.documentId) {
      doc = await requireLive(ctx.tx, input.documentId);
      if (doc.workspaceId !== input.workspaceId)
        throw new LydieError("invalid_input", "The document is in another workspace");
      const existing = await dbs(ctx.tx).get(doc.id);
      if (existing && !existing.deletedAt)
        throw new LydieError("conflict", `${doc.id} is already a database`);
      if (existing) {
        await dbs(ctx.tx).update(doc.id, { deletedAt: null, ...stamp(ctx) });
        ctx.inverse("database.delete", { id: doc.id });
        changed(ctx, doc.workspaceId, doc.id, "database");
        return definitionOf(ctx.tx, doc.id);
      }
      ctx.inverse("database.delete", { id: doc.id });
    } else {
      const id = input.id ?? ctx.ids.uuid();
      if (await ctx.tx.docs.get(id))
        throw new LydieError("conflict", `Document ${id} already exists`);
      if (input.parentId) {
        const parent = await requireLive(ctx.tx, input.parentId);
        if (parent.workspaceId !== input.workspaceId)
          throw new LydieError("invalid_input", "The parent is in another workspace");
      }
      const sortKey = await placeKey(ctx.tx, input.workspaceId, input.parentId, input);
      doc = {
        id,
        workspaceId: input.workspaceId,
        parentId: input.parentId,
        title: input.title,
        sortKey,
        properties: {},
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
    }
    const base = {
      workspaceId: doc.workspaceId,
      createdAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      ...stamp(ctx),
    };
    await dbs(ctx.tx).insert({
      id: doc.id,
      config: { filter: null, templateIds: [], extra: {} },
      ...base,
    });
    const titlePropertyId = input.titlePropertyId ?? ctx.ids.uuid();
    const title: DatabaseProperty = {
      id: titlePropertyId,
      databaseId: doc.id,
      name: "Name",
      type: "title",
      key: "name",
      config: {},
      sortKey: generateKeyBetween(null, null),
      ...base,
    };
    await dbs(ctx.tx).insertProperty(title);
    const viewId = input.viewId ?? ctx.ids.uuid();
    await dbs(ctx.tx).insertView({
      id: viewId,
      databaseId: doc.id,
      name: VIEW_NAMES[input.viewType],
      type: input.viewType,
      config: ViewConfig.parse({}),
      sortKey: generateKeyBetween(null, null),
      ...base,
    });
    ctx.pin({ titlePropertyId, viewId });
    changed(ctx, doc.workspaceId, doc.id, "database");
    return definitionOf(ctx.tx, doc.id);
  },

  async "database.update"(ctx, input) {
    const { database } = await requireDatabase(ctx.tx, input.id);
    const filter = resolveFilterRefs(input.filter, await dbs(ctx.tx).properties(database.id));
    if (filter !== input.filter) ctx.pin({ filter });
    const config = {
      ...database.config,
      ...(filter !== undefined ? { filter } : {}),
      ...(input.templateIds !== undefined ? { templateIds: input.templateIds } : {}),
    };
    if (JSON.stringify(config) === JSON.stringify(database.config)) return database;
    await dbs(ctx.tx).update(database.id, { config, ...stamp(ctx) });
    ctx.inverse("database.update", {
      id: database.id,
      filter: database.config.filter,
      templateIds: database.config.templateIds,
    });
    changed(ctx, database.workspaceId, database.id, "database");
    return { ...database, config, ...stamp(ctx) };
  },

  async "database.delete"(ctx, input) {
    const database = await dbs(ctx.tx).get(input.id);
    if (!database) throw new LydieError("not_found", `Database ${input.id} not found`);
    if (database.deletedAt) return database;
    const patch = { deletedAt: ctx.now, ...stamp(ctx) };
    await dbs(ctx.tx).update(database.id, patch);
    ctx.inverse("database.restore", { id: database.id });
    changed(ctx, database.workspaceId, database.id, "database");
    return { ...database, ...patch };
  },

  async "database.restore"(ctx, input) {
    const database = await dbs(ctx.tx).get(input.id);
    if (!database) throw new LydieError("not_found", `Database ${input.id} not found`);
    if (!database.deletedAt) return database;
    await requireLive(ctx.tx, database.id);
    const patch = { deletedAt: null, ...stamp(ctx) };
    await dbs(ctx.tx).update(database.id, patch);
    ctx.inverse("database.delete", { id: database.id });
    changed(ctx, database.workspaceId, database.id, "database");
    return { ...database, ...patch };
  },

  async "database.setDefinition"(ctx, input) {
    const before = await definitionOf(ctx.tx, input.id);
    const { database } = before;
    const ws = database.workspaceId;
    const store = dbs(ctx.tx);
    const all = await store.properties(database.id, { includeDeleted: true });
    const titles = input.definition.properties.filter((p) => p.type === "title");
    if (titles.length !== 1)
      throw new LydieError("invalid_input", "A definition needs exactly one title property");
    const keys = (ps: readonly PropertyInput[]) => {
      const seen = new Set<string>();
      for (const p of ps) {
        const ns = isStoredType(p.type)
          ? `note.${p.key}`
          : FILE_KEYS[p.type]
            ? `file.${p.type}`
            : `formula.${p.key}`;
        if (seen.has(ns)) throw new LydieError("invalid_input", `Two properties use ${ns}`);
        seen.add(ns);
      }
    };
    keys(input.definition.properties);

    // Properties: update, restore or create in the given order; delete the rest.
    const propKeys = generateNKeysBetween(null, null, input.definition.properties.length);
    const wanted = new Set(input.definition.properties.map((p) => p.id));
    const normalised: PropertyInput[] = [];
    for (const [i, p] of input.definition.properties.entries()) {
      const existing = all.find((x) => x.id === p.id);
      if (existing && existing.databaseId !== database.id)
        throw new LydieError("invalid_input", `${p.id} belongs to another database`);
      const config = await normaliseConfigLoose(ctx, database.id, p);
      normalised.push({ ...p, config });
      const fields = {
        name: p.name,
        type: p.type,
        key: FILE_KEYS[p.type] ?? p.key,
        config,
        sortKey: propKeys[i]!,
      };
      if (existing) await store.updateProperty(p.id, { ...fields, deletedAt: null, ...stamp(ctx) });
      else {
        await store.insertProperty({
          id: p.id,
          workspaceId: ws,
          databaseId: database.id,
          ...fields,
          createdAt: ctx.now,
          deletedAt: null,
          createdBy: ctx.actorRef,
          ...stamp(ctx),
        });
      }
    }
    for (const p of before.properties) {
      if (!wanted.has(p.id))
        await store.updateProperty(p.id, { deletedAt: ctx.now, ...stamp(ctx) });
    }

    const views = await store.views(database.id, { includeDeleted: true });
    const viewKeys = generateNKeysBetween(null, null, input.definition.views.length);
    const wantedViews = new Set(input.definition.views.map((v) => v.id));
    for (const [i, v] of input.definition.views.entries()) {
      const existing = views.find((x) => x.id === v.id);
      if (existing && existing.databaseId !== database.id)
        throw new LydieError("invalid_input", `${v.id} belongs to another database`);
      const fields = { name: v.name, type: v.type, config: v.config, sortKey: viewKeys[i]! };
      if (existing) await store.updateView(v.id, { ...fields, deletedAt: null, ...stamp(ctx) });
      else {
        await store.insertView({
          id: v.id,
          workspaceId: ws,
          databaseId: database.id,
          ...fields,
          createdAt: ctx.now,
          deletedAt: null,
          createdBy: ctx.actorRef,
          ...stamp(ctx),
        });
      }
    }
    for (const v of before.views) {
      if (!wantedViews.has(v.id))
        await store.updateView(v.id, { deletedAt: ctx.now, ...stamp(ctx) });
    }
    await store.update(database.id, { config: input.definition.config, ...stamp(ctx) });
    // Option ids minted while normalising must replay identically.
    ctx.pin({ definition: { ...input.definition, properties: normalised } });

    ctx.inverse("database.setDefinition", {
      id: database.id,
      definition: {
        config: database.config,
        properties: before.properties.map(({ id, name, type, key, config }): PropertyInput => ({
          id,
          name,
          type,
          key,
          config,
        })),
        views: before.views.map(({ id, name, type, config }): ViewInput => ({
          id,
          name,
          type,
          config,
        })),
      },
    });
    changed(ctx, ws, database.id, "database");
    return definitionOf(ctx.tx, database.id);
  },

  async "database.get"(ctx, input) {
    return definitionOf(ctx.tx, input.id);
  },

  async "database.list"(ctx, input) {
    const out = [];
    for (const database of await dbs(ctx.tx).list(input.workspaceId)) {
      if (database.deletedAt) continue;
      const doc = await ctx.tx.docs.get(database.id);
      if (!doc || doc.deletedAt) continue;
      out.push({ ...database, title: doc.title, parentId: doc.parentId });
    }
    return { databases: out };
  },

  async "database.query"(ctx, input) {
    const def = await definitionOf(ctx.tx, input.databaseId);
    const saved = input.viewId ? resolveView(def.views, input.viewId) : def.views[0];
    const patch = resolveViewConfig(input.view?.config, def.properties);
    const config = ViewConfig.parse({ ...(saved?.config ?? {}), ...(patch ?? {}) });
    const window = resolveWindow(input.window, def.properties);
    const result = await queryView(ctx, def, config, window, input.today ?? localToday());
    return { ...result, hasMore: hasMore(result, window) };
  },

  async "database.addProperty"(ctx, input) {
    const { database, doc } = await requireDatabase(ctx.tx, input.databaseId);
    const store = dbs(ctx.tx);
    const all = await store.properties(database.id);
    if (input.type === "title")
      throw new LydieError("invalid_input", "A database has exactly one title property");
    const id = input.id ?? ctx.ids.uuid();
    if (await store.property(id)) throw new LydieError("conflict", `Property ${id} already exists`);
    const taken = takenKeys(all, input.type);
    if (input.key) checkUniqueIdKey(input.type, input.key);
    else if (input.type === "uniqueId") taken.add("id");
    let key = FILE_KEYS[input.type] ?? input.key ?? uniqueKey(input.name, taken);
    if (input.key && taken.has(input.key))
      throw new LydieError("conflict", `Another property uses the key "${input.key}"`);
    if (FILE_KEYS[input.type]) key = FILE_KEYS[input.type]!;
    let config = await normaliseConfig(ctx, database.id, input.type, input.config);
    const sortKey = placeAmong(all, input);
    const base = {
      workspaceId: doc.workspaceId,
      createdAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      ...stamp(ctx),
    };

    let reverse: DatabaseProperty | null = null;
    const relation = config.relation;
    if (input.type === "relation" && relation?.twoWay) {
      const reverseId = relation.reversePropertyId ?? ctx.ids.uuid();
      config = { ...config, relation: { ...relation, reversePropertyId: reverseId } };
      const target = await requireDatabase(ctx.tx, relation.databaseId);
      // A self-relation's other side lives in this database, after the new property.
      const targetProps =
        target.database.id === database.id
          ? [...all, { id, key, type: "relation" as const, sortKey }].sort((a, b) =>
              a.sortKey < b.sortKey ? -1 : 1,
            )
          : await store.properties(relation.databaseId);
      const name = input.reverseName ?? doc.title;
      reverse = {
        id: reverseId,
        databaseId: relation.databaseId,
        name,
        type: "relation",
        key: uniqueKey(name, takenKeys(targetProps as DatabaseProperty[], "relation")),
        config: {
          relation: { databaseId: database.id, twoWay: true, reversePropertyId: id, limit: "many" },
        },
        sortKey: placeAmong(targetProps, {}),
        ...base,
        workspaceId: target.doc.workspaceId,
      };
    }
    const property: DatabaseProperty = {
      id,
      databaseId: database.id,
      name: input.name,
      type: input.type,
      key,
      config,
      sortKey,
      ...base,
    };
    await store.insertProperty(property);
    ctx.inverse("database.deleteProperty", { id });
    if (reverse) {
      await store.insertProperty(reverse);
      ctx.inverse("database.deleteProperty", { id: reverse.id });
      changed(ctx, reverse.workspaceId, reverse.databaseId, "properties");
    }
    // Existing rows get numbers; undo (recorded later, so run first) takes them away again.
    if (input.type === "uniqueId") await numberRows(ctx, property, "uniqueId", true);
    ctx.pin({ id, key, config, sortKey });
    changed(ctx, doc.workspaceId, database.id, "properties");
    return property;
  },

  async "database.renameProperty"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id);
    if (p.name === input.name) return p;
    await dbs(ctx.tx).updateProperty(p.id, { name: input.name, ...stamp(ctx) });
    ctx.inverse("database.renameProperty", { id: p.id, name: p.name });
    changed(ctx, p.workspaceId, p.databaseId, "properties");
    return { ...p, name: input.name, ...stamp(ctx) };
  },

  async "database.updateProperty"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id);
    await requireDatabase(ctx.tx, p.databaseId);
    const store = dbs(ctx.tx);
    let config = input.config
      ? await normaliseConfig(ctx, p.databaseId, p.type, input.config)
      : p.config;
    // Turning a relation two-way creates the other side.
    const relation = config.relation;
    if (p.type === "relation" && relation?.twoWay && !p.config.relation?.twoWay) {
      const existing = relation.reversePropertyId
        ? await store.property(relation.reversePropertyId)
        : null;
      if (!existing) {
        const reverseId = relation.reversePropertyId ?? ctx.ids.uuid();
        const target = await requireDatabase(ctx.tx, relation.databaseId);
        const { doc } = await requireDatabase(ctx.tx, p.databaseId);
        const targetProps = await store.properties(relation.databaseId);
        await store.insertProperty({
          id: reverseId,
          workspaceId: target.doc.workspaceId,
          databaseId: relation.databaseId,
          name: doc.title,
          type: "relation",
          key: uniqueKey(doc.title, takenKeys(targetProps, "relation")),
          config: {
            relation: {
              databaseId: p.databaseId,
              twoWay: true,
              reversePropertyId: p.id,
              limit: "many",
            },
          },
          sortKey: placeAmong(targetProps, {}),
          createdAt: ctx.now,
          deletedAt: null,
          createdBy: ctx.actorRef,
          ...stamp(ctx),
        });
        ctx.inverse("database.deleteProperty", { id: reverseId });
        config = { ...config, relation: { ...relation, reversePropertyId: reverseId } };
        ctx.pin({ config });
      }
    }
    let key = p.key;
    if (input.key !== undefined && input.key !== p.key && isStoredType(p.type)) {
      checkUniqueIdKey(p.type, input.key);
      const others = await store.properties(p.databaseId);
      if (takenKeys(others, p.type, p.id).has(input.key)) {
        throw new LydieError("conflict", `Another property uses the key "${input.key}"`);
      }
      const newKey = input.key;
      key = newKey;
      // The values move with the key, in every row: one exact inverse (updateProperty back to the
      // old key, itself a rewrite) restores them.
      const info: SchemaRewrite = { databaseId: p.databaseId, propertyId: p.id, reason: "key" };
      await rewriting(ctx, info, async () => {
        const { doc } = await requireDatabase(ctx.tx, p.databaseId);
        const rows = await ctx.tx.docs.children(doc.workspaceId, p.databaseId);
        if (rows.some((r) => newKey in r.properties)) {
          throw new LydieError("conflict", `Rows already have values under "${newKey}"`);
        }
        const moved = rows.filter((r) => p.key in r.properties);
        const updates = moved.map((r) => {
          const next = { ...r.properties, [newKey]: r.properties[p.key]! };
          delete next[p.key];
          return { id: r.id, patch: { properties: next, ...stamp(ctx) } };
        });
        if (ctx.tx.docs.updateMany) await ctx.tx.docs.updateMany(updates);
        else for (const u of updates) await ctx.tx.docs.update(u.id, u.patch);
        for (const u of updates)
          ctx.emit(
            "doc.propertiesChanged",
            doc.workspaceId,
            { id: u.id, properties: u.patch.properties },
            rowHint(ctx, [p.key, newKey]),
          );
      });
    } else if (input.key !== undefined && input.key !== p.key && !FILE_KEYS[p.type]) {
      const others = await store.properties(p.databaseId);
      if (takenKeys(others, p.type, p.id).has(input.key)) {
        throw new LydieError("conflict", `Another formula is called "${input.key}"`);
      }
      key = input.key;
    }
    if (key === p.key && JSON.stringify(config) === JSON.stringify(p.config)) return p;
    await store.updateProperty(p.id, { key, config, ...stamp(ctx) });
    ctx.inverse("database.updateProperty", {
      id: p.id,
      ...(key !== p.key ? { key: p.key } : {}),
      config: p.config,
    });
    changed(ctx, p.workspaceId, p.databaseId, "properties");
    return { ...p, key, config, ...stamp(ctx) };
  },

  async "database.changePropertyType"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id);
    if (p.type === input.type && !input.config) return { property: p, converted: 0 };
    // Reads every row (options built from their values) and converts them: one rewrite.
    const info: SchemaRewrite = { databaseId: p.databaseId, propertyId: p.id, reason: "type" };
    return rewriting(ctx, info, () => changePropertyType(ctx, p, input));
  },

  async "database.moveProperty"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id);
    const all = await dbs(ctx.tx).properties(p.databaseId);
    const sortKey = placeAmong(all, input, p.id);
    if (sortKey === p.sortKey) return p;
    await dbs(ctx.tx).updateProperty(p.id, { sortKey, ...stamp(ctx) });
    ctx.pin({ sortKey });
    ctx.inverse("database.moveProperty", { id: p.id, sortKey: p.sortKey });
    changed(ctx, p.workspaceId, p.databaseId, "properties");
    return { ...p, sortKey, ...stamp(ctx) };
  },

  async "database.deleteProperty"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id, { live: false });
    if (p.deletedAt) return p;
    if (p.type === "title")
      throw new LydieError("invalid_input", "The title property cannot be deleted");
    await dbs(ctx.tx).updateProperty(p.id, { deletedAt: ctx.now, ...stamp(ctx) });
    ctx.inverse("database.restoreProperty", { id: p.id });
    changed(ctx, p.workspaceId, p.databaseId, "properties");
    return { ...p, deletedAt: ctx.now, ...stamp(ctx) };
  },

  async "database.restoreProperty"(ctx, input) {
    const p = await requireProperty(ctx.tx, input.id, { live: false });
    if (!p.deletedAt) return p;
    const live = await dbs(ctx.tx).properties(p.databaseId);
    if (takenKeys(live, p.type).has(p.key) && !FILE_KEYS[p.type]) {
      throw new LydieError("conflict", `Another property now uses the key "${p.key}"`);
    }
    await dbs(ctx.tx).updateProperty(p.id, { deletedAt: null, ...stamp(ctx) });
    ctx.inverse("database.deleteProperty", { id: p.id });
    changed(ctx, p.workspaceId, p.databaseId, "properties");
    return { ...p, deletedAt: null, ...stamp(ctx) };
  },

  async "database.addOption"(ctx, input) {
    const p = await optionProperty(ctx, input.propertyId);
    const options = p.config.options ?? [];
    if (options.some((o) => o.name === input.option.name))
      throw new LydieError("conflict", `Option "${input.option.name}" exists`);
    const option: SelectOption = {
      id: input.option.id ?? ctx.ids.uuid(),
      name: input.option.name,
      color: input.option.color,
      ...(p.type === "status" ? { group: input.option.group ?? "todo" } : {}),
    };
    const next = [...options];
    next.splice(Math.min(input.index ?? next.length, next.length), 0, option);
    await setOptions(ctx, p, next);
    ctx.pin({ option });
    return { ...p, config: { ...p.config, options: next } };
  },

  async "database.updateOption"(ctx, input) {
    const p = await optionProperty(ctx, input.propertyId);
    const options = p.config.options ?? [];
    const option = options.find((o) => o.id === input.optionId);
    if (!option) throw new LydieError("not_found", `Option ${input.optionId} not found`);
    const name = input.name ?? option.name;
    if (name !== option.name && options.some((o) => o.name === name))
      throw new LydieError("conflict", `Option "${name}" exists`);
    const updated: SelectOption = {
      ...option,
      name,
      color: input.color ?? option.color,
      ...(p.type === "status" && input.group ? { group: input.group } : {}),
    };
    let rewritten = 0;
    if (name !== option.name) {
      rewritten = await rewriteRows(ctx, p, "option", (value) => {
        if (value === option.name) return { value: name };
        if (Array.isArray(value) && value.includes(option.name)) {
          return { value: [...new Set(value.map((v) => (v === option.name ? name : v)))] };
        }
        return null;
      });
    }
    await setOptions(
      ctx,
      p,
      options.map((o) => (o.id === option.id ? updated : o)),
    );
    return {
      property: {
        ...p,
        config: { ...p.config, options: options.map((o) => (o.id === option.id ? updated : o)) },
      },
      rewritten,
    };
  },

  async "database.moveOption"(ctx, input) {
    const p = await optionProperty(ctx, input.propertyId);
    const options = [...(p.config.options ?? [])];
    const from = options.findIndex((o) => o.id === input.optionId);
    if (from === -1) throw new LydieError("not_found", `Option ${input.optionId} not found`);
    const [option] = options.splice(from, 1);
    options.splice(Math.min(input.index, options.length), 0, option!);
    if (options.every((o, i) => o.id === p.config.options?.[i]?.id)) return p;
    await setOptions(ctx, p, options);
    return { ...p, config: { ...p.config, options } };
  },

  async "database.deleteOption"(ctx, input) {
    const p = await optionProperty(ctx, input.propertyId);
    const options = p.config.options ?? [];
    const option = options.find((o) => o.id === input.optionId);
    if (!option) throw new LydieError("not_found", `Option ${input.optionId} not found`);
    const rewritten = await rewriteRows(ctx, p, "option", (value) => {
      if (value === option.name) return { value: null };
      if (Array.isArray(value) && value.includes(option.name)) {
        const rest = value.filter((v) => v !== option.name);
        return { value: rest.length > 0 ? rest : null };
      }
      return null;
    });
    const next = options.filter((o) => o.id !== option.id);
    await setOptions(ctx, p, next);
    return { property: { ...p, config: { ...p.config, options: next } }, rewritten };
  },

  async "database.createView"(ctx, input) {
    const { database, doc } = await requireDatabase(ctx.tx, input.databaseId);
    const store = dbs(ctx.tx);
    const id = input.id ?? ctx.ids.uuid();
    if (await store.view(id)) throw new LydieError("conflict", `View ${id} already exists`);
    const views = await store.views(database.id);
    const sortKey = placeAmong(views, input);
    const properties = await store.properties(database.id);
    const config = completeView(
      input.type,
      resolveViewConfig(input.config, properties),
      properties,
    );
    const view: DatabaseView = {
      id,
      workspaceId: doc.workspaceId,
      databaseId: database.id,
      name: input.name,
      type: input.type,
      config,
      sortKey,
      createdAt: ctx.now,
      deletedAt: null,
      createdBy: ctx.actorRef,
      ...stamp(ctx),
    };
    await store.insertView(view);
    ctx.pin({ id, sortKey, config });
    ctx.inverse("database.deleteView", { id });
    changed(ctx, doc.workspaceId, database.id, "views");
    return view;
  },

  async "database.renameView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id);
    if (v.name === input.name) return v;
    await dbs(ctx.tx).updateView(v.id, { name: input.name, ...stamp(ctx) });
    ctx.inverse("database.renameView", { id: v.id, name: v.name });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return { ...v, name: input.name, ...stamp(ctx) };
  },

  async "database.duplicateView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id);
    const store = dbs(ctx.tx);
    const id = input.newId ?? ctx.ids.uuid();
    if (await store.view(id)) throw new LydieError("conflict", `View ${id} already exists`);
    const sortKey = placeAmong(await store.views(v.databaseId), {
      afterId: v.id,
      sortKey: input.sortKey,
    });
    const copy: DatabaseView = {
      ...v,
      id,
      name: input.name ?? `${v.name} copy`,
      sortKey,
      createdAt: ctx.now,
      createdBy: ctx.actorRef,
      ...stamp(ctx),
    };
    await store.insertView(copy);
    ctx.pin({ newId: id, sortKey });
    ctx.inverse("database.deleteView", { id });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return copy;
  },

  async "database.moveView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id);
    const sortKey = placeAmong(await dbs(ctx.tx).views(v.databaseId), input, v.id);
    if (sortKey === v.sortKey) return v;
    await dbs(ctx.tx).updateView(v.id, { sortKey, ...stamp(ctx) });
    ctx.pin({ sortKey });
    ctx.inverse("database.moveView", { id: v.id, sortKey: v.sortKey });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return { ...v, sortKey, ...stamp(ctx) };
  },

  async "database.updateView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id);
    const type = input.type ?? v.type;
    const patch = resolveViewConfig(input.config, await dbs(ctx.tx).properties(v.databaseId));
    if (patch !== input.config) ctx.pin({ config: patch });
    input = { ...input, config: patch };
    const merged = ViewConfig.parse({ ...v.config, ...input.config });
    let config = merged;
    if (type !== v.type) {
      // Fill in only what the caller left out (an undo passes the whole previous config).
      const completed = completeView(type, merged, await dbs(ctx.tx).properties(v.databaseId));
      if (input.config.groupBy === undefined) config = { ...config, groupBy: completed.groupBy };
      if (input.config.layout === undefined) config = { ...config, layout: completed.layout };
    }
    if (type === v.type && JSON.stringify(config) === JSON.stringify(v.config)) return v;
    await dbs(ctx.tx).updateView(v.id, { type, config, ...stamp(ctx) });
    if (type !== v.type) ctx.pin({ config });
    ctx.inverse("database.updateView", { id: v.id, type: v.type, config: v.config });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return { ...v, type, config, ...stamp(ctx) };
  },

  async "database.deleteView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id, { live: false });
    if (v.deletedAt) return v;
    const live = await dbs(ctx.tx).views(v.databaseId);
    if (live.length <= 1) throw new LydieError("conflict", "A database keeps at least one view");
    await dbs(ctx.tx).updateView(v.id, { deletedAt: ctx.now, ...stamp(ctx) });
    ctx.inverse("database.restoreView", { id: v.id });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return { ...v, deletedAt: ctx.now, ...stamp(ctx) };
  },

  async "database.restoreView"(ctx, input) {
    const v = await requireView(ctx.tx, input.id, { live: false });
    if (!v.deletedAt) return v;
    await dbs(ctx.tx).updateView(v.id, { deletedAt: null, ...stamp(ctx) });
    ctx.inverse("database.deleteView", { id: v.id });
    changed(ctx, v.workspaceId, v.databaseId, "views");
    return { ...v, deletedAt: null, ...stamp(ctx) };
  },

  async "database.createRow"(ctx, input) {
    const { database, doc: dbDoc } = await requireDatabase(ctx.tx, input.databaseId);
    const properties = await dbs(ctx.tx).properties(database.id);
    let base: Document["properties"] = {};
    let markdown: string | undefined;
    if (input.templateId) {
      const template = await requireLive(ctx.tx, input.templateId);
      base = { ...template.properties };
      markdown = (await ctx.tx.bodies.get(template.id))?.markdown;
    }
    const values: Record<string, PropertyValue> = {};
    impliedValues(database.config.filter, properties, userOf(ctx), values);
    const view = input.viewId ? await requireView(ctx.tx, input.viewId) : null;
    if (view) {
      impliedValues(view.config.filter, properties, userOf(ctx), values);
      for (const [g, key] of [
        [view.config.groupBy, input.group],
        [view.config.subGroupBy, input.subGroup],
      ] as const) {
        if (!g || key === undefined) continue;
        const p = properties.find((x) => x.id === g.propertyId);
        const v = p && isStoredType(p.type) ? groupValue(p, key, g.dateBucket) : undefined;
        if (p && v !== undefined) values[p.id] = v;
      }
    }
    Object.assign(values, input.values);
    // A new row gets the next unique ids (never the template's), unless the caller gave them.
    for (const p of properties) {
      if (p.type !== "uniqueId") continue;
      delete base[p.key];
      if (values[p.id] === undefined || values[p.id] === null)
        values[p.id] = await nextUniqueId(ctx, database.id, p.key);
    }
    // Values go through setValues (checks, new options, two-way relations); the template's raw
    // properties are copied as they are.
    for (const p of properties) if (p.id in values) delete base[p.key];
    const row = (await ctx.exec("doc.create", {
      workspaceId: dbDoc.workspaceId,
      ...(input.id ? { id: input.id } : {}),
      parentId: database.id,
      title: input.title,
      properties: base,
      ...(markdown !== undefined ? { markdown } : {}),
      ...(input.afterId ? { afterId: input.afterId } : {}),
      ...(input.beforeId ? { beforeId: input.beforeId } : {}),
    })) as Document;
    const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
    if (Object.keys(set).length > 0) {
      await ctx.exec("database.setValues", { databaseId: database.id, rowIds: [row.id], set });
    }
    return requireDoc(ctx.tx, row.id);
  },

  async "database.listTemplates"(ctx, input) {
    const { database } = await requireDatabase(ctx.tx, input.databaseId);
    const docs = await loadDocs(ctx.tx, database.config.templateIds);
    const templates = database.config.templateIds.flatMap((id) => {
      const d = docs.get(id);
      return d && !d.deletedAt ? [d] : [];
    });
    return { templates };
  },

  async "database.setValues"(ctx, input) {
    // Undoing (or redoing) a schema rewrite: every row again, as that rewrite.
    if (ctx.rewrite) return rewriting(ctx, ctx.rewrite, () => setValues(ctx, input));
    return setValues(ctx, input);
  },

  async "database.moveRow"(ctx, input) {
    const row = await requireLive(ctx.tx, input.rowId);
    if (!row.parentId) throw new LydieError("invalid_input", `${row.id} is not a database row`);
    const { database } = await requireDatabase(ctx.tx, row.parentId);
    if (input.afterId || input.beforeId) {
      await ctx.exec("doc.move", {
        id: row.id,
        parentId: database.id,
        ...(input.afterId ? { afterId: input.afterId } : {}),
        ...(input.beforeId ? { beforeId: input.beforeId } : {}),
      });
    }
    if (input.viewId && (input.group !== undefined || input.subGroup !== undefined)) {
      const view = await requireView(ctx.tx, input.viewId);
      const properties = await dbs(ctx.tx).properties(database.id);
      const set: Record<string, PropertyValue> = {};
      const unset: string[] = [];
      for (const [g, key, from] of [
        [view.config.groupBy, input.group, input.fromGroup],
        [view.config.subGroupBy, input.subGroup, input.fromSubGroup],
      ] as const) {
        if (!g || key === undefined) continue;
        const p = properties.find((x) => x.id === g.propertyId);
        if (!p || !isStoredType(p.type)) {
          throw new LydieError(
            "invalid_input",
            "Rows cannot be moved between groups of a computed property",
          );
        }
        if (p.type === "multiSelect" || p.type === "person" || p.type === "relation") {
          const current = listOf(row.properties[p.key]).filter((x) => x !== from);
          const next =
            key === null
              ? from === undefined
                ? []
                : current
              : [...current.filter((x) => x !== key), key];
          if (next.length > 0) set[p.id] = next;
          else unset.push(p.id);
        } else {
          const v = groupValue(p, key, g.dateBucket);
          if (v === undefined) continue;
          if (v === null) unset.push(p.id);
          else set[p.id] = v;
        }
      }
      if (Object.keys(set).length > 0 || unset.length > 0) {
        await ctx.exec("database.setValues", {
          databaseId: database.id,
          rowIds: [row.id],
          set,
          unset,
        });
      }
    }
    return requireDoc(ctx.tx, row.id);
  },

  async "database.duplicateRows"(ctx, input) {
    const { database } = await requireDatabase(ctx.tx, input.databaseId);
    const properties = await dbs(ctx.tx).properties(database.id);
    const relations = properties.filter((p) => p.type === "relation" && p.config.relation?.twoWay);
    const uniqueIds = properties.filter((p) => p.type === "uniqueId");
    const rows: Document[] = [];
    for (const [i, rowId] of input.rowIds.entries()) {
      const row = await requireLive(ctx.tx, rowId);
      if (row.parentId !== database.id)
        throw new LydieError("invalid_input", `${rowId} is not a row of this database`);
      const body = await ctx.tx.bodies.get(row.id);
      const own = { ...row.properties };
      for (const p of [...relations, ...uniqueIds]) delete own[p.key];
      const copy = (await ctx.exec("doc.create", {
        workspaceId: row.workspaceId,
        ...(input.ids?.[i] ? { id: input.ids[i] } : {}),
        parentId: database.id,
        title: row.title,
        properties: own,
        ...(body ? { markdown: body.markdown } : {}),
        afterId: row.id,
      })) as Document;
      const set: Record<string, PropertyValue> = {};
      for (const p of relations)
        if (Array.isArray(row.properties[p.key])) set[p.id] = row.properties[p.key]!;
      for (const p of uniqueIds) set[p.id] = await nextUniqueId(ctx, database.id, p.key);
      if (Object.keys(set).length > 0) {
        await ctx.exec("database.setValues", { databaseId: database.id, rowIds: [copy.id], set });
      }
      rows.push(await requireDoc(ctx.tx, copy.id));
    }
    return { rows };
  },

  async "database.deleteRows"(ctx, input) {
    const { database } = await requireDatabase(ctx.tx, input.databaseId);
    const deletedIds: string[] = [];
    for (const rowId of input.rowIds) {
      const row = await requireDoc(ctx.tx, rowId);
      if (row.parentId !== database.id)
        throw new LydieError("invalid_input", `${rowId} is not a row of this database`);
      const out = (await ctx.exec("doc.delete", { id: rowId })) as { deletedIds: string[] };
      deletedIds.push(...out.deletedIds);
    }
    return { deletedIds, deletedAt: deletedIds.length > 0 ? ctx.now : null };
  },

  async "database.restoreRows"(ctx, input) {
    const { database } = await requireDatabase(ctx.tx, input.databaseId);
    const restoredIds: string[] = [];
    for (const rowId of input.rowIds) {
      const row = await requireDoc(ctx.tx, rowId);
      if (row.parentId !== database.id)
        throw new LydieError("invalid_input", `${rowId} is not a row of this database`);
      if (!row.deletedAt) continue;
      await ctx.exec("doc.restore", { id: rowId });
      restoredIds.push(rowId);
    }
    return { restoredIds };
  },

  // ---- Agent-level (composite) operations. References are resolved and checked before any write.

  async "database.writeRows"(ctx, input) {
    const def = await definitionOf(ctx.tx, input.databaseId);
    const property = resolver(def.properties, "property");
    const rowId = rowResolver(def.properties, () =>
      ctx.tx.docs.children(def.database.workspaceId, def.database.id),
    );
    const plans = [];
    for (const [index, row] of input.rows.entries()) {
      if (row.delete && !row.id) {
        throw new LydieError("invalid_input", `rows[${index}]: delete needs the row's id`);
      }
      let title = row.title;
      const set: Record<string, PropertyValue> = {};
      for (const [ref, value] of Object.entries(row.values)) {
        const p = property(ref);
        if (p.type === "title") title = String(value ?? "");
        else set[p.id] = value;
      }
      const id = row.id === undefined ? undefined : await rowId(row.id);
      plans.push({ row, id, title, set, unset: row.unset.map((ref) => property(ref).id) });
    }
    const written: { id: string; action: WrittenRow["action"] }[] = [];
    for (const { row, id, title, set, unset } of plans) {
      if (row.delete) {
        await ctx.exec("database.deleteRows", { databaseId: input.databaseId, rowIds: [id] });
        written.push({ id: id!, action: "deleted" });
        continue;
      }
      let docId: string;
      if (id) {
        const doc = await requireLive(ctx.tx, id);
        if (doc.parentId !== input.databaseId) {
          throw new LydieError("invalid_input", `${row.id} is not a row of this database`);
        }
        if (title !== undefined && title !== doc.title) {
          await ctx.exec("doc.rename", { id, title });
        }
        if (Object.keys(set).length > 0 || unset.length > 0) {
          await ctx.exec("database.setValues", {
            databaseId: input.databaseId,
            rowIds: [id],
            set,
            unset,
          });
        }
        docId = id;
      } else {
        const doc = (await ctx.exec("database.createRow", {
          databaseId: input.databaseId,
          ...(title !== undefined ? { title } : {}),
          values: set,
        })) as Document;
        docId = doc.id;
      }
      if (row.markdown !== undefined) {
        await ctx.exec("doc.updateBody", { id: docId, markdown: row.markdown });
      }
      written.push({ id: docId, action: id ? "updated" : "created" });
    }
    const unique = def.properties.find((p) => p.type === "uniqueId");
    const rows: WrittenRow[] = [];
    for (const { id, action } of written) {
      const doc = await requireDoc(ctx.tx, id);
      const n = unique ? doc.properties[unique.key] : undefined;
      rows.push({
        id,
        title: doc.title,
        uniqueId: typeof n === "number" ? formatUniqueId(n, unique!.config.prefix) : null,
        action,
      });
    }
    return { rows };
  },

  async "database.changeSchema"(ctx, input) {
    const def = await definitionOf(ctx.tx, input.databaseId);
    const property = resolver(def.properties, "property");
    const updates = input.update.map((u) => ({ ...u, target: property(u.property) }));
    const removed = input.remove.map((ref) => property(ref));
    for (const p of input.add) {
      await ctx.exec("database.addProperty", {
        databaseId: input.databaseId,
        name: p.name,
        type: p.type,
        ...(p.key ? { key: p.key } : {}),
        ...(p.config ? { config: p.config } : {}),
      });
    }
    for (const u of updates) {
      const id = u.target.id;
      if (u.name !== undefined && u.name !== u.target.name) {
        await ctx.exec("database.renameProperty", { id, name: u.name });
      }
      if (u.type !== undefined && u.type !== u.target.type) {
        await ctx.exec("database.changePropertyType", {
          id,
          type: u.type,
          ...(u.config ? { config: u.config } : {}),
        });
        if (u.key !== undefined) await ctx.exec("database.updateProperty", { id, key: u.key });
      } else if (u.key !== undefined || u.config !== undefined) {
        await ctx.exec("database.updateProperty", {
          id,
          ...(u.key !== undefined ? { key: u.key } : {}),
          ...(u.config !== undefined ? { config: u.config } : {}),
        });
      }
    }
    for (const p of removed) await ctx.exec("database.deleteProperty", { id: p.id });
    return outlineOf(await definitionOf(ctx.tx, input.databaseId));
  },

  async "database.changeViews"(ctx, input) {
    const def = await definitionOf(ctx.tx, input.databaseId);
    const view = resolver(def.views, "view");
    const updates = input.update.map((u) => ({ ...u, target: view(u.view) }));
    const removed = input.remove.map((ref) => view(ref));
    for (const v of input.add) {
      await ctx.exec("database.createView", {
        databaseId: input.databaseId,
        name: v.name,
        type: v.type,
        ...(v.config ? { config: v.config } : {}),
      });
    }
    for (const u of updates) {
      const id = u.target.id;
      if (u.name !== undefined && u.name !== u.target.name) {
        await ctx.exec("database.renameView", { id, name: u.name });
      }
      if (u.type !== undefined || u.config !== undefined) {
        await ctx.exec("database.updateView", {
          id,
          ...(u.type !== undefined ? { type: u.type } : {}),
          config: u.config ?? {},
        });
      }
    }
    for (const v of removed) await ctx.exec("database.deleteView", { id: v.id });
    return outlineOf(await definitionOf(ctx.tx, input.databaseId));
  },
};

// Whether rows remain after a window: of the whole result, or of the window's group. A date range
// has no count: a full window may have more.
function hasMore(
  result: { total: number; offset: number; rows: unknown[]; groups: ViewGroup[] },
  window: { limit: number; group?: GroupKey; subGroup?: GroupKey; range?: unknown },
): boolean {
  if (window.range) return result.rows.length >= window.limit && window.limit > 0;
  let total = result.total;
  if (window.group !== undefined) {
    total = result.groups
      .filter(
        (g) =>
          g.key === window.group && (window.subGroup === undefined || g.subKey === window.subGroup),
      )
      .reduce((sum, g) => sum + g.count, 0);
  }
  return result.offset + result.rows.length < total;
}

function outlineOf(def: DatabaseDefinition) {
  return {
    id: def.database.id,
    properties: def.properties.map(({ id, name, type, key }) => ({ id, name, type, key })),
    views: def.views.map(({ id, name, type }) => ({ id, name, type })),
  };
}

async function normaliseConfigLoose(
  ctx: MutationContext,
  databaseId: string,
  p: PropertyInput,
): Promise<PropertyConfig> {
  // Definitions from files may point at databases or properties this workspace does not have
  // (yet); keep such relation/rollup settings instead of rejecting the file.
  try {
    return await normaliseConfig(ctx, databaseId, p.type, p.config);
  } catch (error) {
    if (p.type === "relation" || p.type === "rollup" || p.type === "formula") return p.config;
    throw error;
  }
}

async function optionProperty(ctx: MutationContext, id: string): Promise<DatabaseProperty> {
  const p = await requireProperty(ctx.tx, id);
  if (!OPTION_TYPES.includes(p.type))
    throw new LydieError("invalid_input", `${p.name} has no options`);
  return p;
}

async function setOptions(ctx: MutationContext, p: DatabaseProperty, options: SelectOption[]) {
  const config = { ...p.config, options };
  await dbs(ctx.tx).updateProperty(p.id, { config, ...stamp(ctx) });
  ctx.inverse("database.updateProperty", { id: p.id, config: p.config });
  changed(ctx, p.workspaceId, p.databaseId, "options");
}

// ---- Queries

export async function queryView(
  ctx: QueryContext,
  def: DatabaseDefinition,
  config: ViewConfig,
  window: Parameters<typeof runView>[2],
  today: string,
) {
  const { database } = def;
  const targets: DatabaseProperty[] = [];
  for (const p of def.properties) {
    const id = p.config.rollup?.targetPropertyId;
    if (p.type !== "rollup" || !id) continue;
    const target = await dbs(ctx.tx).property(id);
    if (target && !target.deletedAt) targets.push(target);
  }
  const now = Date.now();
  const me = userOf(ctx);
  const port = dbs(ctx.tx);
  if (port.query) {
    return port.query({
      workspaceId: database.workspaceId,
      databaseId: database.id,
      properties: def.properties,
      targets,
      databaseFilter: database.config.filter,
      templateIds: database.config.templateIds,
      config,
      window,
      me,
      now: new Date(now).toISOString(),
      today,
    });
  }
  const rows = await ctx.tx.docs.children(database.workspaceId, database.id);
  const relationKeys = def.properties.filter((p) => p.type === "relation").map((p) => p.key);
  const ids = rows.flatMap((r) => relationKeys.flatMap((k) => listOf(r.properties[k])));
  const related = new Map<string, RowDoc>();
  for (const d of (await loadDocs(ctx.tx, ids)).values()) if (!d.deletedAt) related.set(d.id, d);
  const vctx: ViewContext = {
    properties: def.properties,
    related,
    targets: new Map(targets.map((t) => [t.id, t])),
    me,
    now,
    today,
  };
  return runView(rows, { config, database: database.config }, window, vctx);
}

export { bucketOf };
