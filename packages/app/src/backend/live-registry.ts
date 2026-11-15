import type { LiveHandle, LiveState } from "@lydie/plugin-api";

// A running query: `start` begins delivering states and returns a stop function. `now` skips the
// registry's batching: an optimistic patch is made in an input's handler and must paint in that
// task, not a frame later (LYD-319).
export type LiveSource<T> = (
  emit: (state: LiveState<T>, options?: { now?: boolean }) => void,
) => () => void;

const LOADING: LiveState<never> = Object.freeze({
  data: Object.freeze([]) as readonly never[],
  isLoading: true,
  error: undefined,
});

export type LiveRegistry = {
  // `lingerMs` overrides the registry's for this query (windows of a scrolled list linger less).
  get<T>(key: string, source: () => LiveSource<T>, options?: { lingerMs?: number }): LiveHandle<T>;
  // The running query with this key, if any (does not start one).
  peek<T>(key: string): LiveHandle<T> | undefined;
  size(): number;
  close(): void;
};

// Dedupes live queries by key, starts them on the first subscriber, and keeps them running for
// `lingerMs` after the last one leaves so a remount (a tab coming back) is instant. `schedule`
// batches listener notifications (per frame in a browser).
export function createLiveRegistry(
  options: { lingerMs?: number; schedule?: (flush: () => void) => void } = {},
): LiveRegistry {
  const lingerMs = options.lingerMs ?? 10_000;
  const schedule = options.schedule;
  const handles = new Map<string, LiveHandle<unknown> & { stop(): void }>();

  function create<T>(key: string, source: LiveSource<T>, linger = lingerMs) {
    let state: LiveState<T> = LOADING;
    let stop: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    const listeners = new Set<() => void>();

    const notify = () => {
      pending = false;
      for (const listener of [...listeners]) listener();
    };
    const emit = (next: LiveState<T>, emitOptions?: { now?: boolean }) => {
      if (next === state) return;
      state = next;
      if (!schedule || emitOptions?.now) return notify();
      if (pending) return;
      pending = true;
      schedule(() => {
        if (pending) notify();
      });
    };
    const shutdown = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      stop?.();
      stop = null;
      state = LOADING;
      handles.delete(key);
    };

    const handle = {
      key,
      getSnapshot: () => state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (!stop) stop = source(emit);
        return () => {
          listeners.delete(listener);
          if (listeners.size > 0 || timer) return;
          if (linger <= 0) return shutdown();
          timer = setTimeout(shutdown, linger);
        };
      },
      stop: shutdown,
    };
    return handle;
  }

  return {
    get<T>(key: string, source: () => LiveSource<T>, options?: { lingerMs?: number }) {
      let handle = handles.get(key);
      if (!handle) {
        handle = create(key, source(), options?.lingerMs) as unknown as LiveHandle<unknown> & {
          stop(): void;
        };
        handles.set(key, handle);
      }
      return handle as unknown as LiveHandle<T>;
    },
    peek: <T>(key: string) => handles.get(key) as unknown as LiveHandle<T> | undefined,
    size: () => handles.size,
    close() {
      for (const handle of [...handles.values()]) handle.stop();
    },
  };
}

// Stable key for a query name and JSON params (object keys sorted, undefined dropped).
export function liveKey(name: string, params: unknown): string {
  return `${name}:${stableJson(params)}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

// Keeps unchanged rows (by key, compared as JSON) as the same objects as in `previous`, and returns
// `previous` itself when nothing changed. For sources that produce fresh objects each run.
export function stabilize<T>(
  previous: readonly T[],
  next: readonly T[],
  key: (row: T) => string,
): readonly T[] {
  const old = new Map<string, { row: T; json: string }>();
  for (const row of previous) old.set(key(row), { row, json: JSON.stringify(row) });
  let same = previous.length === next.length;
  const out = next.map((row, i) => {
    const hit = old.get(key(row));
    const kept = hit && hit.json === JSON.stringify(row) ? hit.row : row;
    if (kept !== previous[i]) same = false;
    return kept;
  });
  return same ? previous : out;
}

// Per-frame scheduling where there are frames; a microtask elsewhere (tests, Node).
export function frameScheduler(): (flush: () => void) => void {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
    .requestAnimationFrame;
  if (typeof raf === "function") return (flush) => raf(flush);
  return (flush) => queueMicrotask(flush);
}
