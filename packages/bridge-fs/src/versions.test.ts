// Version history of a folder: snapshots beside the database (the default) and git (turned on).
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Actor } from "@lydie/contract";

import { gitAvailable, openGitVersions } from "./git-versions.ts";
import {
  cleanup,
  fixtureVault,
  hashes,
  openTestVault,
  tempDir,
  writeFixture,
} from "./test-utils.ts";
import type { Vault } from "./vault.ts";

// The tests' repositories must not depend on this machine's git settings (signing, hooks, name).
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

afterEach(cleanup);

const agent: Actor = { type: "agent", app: "claude", id: "a1", onBehalfOf: "local" };
const AGENT = "agent:claude:a1:local";
const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

async function idOf(vault: Vault, title: string): Promise<string> {
  const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: true });
  const found = tree.find((t) => t.title === title);
  if (!found) throw new Error(`No document "${title}"`);
  return found.id;
}

const list = async (vault: Vault, id: string) =>
  (await vault.runtime.ops.doc.listVersions({ id })).versions;
const text = async (vault: Vault, id: string, versionId: string) =>
  (await vault.runtime.ops.doc.getVersion({ id, versionId })).markdown;

describe("snapshots", () => {
  test("keep what a note said before Lydie first changed it, outside the folder", async () => {
    const folder = fixtureVault({
      "A.md": "---\ntags: [x]\n---\nwritten in Obsidian\n",
      "B.md": "b\n",
    });
    const pristine = hashes(folder);
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "A");
    expect(await list(vault, id)).toEqual([]);

    await vault.runtime.ops.doc.updateBody({ id, markdown: "edited in Lydie\n" });
    await vault.runtime.as(agent).doc.updateBody({ id, markdown: "rewritten by an agent\n" });

    const versions = await list(vault, id);
    expect(versions.map((v) => [v.kind, v.authors])).toEqual([
      ["auto", [AGENT]],
      ["auto", ["local"]],
      ["before_write", []],
    ]);
    expect(await text(vault, id, versions[1]!.id)).toBe("edited in Lydie\n");
    expect(await text(vault, id, versions[2]!.id)).toBe("written in Obsidian\n");
    // Nothing but the note itself changed in the folder.
    expect(hashes(folder)).toEqual({ ...pristine, "A.md": hashes(folder)["A.md"]! });
  });

  test("restore writes the old body under the frontmatter the file has now", async () => {
    const folder = fixtureVault({ "A.md": "---\ntags: [x]\n---\none\n" });
    const vault = await openTestVault(folder);
    const id = await idOf(vault, "A");
    await vault.runtime.ops.doc.updateBody({ id, markdown: "two\n" });
    await vault.runtime.ops.doc.setProperties({ id, set: { status: "done" } });
    const first = (await list(vault, id)).at(-1)!;

    const restored = await vault.runtime.ops.doc.restoreVersion({ id, versionId: first.id });
    expect(read(folder, "A.md")).toBe("---\ntags: [x]\nstatus: done\n---\none\n");
    expect(await text(vault, id, restored.previousVersionId!)).toBe("two\n");
    expect((await list(vault, id))[0]).toMatchObject({ kind: "restore", restoredFrom: first.id });

    await vault.runtime.history.undo();
    expect(read(folder, "A.md")).toBe("---\ntags: [x]\nstatus: done\n---\ntwo\n");
  });

  test("record edits made by another program, and outlive the database", async () => {
    const folder = fixtureVault({ "A.md": "one\n" });
    const databasePath = join(tempDir("lydie-db-"), "workspace.sqlite");
    const vault = await openTestVault(folder, { databasePath });
    const id = await idOf(vault, "A");
    await vault.runtime.ops.doc.updateBody({ id, markdown: "two\n" });
    writeFixture(folder, "A.md", "three, from another editor\n");
    await vault.bridge.rescan();
    await vault.bridge.idle();
    const versions = await list(vault, id);
    expect(versions[0]).toMatchObject({ kind: "auto", authors: ["system:file-bridge"] });
    await vault.close();

    // A rebuilt database (the folder is the truth) still finds the history.
    const { rmSync } = await import("node:fs");
    rmSync(databasePath, { force: true });
    const again = await openTestVault(folder, { databasePath });
    expect((await list(again, id)).map((v) => v.id)).toEqual(versions.map((v) => v.id));
  });

  test("go when the document is purged, and are not kept when turned off", async () => {
    const folder = fixtureVault({ "A.md": "one\n", "B.md": "b\n" });
    const databasePath = join(tempDir("lydie-db-"), "workspace.sqlite");
    const vault = await openTestVault(folder, { databasePath });
    const a = await idOf(vault, "A");
    await vault.runtime.ops.doc.updateBody({ id: a, markdown: "two\n" });
    const store = databasePath.replace(/\.sqlite$/, ".versions");
    expect(existsSync(join(store, `${a}.json`))).toBe(true);
    await vault.runtime.ops.doc.delete({ id: a });
    await vault.runtime.ops.doc.purge({ id: a });
    expect(existsSync(join(store, `${a}.json`))).toBe(false);
    expect(existsSync(join(store, a))).toBe(false);

    await vault.setSettings({ versionHistory: "off" });
    const b = await idOf(vault, "B");
    await vault.runtime.ops.doc.updateBody({ id: b, markdown: "changed\n" });
    expect(await list(vault, b)).toEqual([]);
    expect(existsSync(join(store, `${b}.json`))).toBe(false);
  });
});

