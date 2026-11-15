import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRuntime } from "@lydie/runtime";
import type { Runtime } from "@lydie/runtime";

import { openNodeStore } from "./node.ts";
import type { StoreMode } from "./schema.ts";
import type { LiveQuery, Store } from "./store.ts";

export type TestStore = { store: Store; runtime: Runtime; dir: string; path: string };

const open: TestStore[] = [];

export async function openTestStore(mode: StoreMode = "local"): Promise<TestStore> {
  const dir = mkdtempSync(join(tmpdir(), "lydie-store-"));
  const path = join(dir, "workspace.sqlite");
  const store = await openNodeStore({ path, mode });
  const runtime = createRuntime({ ...store.ports, actor: { type: "user", id: "u1" } });
  const handle = { store, runtime, dir, path };
  open.push(handle);
  return handle;
}

export async function closeTestStores(): Promise<void> {
  for (const { store, dir } of open.splice(0)) {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// Resolves with the watched query's data once it satisfies `predicate`: immediately if the loaded
// state already does (a differential watch does not emit a first result equal to its placeholder),
// otherwise on a later emission.
export function nextData<T>(
  watched: {
    readonly state: { isLoading: boolean; data: T };
    registerListener(l: {
      onData?: (data: T) => void;
      onStateChange?: (state: { isLoading: boolean; data: T }) => void;
    }): () => void;
  },
  predicate: (data: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = (state: { isLoading: boolean; data: T }) => {
      if (state.isLoading || !predicate(state.data)) return false;
      clearTimeout(timer);
      dispose();
      resolve(state.data);
      return true;
    };
    const timer = setTimeout(() => {
      dispose();
      reject(new Error("Timed out waiting for watched query data"));
    }, timeoutMs);
    const dispose = watched.registerListener({ onStateChange: check });
    check(watched.state);
  });
}

// The error a promise rejects with. Use instead of `expect(p).rejects`: Bun's matcher waits for the
// promise without running macrotasks, so a promise settled by PowerSync's worker never settles there.
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject");
}

// Like `nextData`, for `store.live(...)`.
export function nextLive<T>(
  live: LiveQuery<T>,
  predicate: (data: readonly T[]) => boolean,
  timeoutMs = 3000,
): Promise<readonly T[]> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (live.state.isLoading || !predicate(live.state.data)) return;
      clearTimeout(timer);
      dispose();
      resolve(live.state.data);
    };
    const timer = setTimeout(() => {
      dispose();
      reject(new Error("Timed out waiting for live query data"));
    }, timeoutMs);
    const dispose = live.subscribe(check);
    check();
  });
}
