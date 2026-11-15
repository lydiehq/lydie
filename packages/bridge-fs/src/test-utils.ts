// Helpers for the bridge tests: fixture vaults in temp folders and snapshots of what is on disk.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { openVault } from "./vault.ts";
import type { OpenVaultOptions, Vault } from "./vault.ts";

const cleanups: (() => Promise<void> | void)[] = [];

export function tempDir(prefix = "lydie-bridge-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A vault folder with these files (paths relative, contents as given).
export function fixtureVault(files: Record<string, string | Uint8Array>): string {
  const dir = join(tempDir(), "vault");
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) writeFixture(dir, path, content);
  return dir;
}

export function writeFixture(root: string, path: string, content: string | Uint8Array): void {
  const target = join(root, path);
  if (path.endsWith("/")) {
    mkdirSync(target, { recursive: true });
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export async function openTestVault(
  folder: string,
  options: Partial<OpenVaultOptions> & { databasePath?: string } = {},
): Promise<Vault> {
  const vault = await openVault({
    folder,
    databasePath: options.databasePath ?? join(tempDir("lydie-db-"), "workspace.sqlite"),
    watch: options.watch ?? false,
    ...options,
  });
  cleanups.push(() => vault.close());
  return vault;
}

export async function cleanup(): Promise<void> {
  for (const fn of cleanups.splice(0).reverse()) await fn();
}

// Every file under `root` (relative path → content), skipping `.lydie/` unless asked.
export function snapshot(root: string, options: { lydie?: boolean } = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name);
      const rel = relative(root, path);
      if (!options.lydie && (rel === ".lydie" || rel.startsWith(".lydie/"))) continue;
      if (d.isDirectory()) walk(path);
      else if (d.isFile()) out[rel] = readFileSync(path, "utf8");
    }
  };
  walk(root);
  return out;
}

export function hashes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, d.name);
      const rel = relative(root, path);
      if (rel === ".lydie" || rel.startsWith(".lydie/")) continue;
      if (d.isDirectory()) walk(path);
      else if (d.isFile()) out[rel] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(root);
  return out;
}

// The workspace as the database sees it, independent of sort-key strings and row ids: the live
// tree in order, then the trash by id (a trashed document has no meaningful place among live ones).
export async function workspaceOf(vault: Vault) {
  const tree = await vault.store.listTree(vault.workspaceId, { includeDeleted: true });
  const docs = [];
  for (const entry of tree) {
    const full = await vault.store.getDoc(entry.id, { includeBody: true });
    const links = await vault.store.ports.db.read(
      async (tx) => (await tx.links.from?.(entry.id)) ?? [],
    );
    docs.push({
      id: entry.id,
      depth: entry.depth,
      parentId: entry.parentId,
      title: entry.title,
      properties: entry.properties,
      deleted: entry.deletedAt !== null,
      body: full?.body?.markdown ?? null,
      links: links
        .map(
          (l) =>
            `${l.kind}|${l.syntax}|${l.targetRef}|${l.targetId ?? "-"}|${l.targetHeading ?? ""}|${l.targetBlockId ?? ""}|${l.sourceProperty ?? ""}`,
        )
        .sort(),
    });
  }
  return [
    ...docs.filter((d) => !d.deleted),
    ...docs.filter((d) => d.deleted).sort((a, b) => (a.id < b.id ? -1 : 1)),
  ];
}

export async function waitFor<T>(
  read: () => Promise<T> | T,
  accept: (value: T) => boolean,
  timeout = 5000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value) || Date.now() > deadline) return value;
    await sleep(25);
  }
}
