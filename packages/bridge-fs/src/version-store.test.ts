// Snapshot files: written at once, then saves of the same document collected for a while.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { VersionRecord } from "@lydie/runtime";

import { cleanup, tempDir } from "./test-utils.ts";
import { createFileVersionStore } from "./version-store.ts";

afterEach(cleanup);

const DOC = "0194c2a0-0000-7000-8000-000000000001";

function record(id: string): VersionRecord {
  const at = "2026-11-16T10:00:00.000Z";
  return {
    id,
    documentId: DOC,
    kind: "auto",
    authors: ["local"],
    restoredFrom: null,
    sizeBytes: 1,
    createdAt: at,
    startedAt: at,
    contentKey: id,
  };
}

const listed = (dir: string) =>
  (
    JSON.parse(readFileSync(join(dir, `${DOC}.json`), "utf8")) as { records: VersionRecord[] }
  ).records.map((r) => r.id);

test("the first save is written at once, later ones together after the delay", async () => {
  const dir = tempDir();
  const store = createFileVersionStore(dir, { delayMs: 50 });
  await store.save(DOC, [record("v1")], { v1: "one" });
  expect(listed(dir)).toEqual(["v1"]);
  expect(readFileSync(join(dir, DOC, "v1.md"), "utf8")).toBe("one");

  // The newest version follows the body, then a second one starts.
  await store.save(DOC, [record("v1")], { v1: "one, edited" });
  await store.save(DOC, [record("v1"), record("v2")], { v2: "two" });
  expect(listed(dir)).toEqual(["v1"]);
  expect(existsSync(join(dir, DOC, "v2.md"))).toBe(false);
  // Read from memory meanwhile.
  expect((await store.list(DOC)).map((r) => r.id)).toEqual(["v1", "v2"]);
  expect(await store.read(DOC, "v1")).toBe("one, edited");
  expect(await store.read(DOC, "v2")).toBe("two");

  await sleep(120);
  expect(listed(dir)).toEqual(["v1", "v2"]);
  expect(readFileSync(join(dir, DOC, "v1.md"), "utf8")).toBe("one, edited");
  expect(readFileSync(join(dir, DOC, "v2.md"), "utf8")).toBe("two");
});

test("flush writes what waits, pruned texts go, and a purge deletes at once", async () => {
  const dir = tempDir();
  const store = createFileVersionStore(dir, { delayMs: 60_000 });
  await store.save(DOC, [record("v1")], { v1: "one" });
  await store.save(DOC, [record("v2")], { v2: "two" });
  expect(existsSync(join(dir, DOC, "v1.md"))).toBe(true);
  await store.flush();
  expect(listed(dir)).toEqual(["v2"]);
  expect(existsSync(join(dir, DOC, "v1.md"))).toBe(false);

  // A new store (a new session) reads what was written.
  const again = createFileVersionStore(dir, { delayMs: 60_000 });
  expect(await again.read(DOC, "v2")).toBe("two");
  await again.save(DOC, [record("v2"), record("v3")], { v3: "three" });
  await again.save(DOC, [], {});
  await again.flush();
  expect(existsSync(join(dir, `${DOC}.json`))).toBe(false);
  expect(existsSync(join(dir, DOC))).toBe(false);
});
