import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, rename, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { TEMP_MARKER } from "./paths.ts";

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Text of a UTF-8 file, keeping a BOM (offsets in @lydie/markdown are into this string). null when
// the bytes are not valid UTF-8: such files are never indexed and never written.
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

export type FileRead = {
  text: string | null;
  bytes: Uint8Array;
  hash: string;
  mtime: number;
  size: number;
};

export async function readFileState(path: string): Promise<FileRead | null> {
  try {
    const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
    return {
      text: decodeUtf8(bytes),
      bytes,
      hash: sha256(bytes),
      mtime: Math.floor(info.mtimeMs),
      size: info.size,
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

// Test hook: runs after the temp file is complete and before it replaces the target, so a test can
// simulate a crash at the worst moment.
export type WriteHooks = { beforeRename?(temp: string, target: string): void | Promise<void> };

// Writes `data` next to `target` under a hidden temp name, flushes it, then renames it over the
// target. A crash at any point leaves either the old or the new file, never a partial one.
// Leftover temp files are hidden (never indexed) and removed by `removeTempFiles`.
export async function atomicWrite(
  target: string,
  data: Uint8Array | string,
  hooks?: WriteHooks,
): Promise<void> {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${basename(target)}${TEMP_MARKER}${randomBytes(4).toString("hex")}`);
  let mode = 0o644;
  try {
    mode = (await stat(target)).mode & 0o777;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const handle = await open(temp, "wx", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await hooks?.beforeRename?.(temp, target);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

// Moves a file or folder, creating the destination's parent. Refuses to overwrite. Returns false
// when there is nothing at `from` (another program moved or deleted it first).
export async function move(from: string, to: string): Promise<boolean> {
  if (from === to) return true;
  if (!(await exists(from))) return false;
  // A case-only rename on a case-insensitive disk: `to` "exists" because it is `from`.
  if (from.toLowerCase() !== to.toLowerCase() && (await exists(to))) {
    throw new Error(`Refusing to overwrite ${to}`);
  }
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  return true;
}

// Removes `dir` if it is empty (ignoring .DS_Store). Returns whether it is gone.
export async function removeIfEmpty(dir: string): Promise<boolean> {
  try {
    const names = await readdir(dir);
    if (names.some((n) => n !== ".DS_Store")) return false;
    if (names.length) await rm(join(dir, ".DS_Store"), { force: true });
    await rmdir(dir);
    return true;
  } catch (error) {
    if (isMissing(error)) return true;
    return false;
  }
}

// Deletes temp files left by an interrupted `atomicWrite` in `dir` (not recursive).
export async function removeTempFiles(dir: string, names: readonly string[]): Promise<void> {
  await Promise.all(
    names.filter((n) => n.includes(TEMP_MARKER)).map((n) => rm(join(dir, n), { force: true })),
  );
}
