import { LydieError } from "@lydie/contract";
import type { InverseStep } from "@lydie/contract";

// Undo/redo stacks, one pair per scope (a window or tab id), in memory. Undo and redo run ordinary
// operations (the recorded inverses), so they sync and journal like any other change. The durable
// record is the history journal in the database; these stacks are just the user's Cmd+Z.

export type HistoryStep = {
  // Group id of the transaction this step undoes.
  id: string;
  label: string;
  scope: string;
  // Operations to run, in order.
  inverse: InverseStep[];
  // Journal entries this step undoes (marked undone when it runs).
  entryIds: string[];
  at: number;
  coalesce?: string;
};

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

export type History = {
  // Undo the last step of a scope. Resolves false when there was nothing to undo. If the inverse
  // can no longer apply (for example the document was purged), the step is dropped and the error
  // (a LydieError "conflict") is thrown.
  undo(scope?: string): Promise<boolean>;
  redo(scope?: string): Promise<boolean>;
  canUndo(scope?: string): boolean;
  canRedo(scope?: string): boolean;
  // Stable object per state, so it can back `useSyncExternalStore`.
  state(scope?: string): HistoryState;
  // Called with the scope whose stacks changed.
  subscribe(listener: (scope: string) => void): () => void;
  clear(scope?: string): void;
  // Used by the runtime after each operation or transaction.
  record(step: HistoryStep): void;
};

type Stacks = { undo: HistoryStep[]; redo: HistoryStep[]; state: HistoryState };

const EMPTY: HistoryState = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };

