import { describe, expect, test } from "bun:test";

import type { AppApi, Backend, DocWithBody, LiveState } from "@lydie/plugin-api";

import { favoritesOf, watchFavoriteDocs } from "./favorites.ts";

function fakeApp(subscribable: boolean) {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const app = {
    backend: { info: { workspaceId: "ws" } },
    storage: {
      get: (key: string) => values.get(key) ?? null,
      set(key: string, value: unknown) {
        values.set(key, value);
        for (const listener of listeners.get(key) ?? []) listener();
      },
      ...(subscribable
        ? {
            subscribe(key: string, listener: () => void) {
              if (!listeners.has(key)) listeners.set(key, new Set());
              listeners.get(key)!.add(listener);
              return () => listeners.get(key)!.delete(listener);
            },
          }
        : {}),
    },
  } as unknown as AppApi;
  return { app, values };
}

describe("favorites", () => {
  for (const subscribable of [true, false]) {
    test(`toggle keeps the order added and tells subscribers (storage.subscribe: ${subscribable})`, () => {
      const { app, values } = fakeApp(subscribable);
      const favorites = favoritesOf(app);
      let calls = 0;
      const off = favorites.subscribe(() => calls++);
      expect(favorites.ids()).toEqual([]);
      expect(favorites.toggle("a")).toBe(true);
      expect(favorites.toggle("b")).toBe(true);
      expect(favorites.ids()).toEqual(["a", "b"]);
      expect(favorites.has("a")).toBe(true);
      expect(favorites.toggle("a")).toBe(false);
      expect(favorites.ids()).toEqual(["b"]);
      expect(values.get("document-tree:favorites:ws")).toEqual(["b"]);
      expect(calls).toBe(3);
      expect(favoritesOf(app)).toBe(favorites);
      off();
    });
  }

  test("reads what was stored, ignoring anything that is not an id", () => {
    const { app, values } = fakeApp(true);
    values.set("document-tree:favorites:ws", ["a", 3, null, "b"]);
    expect(favoritesOf(app).ids()).toEqual(["a", "b"]);
  });

  test("shows live documents only, in order, with a stable snapshot", () => {
    const state = (document: object | null): LiveState<DocWithBody> => ({
      data: document ? [{ document, body: null } as DocWithBody] : [],
      isLoading: false,
      error: undefined,
    });
    const states: Record<string, LiveState<DocWithBody>> = {
      a: state({ id: "a", deletedAt: null }),
      trashed: state({ id: "trashed", deletedAt: "2026-11-13T00:00:00.000Z" }),
      gone: state(null),
      b: state({ id: "b", deletedAt: null }),
    };
    const listeners = new Set<() => void>();
    const backend = {
      live: (_name: string, { id }: { id: string }) => ({
        key: id,
        getSnapshot: () => states[id]!,
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
    } as unknown as Backend;
    const watch = watchFavoriteDocs(backend, ["a", "trashed", "gone", "b"]);
    let calls = 0;
    const off = watch.subscribe(() => calls++);
    const first = watch.docs();
    expect(first.map((d) => d.id)).toEqual(["a", "b"]);
    expect(watch.docs()).toBe(first);

    // Restored from the trash: back in its place.
    states.trashed = state({ id: "trashed", deletedAt: null });
    for (const listener of [...listeners]) listener();
    expect(calls).toBeGreaterThan(0);
    expect(watch.docs().map((d) => d.id)).toEqual(["a", "trashed", "b"]);
    off();
    expect(listeners.size).toBe(0);
  });
});
