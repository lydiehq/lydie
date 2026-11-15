import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StateStore } from "./state-store.ts";

const dirs: string[] = [];
const stores: StateStore[] = [];

function storeWith(state?: object) {
  const dir = mkdtempSync(join(tmpdir(), "lydie-state-"));
  dirs.push(dir);
  const file = join(dir, "state.json");
  if (state) writeFileSync(file, JSON.stringify(state));
  const store = new StateStore(file);
  stores.push(store);
  return store;
}

afterEach(async () => {
  // Pending debounced writes land before the directory goes.
  await Promise.all(stores.splice(0).map((store) => store.flush()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const notes = { id: "/notes", name: "notes", openedAt: 2 };
const work = { id: "/work", name: "work", openedAt: 1 };

describe("folderToRestore", () => {
  it("is nothing on first run", () => {
    expect(storeWith().folderToRestore(false)).toBeNull();
  });

  it("reopens the last folder, not the newest recent one", () => {
    const store = storeWith({ recentFolders: [notes, work], windowBounds: {} });
    store.setLastWorkspace({ kind: "folder", id: "/work" });
    expect(store.folderToRestore(true)).toBe("/work");
  });

  it("leaves a synced last workspace to the hosted preference", () => {
    const store = storeWith({ recentFolders: [notes], windowBounds: {} });
    store.setLastWorkspace({ kind: "synced" });
    expect(store.folderToRestore(false)).toBeNull();
  });

  it("does not reopen a folder removed from the list", () => {
    const store = storeWith({ recentFolders: [notes, work], windowBounds: {} });
    store.setLastWorkspace({ kind: "folder", id: "/notes" });
    store.forgetRecent("/notes");
    expect(store.lastWorkspace()).toBeUndefined();
    expect(store.folderToRestore(false)).toBe("/work");
  });

  it("falls back to the newest recent folder unless a synced workspace is preferred", () => {
    const store = storeWith({ recentFolders: [notes, work], windowBounds: {} });
    expect(store.folderToRestore(false)).toBe("/notes");
    expect(store.folderToRestore(true)).toBeNull();
  });

  it("ignores a malformed last workspace", () => {
    const store = storeWith({ recentFolders: [notes], windowBounds: {}, lastWorkspace: "x" });
    expect(store.lastWorkspace()).toBeUndefined();
  });
});

describe("privacy mode", () => {
  it("is off by default, and is kept", async () => {
    const store = storeWith({ recentFolders: [], windowBounds: {} });
    expect(store.blockScreenCapture()).toBe(false);
    store.setBlockScreenCapture(true);
    await store.flush();
    const dir = dirs.at(-1)!;
    expect(new StateStore(join(dir, "state.json")).blockScreenCapture()).toBe(true);
  });
});