export function createHistory(options: {
  limit: number;
  coalesceMs: number;
  // Runs a step's inverse in one transaction; returns the step that reverses it (for redo/undo).
  run(step: HistoryStep, scope: string): Promise<HistoryStep | null>;
}): History {
  const scopes = new Map<string, Stacks>();
  const listeners = new Set<(scope: string) => void>();
  // Undo and redo run one at a time so two quick Cmd+Z presses apply in order.
  let queue: Promise<unknown> = Promise.resolve();

  const stacks = (scope: string): Stacks => {
    let s = scopes.get(scope);
    if (!s) scopes.set(scope, (s = { undo: [], redo: [], state: EMPTY }));
    return s;
  };

  const changed = (scope: string) => {
    const s = stacks(scope);
    s.state = {
      canUndo: s.undo.length > 0,
      canRedo: s.redo.length > 0,
      undoLabel: s.undo.at(-1)?.label ?? null,
      redoLabel: s.redo.at(-1)?.label ?? null,
    };
    for (const listener of listeners) listener(scope);
  };

  const push = (list: HistoryStep[], step: HistoryStep) => {
    list.push(step);
    if (list.length > options.limit) list.shift();
  };

  function move(direction: "undo" | "redo", scope: string): Promise<boolean> {
    const run = queue.then(async () => {
      const s = stacks(scope);
      const step = s[direction].pop();
      if (!step) return false;
      let reverse: HistoryStep | null;
      try {
        reverse = await options.run(step, scope);
      } catch (error) {
        changed(scope);
        throw new LydieError("conflict", `Cannot ${direction} "${step.label}": the data changed`, {
          hint: "The step was removed from the history.",
          details: { cause: error instanceof Error ? error.message : String(error) },
        });
      }
      if (reverse) push(direction === "undo" ? s.redo : s.undo, { ...reverse, label: step.label });
      changed(scope);
      return true;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    undo: (scope = "default") => move("undo", scope),
    redo: (scope = "default") => move("redo", scope),
    canUndo: (scope = "default") => stacks(scope).undo.length > 0,
    canRedo: (scope = "default") => stacks(scope).redo.length > 0,
    state: (scope = "default") => scopes.get(scope)?.state ?? EMPTY,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear(scope) {
      for (const key of scope ? [scope] : [...scopes.keys()]) {
        scopes.delete(key);
        for (const listener of listeners) listener(key);
      }
    },
    record(step) {
      const s = stacks(step.scope);
      const top = s.undo.at(-1);
      if (
        step.coalesce &&
        top?.coalesce === step.coalesce &&
        step.at - top.at <= options.coalesceMs
      ) {
        // Run the newer inverse first, then the older one: the result is the state before both.
        s.undo[s.undo.length - 1] = {
          ...top,
          inverse: [...step.inverse, ...top.inverse],
          entryIds: [...top.entryIds, ...step.entryIds],
          at: step.at,
        };
      } else {
        push(s.undo, step);
      }
      s.redo = [];
      changed(step.scope);
    },
  };
}

// Aspects of an entity an inverse operation restores. Two changes conflict when they touch the
// same entity and the same aspect, or either one touches "*" (existence: create, delete, restore).
const ASPECTS: Record<string, (input: Record<string, unknown>) => string[]> = {
  "doc.rename": () => ["title"],
  "doc.move": () => ["position"],
  "doc.updateBody": () => ["body"],
  "doc.restoreVersion": () => ["body"],
  "doc.setProperties": (input) =>
    [
      ...Object.keys((input.set as Record<string, unknown> | undefined) ?? {}),
      ...((input.unset as string[] | undefined) ?? []),
    ].map((key) => `properties.${key}`),
  "thread.edit": () => ["body"],
  "thread.setAnchor": () => ["anchor"],
  "thread.resolve": () => ["resolved"],
  "database.update": () => ["config"],
  "database.setDefinition": () => ["definition"],
  "database.renameProperty": () => ["name"],
  "database.updateProperty": () => ["config"],
  "database.changePropertyType": () => ["config"],
  "database.moveProperty": () => ["position"],
  "database.renameView": () => ["name"],
  "database.updateView": () => ["config"],
  "database.moveView": () => ["position"],
};

// `database.setValues` names its rows inside the input: one touch per row and property.
function rowValueTouches(input: Record<string, unknown>): string[] {
  type Update = { rowId: string; set?: Record<string, unknown>; unset?: string[] };
  const updates: Update[] = Array.isArray(input.updates)
    ? (input.updates as Update[])
    : ((input.rowIds as string[] | undefined) ?? []).map((rowId) => ({
        rowId,
        set: input.set as Record<string, unknown> | undefined,
        unset: input.unset as string[] | undefined,
      }));
  return updates.flatMap((u) =>
    [...Object.keys(u.set ?? {}), ...(u.unset ?? [])].map((p) => `${u.rowId}|properties.${p}`),
  );
}

// `<entity id>|<aspect>` for each entity a journal entry changed, derived from its inverse (which
// names exactly what it restores) or, for changes that cannot be undone, from its input.
export function touchesOf(
  operation: string,
  input: unknown,
  inverse: readonly InverseStep[] | null,
): string[] {
  const out = new Set<string>();
  const add = (op: string, value: unknown) => {
    const record = (value ?? {}) as Record<string, unknown>;
    if (op === "database.setValues") {
      for (const touch of rowValueTouches(record)) out.add(touch);
      return;
    }
    if (typeof record.id !== "string") return;
    for (const aspect of ASPECTS[op]?.(record) ?? ["*"]) out.add(`${record.id}|${aspect}`);
  };
  if (inverse && inverse.length > 0) for (const step of inverse) add(step.op, step.input);
  else add(operation, input);
  return [...out];
}

export function touchesOverlap(a: Iterable<string>, b: Iterable<string>): boolean {
  const index = new Map<string, Set<string>>();
  for (const touch of a) {
    const [id = "", aspect = ""] = touch.split("|");
    let aspects = index.get(id);
    if (!aspects) index.set(id, (aspects = new Set()));
    aspects.add(aspect);
  }
  for (const touch of b) {
    const [id = "", aspect = ""] = touch.split("|");
    const aspects = index.get(id);
    if (aspects && (aspect === "*" || aspects.has("*") || aspects.has(aspect))) return true;
  }
  return false;
}
