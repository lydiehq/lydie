// Optimistic paint: how an operation that has not committed yet rewrites the rows of the live
// queries that show its result, so the change paints in the frame of the input. Shared by the
// local backend (whose writes take a worker hop) and the remote one (an IPC round trip plus the
// write in the Electron main process). The next real emission reconciles; a failure rolls back.
import { operations } from "@lydie/contract";
import type {
  ChildEntry,
  DatabaseDefinition,
  DatabaseProperty,
  Properties,
  TreeEntry,
} from "@lydie/contract";
import type {
  DatabaseViewItem,
  DatabaseViewParams,
  DocWithBody,
  HistoryState,
  LiveParams,
  LiveQueryName,
  LiveState,
} from "@lydie/plugin-api";

import type { LiveSource } from "./live-registry.ts";

// Rewrites a live query's rows for an operation; null when it does not touch them.
export type Patcher<T> = (rows: readonly T[], op: string, input: unknown) => readonly T[] | null;

// What a patcher may need beyond its rows: a database's properties (value keys by property id).
export type PatchContext = {
  properties(databaseId: string): readonly DatabaseProperty[] | null;
};

// The operations that paint before they commit.
export const OPTIMISTIC_OPS: ReadonlySet<string> = new Set([
  "doc.rename",
  "doc.move",
  "doc.create",
  "doc.delete",
  "doc.setProperties",
  "database.setValues",
  "database.deleteRows",
  "database.updateView",
  "database.renameView",
  "database.renameProperty",
]);

type RenameInput = { id: string; title: string };
type MoveInput = { id: string; parentId: string | null; afterId?: string; beforeId?: string };
type CreateInput = {
  id?: string;
  workspaceId: string;
  teamspaceId?: string | null;
  parentId?: string | null;
  title?: string;
  properties?: Properties;
  afterId?: string;
  beforeId?: string;
};

const renameRows = <T extends { id: string; title: string }>(
  rows: readonly T[],
  input: RenameInput,
) => {
  const index = rows.findIndex((r) => r.id === input.id);
  if (index === -1 || rows[index]!.title === input.title) return null;
  const next = [...rows];
  next[index] = { ...rows[index]!, title: input.title };
  return next;
};

const without = <T extends { id: string }>(rows: readonly T[], id: string) =>
  rows.some((r) => r.id === id) ? rows.filter((r) => r.id !== id) : null;

function insertAt<T extends { id: string }>(
  rows: readonly T[],
  row: T,
  placement: { afterId?: string | undefined; beforeId?: string | undefined },
): T[] {
  const rest = rows.filter((r) => r.id !== row.id);
  let at = rest.length;
  if (placement.beforeId)
    at = Math.max(
      0,
      rest.findIndex((r) => r.id === placement.beforeId),
    );
  else if (placement.afterId) {
    const after = rest.findIndex((r) => r.id === placement.afterId);
    at = after === -1 ? rest.length : after + 1;
  }
  return [...rest.slice(0, at), row, ...rest.slice(at)];
}

