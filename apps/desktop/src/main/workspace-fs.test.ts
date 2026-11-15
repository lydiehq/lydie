import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toPlatformError } from "@lydie/platform";
import type { PlatformErrorCode } from "@lydie/platform";

import { isInside, WorkspaceFs } from "./workspace-fs.ts";

let base: string;
let root: string;
let outside: string;
let fs: WorkspaceFs;

async function codeOf(promise: Promise<unknown>): Promise<PlatformErrorCode | "ok"> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return toPlatformError(error).code;
  }
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "lydie-fs-")));
  root = join(base, "vault");
  outside = join(base, "outside");
  await mkdir(join(root, "notes"), { recursive: true });
  await mkdir(outside);
  await writeFile(join(root, "notes", "a.md"), "# A");
  await writeFile(join(outside, "secret.txt"), "secret");
  fs = await WorkspaceFs.open(root);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("isInside", () => {
  it("compares path prefixes by segment", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
    expect(isInside("/a/b", "/a/b/..foo")).toBe(true);
  });
});

describe("WorkspaceFs path confinement", () => {
  it("rejects lexical escapes before touching the disk", async () => {
    for (const path of [
      "../outside/secret.txt",
      "notes/../../outside/secret.txt",
      "/etc/passwd",
      "C:/x",
      "a\\..\\b",
    ]) {
      expect(await codeOf(fs.readText(path))).toBe("invalid-path");
    }
  });

  it("rejects symlinks that lead outside, for reads, writes and listings", async () => {
    await symlink(outside, join(root, "link-dir"));
    await symlink(join(outside, "secret.txt"), join(root, "link-file.txt"));
    expect(await codeOf(fs.readText("link-dir/secret.txt"))).toBe("outside-workspace");
    expect(await codeOf(fs.readText("link-file.txt"))).toBe("outside-workspace");
    expect(await codeOf(fs.write("link-dir/new.md", "x"))).toBe("outside-workspace");
    expect(await codeOf(fs.write("link-file.txt", "pwned"))).toBe("outside-workspace");
    expect(await codeOf(fs.write("link-dir/deep/new.md", "x"))).toBe("outside-workspace");
    expect(await codeOf(fs.list("link-dir"))).toBe("outside-workspace");
    expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("secret");
    expect(await readdir(outside)).toEqual(["secret.txt"]);
    const listed = (await fs.list("", { recursive: true } as never)).map((e) => e.path);
    expect(listed).not.toContain("link-dir");
  });

  it("follows symlinks that stay inside", async () => {
    await symlink(join(root, "notes"), join(root, "alias"));
    expect(await fs.readText("alias/a.md")).toBe("# A");
    const entries = await fs.list("", true);
    expect(entries.find((e) => e.path === "alias")?.kind).toBe("directory");
    // Not descended into, so no cycles and no duplicates.
    expect(entries.some((e) => e.path.startsWith("alias/"))).toBe(false);
  });

  it("deletes a link itself, never its target", async () => {
    await symlink(outside, join(root, "link-dir"));
    await fs.delete("link-dir");
    expect(await readdir(outside)).toEqual(["secret.txt"]);
    expect(await codeOf(fs.delete(""))).toBe("invalid-path");
  });

  it("opens the folder by its real path", async () => {
    await symlink(root, join(base, "vault-link"));
    const linked = await WorkspaceFs.open(join(base, "vault-link"));
    expect(linked.root).toBe(root);
    expect(linked.relativeOf(join(root, "notes", "a.md"))).toBe("notes/a.md");
    expect(linked.relativeOf(join(outside, "secret.txt"))).toBeNull();
  });
});

describe("WorkspaceFs operations", () => {
  it("writes atomically, creating parents, and reports stats", async () => {
    const stat = await fs.write("deep/er/b.md", "B");
    expect(stat).toMatchObject({ path: "deep/er/b.md", kind: "file", size: 1 });
    expect(await readFile(join(root, "deep/er/b.md"), "utf8")).toBe("B");
    expect((await readdir(join(root, "deep/er"))).filter((n) => n.includes("lydie-tmp"))).toEqual(
      [],
    );
    expect(await codeOf(fs.write("x/y.md", "x", { createParents: false }))).toBe("not-found");
  });

  it("refuses to overwrite a file changed since it was read", async () => {
    const first = await fs.write("c.md", "1");
    await fs.write("c.md", "2", { expectedMtime: first.mtime });
    expect(await codeOf(fs.write("c.md", "3", { expectedMtime: first.mtime - 10_000 }))).toBe(
      "conflict",
    );
  });

  it("maps errors to platform codes", async () => {
    expect(await codeOf(fs.readText("missing.md"))).toBe("not-found");
    expect(await codeOf(fs.readText("notes"))).toBe("is-a-directory");
    expect(await codeOf(fs.write("notes", "x"))).toBe("is-a-directory");
    expect(await codeOf(fs.delete("notes"))).toBe("not-empty");
    expect(await codeOf(fs.list("notes/a.md"))).toBe("not-a-directory");
    expect(await fs.stat("missing.md")).toBeNull();
  });

  it("renames without clobbering unless asked", async () => {
    await fs.write("b.md", "B");
    expect(await codeOf(fs.rename("b.md", "notes/a.md"))).toBe("exists");
    await fs.rename("b.md", "notes/a.md", true);
    expect(await fs.readText("notes/a.md")).toBe("B");
    expect(await codeOf(fs.rename("notes", "notes/inner"))).toBe("invalid-argument");
    await fs.rename("notes/a.md", "notes/A.md");
    expect((await fs.list("notes")).map((e) => e.name)).toEqual(["A.md"]);
  });

  it("lists with and without recursion and hides temp files", async () => {
    await writeFile(join(root, "notes", ".a.md.lydie-tmp-123"), "partial");
    expect((await fs.list("")).map((e) => e.path)).toEqual(["notes"]);
    expect((await fs.list("", true)).map((e) => e.path).sort()).toEqual(["notes", "notes/a.md"]);
  });

  it("round-trips bytes", async () => {
    await fs.write("bin.dat", new Uint8Array([0, 1, 255]));
    expect([...(await fs.readBytes("bin.dat"))]).toEqual([0, 1, 255]);
  });

  it("uses the trash hook when asked", async () => {
    const trashed: string[] = [];
    const withTrash = await WorkspaceFs.open(root, {
      trash: async (path) => void trashed.push(path),
    });
    await withTrash.delete("notes/a.md", { toTrash: true });
    expect(trashed).toEqual([join(root, "notes", "a.md")]);
  });

  it("refuses to open a file or a relative path as a workspace", async () => {
    expect(await codeOf(WorkspaceFs.open(join(root, "notes", "a.md")))).toBe("not-a-directory");
    expect(await codeOf(WorkspaceFs.open("relative/path"))).toBe("invalid-path");
  });
});
