// Table changes for every live query of a store, and the guards they read (StoreQuery.guard).
//
// One listener per set of tables, not one per query: a commit reaches every live query in the same
// task, so the guards of all the queries it touches are read in one statement (one round trip to
// the database worker) instead of each query re-running. Typing in a note then costs one small
// read plus the queries whose documents changed, not every open `doc.get` and tree level.
import type { CommonPowerSyncDatabase } from "@powersync/common";

import type { Guard } from "./queries.ts";

export type Changes = {
  // `onChange` gets the tables (PowerSync's names, `documents`) of `tables` a commit changed.
  watch(tables: readonly string[], onChange: (changed: readonly string[]) => void): () => void;
  // The guard's current value, read together with the others asked for in this task.
  read(guard: Guard): Promise<string>;
  close(): void;
};

// Guards per statement: each is a scalar subquery with its own parameters.
const BATCH = 100;

// `known`: the tables live queries usually read, listened to together from the first watch.
export function createChanges(db: CommonPowerSyncDatabase, known: readonly string[]): Changes {
  const watchers = new Set<{ tables: ReadonlySet<string>; onChange: (t: string[]) => void }>();
  const listened = new Set<string>();
  const listeners: (() => void)[] = [];
  let pending: { guard: Guard; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];

  const dispatch = (changedTables: readonly string[]) => {
    // PowerSync reports its internal table names (ps_data_local__documents, …).
    const changed = changedTables.map((t) => t.replace(/^ps_data(_local)?__/, ""));
    for (const watcher of [...watchers]) {
      const hit = changed.filter((t) => watcher.tables.has(t));
      if (hit.length > 0) watcher.onChange(hit);
    }
  };

  const flush = async () => {
    const batch = pending;
    pending = [];
    for (let at = 0; at < batch.length; at += BATCH) {
      const chunk = batch.slice(at, at + BATCH);
      try {
        const row = await db.get<Record<string, unknown>>(
          `SELECT ${chunk.map((x, i) => `(${x.guard.sql}) AS g${i}`).join(", ")}`,
          chunk.flatMap((x) => [...x.guard.parameters]),
        );
        chunk.forEach((x, i) => x.resolve(String(row[`g${i}`])));
      } catch (error) {
        for (const x of chunk) x.reject(error);
      }
    }
  };

  return {
    watch(tables, onChange) {
      const wanted = listened.size === 0 ? [...new Set([...known, ...tables])] : tables;
      const missing = wanted.filter((t) => !listened.has(t));
      if (missing.length > 0) {
        for (const t of missing) listened.add(t);
        // A listener is never replaced (that could drop a change it holds): new tables get their own.
        listeners.push(
          db.onChange(
            { onChange: (event) => dispatch(event.changedTables) },
            { tables: missing, throttleMs: 0 },
          ),
        );
      }
      const watcher = { tables: new Set(tables), onChange };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    read(guard) {
      return new Promise((resolve, reject) => {
        pending.push({ guard, resolve, reject });
        if (pending.length === 1) queueMicrotask(() => void flush());
      });
    },
    close() {
      for (const off of listeners) off();
      listeners.length = 0;
      watchers.clear();
    },
  };
}
