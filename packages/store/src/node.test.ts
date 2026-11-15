import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openNodeStore, unpackedAsar } from "./node.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("unpackedAsar maps files inside app.asar to app.asar.unpacked", () => {
  expect(
    unpackedAsar(new URL("file:///A/Lydie.app/Contents/Resources/app.asar/node_modules/x/w.js"))
      .href,
  ).toBe("file:///A/Lydie.app/Contents/Resources/app.asar.unpacked/node_modules/x/w.js");
  expect(unpackedAsar(new URL("file:///repo/node_modules/x/w.js")).href).toBe(
    "file:///repo/node_modules/x/w.js",
  );
});

test("workerUrl decides where PowerSync's worker is loaded from", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lydie-store-worker-"));
  dirs.push(dir);
  const seen: string[] = [];
  const store = await openNodeStore({
    path: join(dir, "db.sqlite"),
    workerUrl: (url) => {
      seen.push(url.href);
      return url;
    },
  });
  try {
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((u) => u.endsWith("/DefaultWorker.js"))).toBe(true);
    expect(await store.listTree("ws")).toEqual([]);
  } finally {
    await store.close();
  }
});
