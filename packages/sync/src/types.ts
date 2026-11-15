// Shapes this package shares with the rest of the client. `@lydie/sync` may import only
// `@lydie/store` and `@lydie/sdk` (client/scripts/check-boundaries.ts), so contract and platform
// types it needs are restated structurally here; they are assignment-compatible with the originals.
import type { Store } from "@lydie/store";

// `AppliedOperation` from @lydie/contract, as the store's operation log returns it.
export type AppliedOperation = Awaited<ReturnType<Store["oplog"]["list"]>>[number];

export type UserActor = { type: "user"; id: string };

// `{ error: { code, message, hint?, details? } }` from @lydie/contract.
export type ErrorBody = { code: string; message: string; hint?: string; details?: unknown };

// `SecretStorage` from @lydie/platform (keychain on desktop, best available on the web).
export type SecretStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

// Plain key/value storage for non-secret state (scope preference, hand-off checkpoints).
// `SecretStorage` satisfies it.
export type KeyValueStorage = SecretStorage;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Content-addressed bytes, `Blob` from @lydie/runtime (key = lowercase hex SHA-256).
export type BlobPort = {
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  has?(key: string): Promise<boolean>;
};

export type Listener<T> = (value: T) => void;

// A tiny observable value: `get` is synchronous and returns the same object until it changes, so
// it fits `useSyncExternalStore`.
export type Observable<T> = {
  get(): T;
  subscribe(listener: Listener<T>): () => void;
};

export function createObservable<T>(initial: T, equal: (a: T, b: T) => boolean = Object.is) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set(next: T) {
      if (equal(value, next)) return;
      value = next;
      for (const listener of [...listeners]) listener(value);
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const jsonEqual = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
