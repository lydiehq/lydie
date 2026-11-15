import { expect, it } from "bun:test";

import { MARKDOWN_EXTRACT_VERSION, reextractIfStale } from "./extract.ts";

function fakes(stored: string | null) {
  const meta = new Map<string, string>();
  if (stored !== null) meta.set("extract_version", stored);
  const runs: string[] = [];
  const store = {
    meta: {
      get: async (key: string) => meta.get(key) ?? null,
      set: async (key: string, value: string) => void meta.set(key, value),
    },
  };
  const runtime = {
    reindexBodies: async (workspaceId: string) => {
      runs.push(workspaceId);
      return { documents: 0 };
    },
  };
  return { store, runtime, runs, meta };
}

it("re-extracts a database indexed by another version, then records this one", async () => {
  const { store, runtime, runs, meta } = fakes("0");
  expect(await reextractIfStale(store, runtime, "ws")).toBe(true);
  expect(runs).toEqual(["ws"]);
  expect(meta.get("extract_version")).toBe(MARKDOWN_EXTRACT_VERSION);
  expect(await reextractIfStale(store, runtime, "ws")).toBe(false);
  expect(runs).toEqual(["ws"]);
});

it("re-extracts a database from before versions were recorded", async () => {
  const { store, runtime, runs } = fakes(null);
  expect(await reextractIfStale(store, runtime, "ws")).toBe(true);
  expect(runs).toEqual(["ws"]);
});

it("keeps the old version when re-extracting fails, so the next open tries again", async () => {
  const { store, meta } = fakes("0");
  const failing = {
    reindexBodies: async () => {
      throw new Error("locked");
    },
  };
  await expect(reextractIfStale(store, failing, "ws")).rejects.toThrow("locked");
  expect(meta.get("extract_version")).toBe("0");
});