// A new document's row, as close to what the database will hold as the client knows.
function newChild(input: CreateInput, sortKey: string): ChildEntry {
  const now = new Date().toISOString();
  return {
    id: input.id!,
    workspaceId: input.workspaceId,
    parentId: input.parentId ?? null,
    title: input.title ?? "Untitled",
    sortKey,
    properties: input.properties ?? {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    childCount: 0,
    ...(input.teamspaceId !== undefined ? { teamspaceId: input.teamspaceId } : {}),
  };
}

// One level of the tree: renames in place; moves leave or join it at the requested position;
// creates join it (with a client-minted id); deletes leave it.
const childrenPatcher =
  (params: LiveParams<"doc.children">): Patcher<ChildEntry> =>
  (rows, op, raw) => {
    const parentId = params.parentId;
    if (op === "doc.rename") return renameRows(rows, raw as RenameInput);
    if (op === "doc.delete") return without(rows, (raw as { id: string }).id);
    if (op === "doc.create") {
      const input = raw as CreateInput;
      if (!input.id || (input.parentId ?? null) !== parentId) return null;
      // A space's top level (hosted) shows only pages created into that space: a teamspace, or
      // (teamspaceId null) a private section.
      if (parentId === null && params.teamspaceId !== undefined) {
        if ((input.teamspaceId ?? null) !== params.teamspaceId) return null;
      }
      const last = rows.at(-1)?.sortKey ?? "";
      return insertAt(rows, newChild(input, `${last}~`), input);
    }
    if (op !== "doc.move") return null;
    const input = raw as MoveInput;
    const index = rows.findIndex((r) => r.id === input.id);
    if (input.parentId !== parentId) return index === -1 ? null : without(rows, input.id);
    if (index === -1) return null;
    return insertAt(rows, rows[index]!, input);
  };

const docGetPatcher: Patcher<DocWithBody> = (rows, op, raw) => {
  const row = rows[0];
  if (!row) return null;
  const doc = row.document;
  const input = raw as { id: string };
  if (doc.id !== input.id) return null;
  if (op === "doc.rename") {
    const title = (raw as RenameInput).title;
    return doc.title === title ? null : [{ ...row, document: { ...doc, title } }];
  }
  if (op === "doc.delete") {
    return [{ ...row, document: { ...doc, deletedAt: new Date().toISOString() } }];
  }
  if (op === "doc.setProperties") {
    const { set = {}, unset = [] } = raw as { set?: Properties; unset?: string[] };
    const properties = { ...doc.properties, ...set };
    for (const key of unset) delete properties[key];
    return [{ ...row, document: { ...doc, properties } }];
  }
  return null;
};

// The flattened tree: renames; a deleted document leaves with its descendants (deeper rows
// right after it).
const treePatcher: Patcher<TreeEntry> = (rows, op, raw) => {
  if (op === "doc.rename") return renameRows(rows, raw as RenameInput);
  if (op !== "doc.delete") return null;
  const index = rows.findIndex((r) => r.id === (raw as { id: string }).id);
  if (index === -1) return null;
  let end = index + 1;
  while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++;
  return [...rows.slice(0, index), ...rows.slice(end)];
};

const searchPatcher: Patcher<{ id: string; title: string }> = (rows, op, raw) => {
  if (op === "doc.rename") return renameRows(rows, raw as RenameInput);
  if (op === "doc.delete") return without(rows, (raw as { id: string }).id);
  return null;
};

type SetValuesInput = {
  databaseId: string;
  rowIds?: readonly string[];
  set?: Record<string, unknown>;
  unset?: readonly string[];
  updates?: readonly { rowId: string; set?: Record<string, unknown>; unset?: readonly string[] }[];
};

const STORED = new Set([
  "text",
  "number",
  "select",
  "multiSelect",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "files",
  "relation",
]);

// A database view's window: value edits, row renames, deletions. Filters, sorts and groups catch
// up when the view re-runs.
export function viewPatcher(
  params: DatabaseViewParams,
  ctx: PatchContext,
): Patcher<DatabaseViewItem> {
  return (rows, op, raw) => {
    if (op === "doc.delete" || op === "database.deleteRows") {
      const ids = new Set(
        op === "doc.delete"
          ? [(raw as { id: string }).id]
          : (raw as { databaseId: string; rowIds: string[] }).databaseId === params.databaseId
            ? (raw as { rowIds: string[] }).rowIds
            : [],
      );
      if (!rows.some((i) => i.kind === "row" && ids.has(i.row.id))) return null;
      return rows.filter((i) => i.kind !== "row" || !ids.has(i.row.id));
    }
    const changes = new Map<string, { set: Record<string, unknown>; unset: readonly string[] }>();
    if (op === "database.setValues") {
      const input = raw as SetValuesInput;
      if (input.databaseId !== params.databaseId) return null;
      for (const id of input.rowIds ?? [])
        changes.set(id, { set: input.set ?? {}, unset: input.unset ?? [] });
      for (const u of input.updates ?? [])
        changes.set(u.rowId, { set: u.set ?? {}, unset: u.unset ?? [] });
    } else if (op !== "doc.rename") return null;
    const byId = new Map((ctx.properties(params.databaseId) ?? []).map((p) => [p.id, p]));
    let changed = false;
    const out = rows.map((item) => {
      if (item.kind !== "row") return item;
      if (op === "doc.rename") {
        const input = raw as RenameInput;
        if (item.row.id !== input.id || item.row.title === input.title) return item;
        changed = true;
        return { ...item, row: { ...item.row, title: input.title } };
      }
      const change = changes.get(item.row.id);
      if (!change) return item;
      const properties = { ...item.row.properties };
      for (const [id, value] of Object.entries(change.set)) {
        const property = byId.get(id);
        if (!property || !STORED.has(property.type)) continue;
        if (value === null || value === undefined) delete properties[property.key];
        else properties[property.key] = value;
      }
      for (const id of change.unset) {
        const property = byId.get(id);
        if (property) delete properties[property.key];
      }
      changed = true;
      return { ...item, row: { ...item.row, properties } };
    });
    return changed ? out : null;
  };
}

// A database's definition: view settings, view and property renames.
const definitionPatcher: Patcher<DatabaseDefinition> = (rows, op, raw) => {
  const def = rows[0];
  if (!def) return null;
  const input = raw as { id: string; name?: string; type?: string; config?: object };
  if (op === "database.updateView" || op === "database.renameView") {
    const index = def.views.findIndex((v) => v.id === input.id);
    if (index === -1) return null;
    const views = [...def.views];
    const view = views[index]!;
    views[index] = {
      ...view,
      ...(input.name ? { name: input.name } : {}),
      ...(input.type ? { type: input.type as typeof view.type } : {}),
      config: { ...view.config, ...(input.config ?? {}) },
    };
    return [{ ...def, views }];
  }
  if (op === "database.renameProperty") {
    const index = def.properties.findIndex((p) => p.id === input.id);
    if (index === -1 || !input.name) return null;
    const properties = [...def.properties];
    properties[index] = { ...properties[index]!, name: input.name };
    return [{ ...def, properties }];
  }
  return null;
};

export function patcherFor(
  name: LiveQueryName,
  params: unknown,
  ctx: PatchContext,
): Patcher<unknown> | undefined {
  switch (name) {
    case "doc.children":
      return childrenPatcher(params as LiveParams<"doc.children">) as Patcher<unknown>;
    case "doc.get":
      return docGetPatcher as Patcher<unknown>;
    case "doc.tree":
      return treePatcher as Patcher<unknown>;
    case "doc.search":
      return searchPatcher as Patcher<unknown>;
    case "database.view":
      return viewPatcher(params as DatabaseViewParams, ctx) as Patcher<unknown>;
    case "database.get":
      return definitionPatcher as Patcher<unknown>;
    default:
      return undefined;
  }
}

// ---- Overlays over any live source (the remote backend)

type Pending = { id: number; op: string; input: unknown; settled: boolean };

export type Overlays = {
  // Starts showing an operation's patch; settle once it is done (ok: until the next real emission
  // of each query, failed: at once).
  begin(op: string, input: unknown): (ok: boolean) => void;
  pending(): readonly Pending[];
  subscribe(listener: () => void): () => void;
};

export function createOverlays(): Overlays {
  let pending: Pending[] = [];
  let next = 1;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    begin(op, input) {
      const entry: Pending = { id: next++, op, input, settled: false };
      pending = [...pending, entry];
      changed();
      return (ok) => {
        if (!ok) {
          pending = pending.filter((p) => p !== entry);
          changed();
          return;
        }
        entry.settled = true;
        // Queries the operation did not change never re-emit: stop applying it after a while.
        setTimeout(() => {
          if (!pending.includes(entry)) return;
          pending = pending.filter((p) => p !== entry);
          changed();
        }, 2000);
      };
    },
    pending: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Shows `source`'s states with the pending operations' patches on top. A real emission after an
// operation settled carries its result, so that operation's patch stops applying to this query.
export function overlaySource<T>(
  source: LiveSource<T>,
  patcher: Patcher<T>,
  overlays: Overlays,
): LiveSource<T> {
  return (emit) => {
    let real: LiveState<T> | null = null;
    const done = new Set<number>();
    let shown: LiveState<T> | null = null;
    // `now`: a change of the pending operations, which happens in the handler of the input that
    // made it, so the patch paints in that task (the registry batches the rest per frame).
    const show = (now = false) => {
      if (!real) return;
      let data = real.data;
      if (!real.isLoading) {
        for (const p of overlays.pending()) {
          if (done.has(p.id)) continue;
          const patched = patcher(data, p.op, p.input);
          if (patched) data = patched;
        }
      }
      const next = data === real.data ? real : { ...real, data };
      if (next === shown) return;
      shown = next;
      emit(next, { now });
    };
    const stop = source((state, options) => {
      real = state;
      for (const p of overlays.pending()) if (p.settled) done.add(p.id);
      show(options?.now);
    });
    const off = overlays.subscribe(() => {
      // Patches of operations that left the list (failed, or expired) stop applying.
      const live = new Set(overlays.pending().map((p) => p.id));
      for (const id of done) if (!live.has(id)) done.delete(id);
      show(true);
    });
    return () => {
      off();
      stop();
    };
  };
}

// ---- The undo label of a change that has painted but not committed (LYD-259)

// The undo label an operation will record, or null when it records none (queries, history: false).
export function recordedLabel(
  id: string,
  options: { history?: boolean; label?: string } | undefined,
): string | null {
  const op = (operations as Record<string, { kind: string; summary: string; undo?: unknown }>)[id];
  // `undo: { none }` operations record no step; composites record their parts' inverses.
  const notUndoable = typeof op?.undo === "object" && op.undo !== null;
  if (!op || op.kind !== "mutation" || options?.history === false || notUndoable) return null;
  return options?.label ?? op.summary;
}

type HistorySource = {
  state(scope?: string): HistoryState;
  subscribe(listener: (scope: string) => void): () => void;
};

// The change is on screen before the runtime records its undo step, so for that moment the real
// history still names the step before it. While a recorded operation is in flight, its scope
// reports it as the next undo (undo waits for it anyway).
export function pendingHistory(base: HistorySource) {
  const pending = new Map<string, string[]>();
  const shown = new Map<string, { real: HistoryState; label: string; state: HistoryState }>();
  const listeners = new Set<(scope: string) => void>();
  const notify = (scope: string) => {
    for (const listener of [...listeners]) listener(scope);
  };
  return {
    // Returns the function to call once the step is recorded (or the operation failed).
    begin(scope: string, label: string): () => void {
      const labels = [...(pending.get(scope) ?? []), label];
      pending.set(scope, labels);
      notify(scope);
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        const rest = (pending.get(scope) ?? []).filter((l, i, all) => i !== all.indexOf(label));
        if (rest.length) pending.set(scope, rest);
        else pending.delete(scope);
        notify(scope);
      };
    },
    state(scope = "default"): HistoryState {
      const real = base.state(scope);
      const label = pending.get(scope)?.at(-1);
      if (label === undefined) return real;
      // Stable per (real state, label), for useSyncExternalStore.
      const cached = shown.get(scope);
      if (cached && cached.real === real && cached.label === label) return cached.state;
      const state = { ...real, canUndo: true, undoLabel: label, canRedo: false, redoLabel: null };
      shown.set(scope, { real, label, state });
      return state;
    },
    subscribe(listener: (scope: string) => void) {
      listeners.add(listener);
      const off = base.subscribe(listener);
      return () => {
        listeners.delete(listener);
        off();
      };
    },
  };
}
