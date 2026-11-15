import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAsset } from "./asset-path.ts";

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "lydie-assets-")));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<html>");
  await writeFile(join(root, "assets", "app.js"), "");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveAsset", () => {
  it("serves files and falls back to index.html for routes", async () => {
    expect(await resolveAsset(root, "/assets/app.js")).toBe(join(root, "assets", "app.js"));
    expect(await resolveAsset(root, "/")).toBe(join(root, "index.html"));
    expect(await resolveAsset(root, "/workspace/doc-1")).toBe(join(root, "index.html"));
    expect(await resolveAsset(root, "/missing.js")).toBeNull();
  });

  it("never leaves the root", async () => {
    expect(await resolveAsset(root, "/../../etc/passwd")).toBeNull();
    expect(await resolveAsset(root, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
    expect(await resolveAsset(root, "/%E0%A4%A")).toBeNull();
    expect(await resolveAsset(root, "/a%00b")).toBeNull();
  });
});