const hasGit = await gitAvailable();

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Someone", "-c", "user.email=someone@example.com", ...args],
    { cwd, encoding: "utf8" },
  ).trim();
}

describe.skipIf(!hasGit)("git", () => {
  test("lists the repository's own commits and restores from them", async () => {
    const folder = fixtureVault({ "A.md": "---\ntags: [x]\n---\ncommitted by hand\n" });
    git(folder, "init", "-q");
    git(folder, "add", "-A");
    git(folder, "commit", "-q", "-m", "First notes");
    const vault = await openTestVault(folder);
    await vault.setSettings({ versionHistory: "git" });
    expect(vault.versionHistory()).toBe("git");
    const id = await idOf(vault, "A");

    const [first] = await list(vault, id);
    expect(first).toMatchObject({ kind: "external", authors: [], label: "First notes (Someone)" });
    expect(await text(vault, id, first!.id)).toBe("committed by hand\n");

    await vault.runtime.as(agent).doc.updateBody({ id, markdown: "rewritten by an agent\n" });
    const restored = await vault.runtime.ops.doc.restoreVersion({ id, versionId: first!.id });
    await vault.bridge.idle();
    expect(read(folder, "A.md")).toBe("---\ntags: [x]\n---\ncommitted by hand\n");

    const versions = await list(vault, id);
    expect(versions.map((v) => [v.kind, v.authors, v.restoredFrom])).toEqual([
      ["restore", ["local"], first!.id],
      ["auto", [AGENT], null],
      ["external", [], null],
    ]);
    // The body the restore replaced is a commit of its own, so the restore can be taken back.
    expect(restored.previousVersionId).toBe(versions[1]!.id);
    expect(await text(vault, id, versions[1]!.id)).toBe("rewritten by an agent\n");
    // Without a git identity, commits get a name and an address nobody can own.
    expect(git(folder, "log", "-1", "--format=%an <%ae>")).toBe("Lydie <lydie@localhost>");
    expect(git(folder, "status", "--porcelain", "--", "A.md")).toBe("");
  });

  test("follows renames and takes a checkpoint when the folder closes", async () => {
    const folder = fixtureVault({ "A.md": "one\n" });
    git(folder, "init", "-q");
    git(folder, "add", "-A");
    git(folder, "commit", "-q", "-m", "one");
    const databasePath = join(tempDir("lydie-db-"), "workspace.sqlite");
    const vault = await openTestVault(folder, { databasePath });
    await vault.setSettings({ versionHistory: "git" });
    const id = await idOf(vault, "A");
    await vault.runtime.ops.doc.rename({ id, title: "Renamed" });
    await vault.runtime.ops.doc.updateBody({ id, markdown: "one\ntwo\n" });
    await vault.close();
    expect(git(folder, "status", "--porcelain")).toBe("");
    expect(git(folder, "log", "-1", "--format=%s%n%(trailers:only)")).toBe(
      "Update Renamed.md\nLydie-Kind: auto\nLydie-Actor: local",
    );

    const again = await openTestVault(folder, { databasePath });
    expect(again.versionHistory()).toBe("git");
    const versions = await list(again, id);
    expect(versions.map((v) => v.kind)).toEqual(["auto", "external"]);
    expect(await text(again, id, versions[1]!.id)).toBe("one\n");
  });

  test("commits only the folder: nothing staged elsewhere, no staging bytes", async () => {
    const repo = tempDir("lydie-repo-");
    git(repo, "init", "-q");
    writeFileSync(join(repo, "code.ts"), "export {};\n");
    git(repo, "add", "code.ts");
    git(repo, "commit", "-q", "-m", "code");
    const folder = join(repo, "notes");
    mkdirSync(folder);
    writeFileSync(join(folder, "A.md"), "one\n");
    const vault = await openTestVault(folder);
    await vault.setSettings({ versionHistory: "git" });
    // The user's own work in progress, outside the folder.
    writeFileSync(join(repo, "code.ts"), "export const wip = 1;\n");
    git(repo, "add", "code.ts");
    mkdirSync(join(folder, ".lydie", "staging"), { recursive: true });
    writeFileSync(join(folder, ".lydie", "staging", "abc"), "bytes");

    const id = await idOf(vault, "A");
    await vault.runtime.ops.doc.updateBody({ id, markdown: "two\n" });
    await vault.close();

    expect(git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual([
      "notes/.lydie/workspace.json",
      "notes/A.md",
    ]);
    expect(git(repo, "status", "--porcelain").split("\n").sort()).toEqual([
      "?? notes/.lydie/staging/",
      "M  code.ts",
    ]);
  });

  test("turning it on makes the folder a repository; without one, snapshots take over", async () => {
    const folder = fixtureVault({ "A.md": "one\n" });
    const databasePath = join(tempDir("lydie-db-"), "workspace.sqlite");
    const vault = await openTestVault(folder, { databasePath });
    expect(vault.versionHistory()).toBe("snapshots");
    await vault.setSettings({ versionHistory: "git" });
    expect(existsSync(join(folder, ".git"))).toBe(true);
    await vault.close();
    expect(git(folder, "log", "--format=%s")).toBe("Update the workspace");

    // The folder arrives on another device without its repository.
    const { rmSync } = await import("node:fs");
    rmSync(join(folder, ".git"), { recursive: true, force: true });
    const errors: unknown[] = [];
    const again = await openTestVault(folder, { databasePath, onError: (e) => errors.push(e) });
    expect(again.settings().versionHistory).toBe("git");
    expect(again.versionHistory()).toBe("snapshots");
    expect(existsSync(join(folder, ".git"))).toBe(false);
    expect(String(errors[0])).toContain("not a git repository");
  });

  test("takes a checkpoint once changes go quiet, and leaves a repository mid-merge alone", async () => {
    const folder = fixtureVault({ "A.md": "one\n" });
    git(folder, "init", "-q");
    const versions = await openGitVersions({
      folder,
      pathOf: () => "A.md",
      idleMs: 20,
    });
    void versions.record({
      documentId: "d",
      workspaceId: "w",
      before: null,
      after: "one\n",
      actor: "local",
      at: new Date().toISOString(),
    });
    await sleep(400);
    expect(git(folder, "log", "--format=%s")).toBe("Update A.md");

    writeFileSync(join(folder, ".git", "MERGE_HEAD"), `${git(folder, "rev-parse", "HEAD")}\n`);
    writeFileSync(join(folder, "A.md"), "two\n");
    versions.touch();
    expect(await versions.flush()).toBeNull();
    expect(git(folder, "log", "--format=%s")).toBe("Update A.md");
    await versions.close();
  });
});
