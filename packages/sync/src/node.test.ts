import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Y from "yjs";

import { createFileYjsPersistence } from "./node.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "lydie-yjs-"));
  dirs.push(dir);
  return dir;
};

describe("file Yjs persistence", () => {
  test("appends, loads, compacts and tracks dirty documents across instances", async () => {
    const dir = tempDir();
    const p = createFileYjsPersistence(dir);
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on("update", (u: Uint8Array) => updates.push(u));
    doc.getText("body").insert(0, "one ");
    doc.getText("body").insert(4, "two");
    for (const u of updates) await p.append("doc1", u);
    await p.setDirty("doc1", true);

    const reopened = createFileYjsPersistence(dir);
    const loaded = await reopened.load("doc1");
    expect(loaded).toHaveLength(2);
    const copy = new Y.Doc();
    for (const u of loaded) Y.applyUpdate(copy, u);
    expect(copy.getText("body").toJSON()).toBe("one two");
    expect(await reopened.dirty()).toEqual(["doc1"]);

    await reopened.replace("doc1", Y.encodeStateAsUpdate(copy));
    expect(await reopened.load("doc1")).toHaveLength(1);
    await reopened.clear("doc1");
    expect(await reopened.load("doc1")).toEqual([]);
    expect(await createFileYjsPersistence(dir).dirty()).toEqual([]);
  });

  test("ignores a torn last record (crash mid-append)", async () => {
    const dir = tempDir();
    const p = createFileYjsPersistence(dir);
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "kept");
    await p.append("doc2", Y.encodeStateAsUpdate(doc));
    appendFileSync(join(dir, "doc2.yupd"), new Uint8Array([0, 0, 1, 0, 9, 9]));
    expect(await p.load("doc2")).toHaveLength(1);
  });

  test("rejects ids that are not file-safe", async () => {
    const p = createFileYjsPersistence(tempDir());
    const refused = await p.append("../x", new Uint8Array()).then(
      () => false,
      () => true,
    );
    expect(refused).toBe(true);
  });
});
