// Walks a vault folder (or part of it) and lists its documents: Markdown files and folders.
import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import { isMissing, removeTempFiles } from "./fs.ts";
import { baseName, isHiddenName, joinKey, MD, TEMP_MARKER } from "./paths.ts";

export type DiskEntry = {
  key: string;
  // The Markdown file `<key>.md`, if there is one.
  file: { mtime: number; size: number } | null;
  // Whether the folder `<key>/` exists.
  dir: boolean;
  // Names of the `.base` files directly inside the folder (a database's definition, see databases.ts).
  bases?: string[];
};

export type ScanOptions = {
  // Keys never indexed (exclude patterns, the attachments folder).
  excluded: (key: string) => boolean;
  // Delete leftover temp files of interrupted writes while walking.
  cleanTemp?: boolean;
};

// Lists the documents at and under `start` ("" for the whole vault). `start` itself is included
// unless it is the vault root. Hidden names are skipped everywhere except that `start` may be
// inside a hidden folder (the trash is scanned this way).
export async function scan(
  root: string,
  start: string,
  options: ScanOptions,
): Promise<Map<string, DiskEntry>> {
  const out = new Map<string, DiskEntry>();
  const entry = (key: string) => {
    let e = out.get(key);
    if (!e) {
      e = { key, file: null, dir: false };
      out.set(key, e);
    }
    return e;
  };

  async function walk(dirKey: string): Promise<void> {
    let dirents: Dirent[];
    try {
      dirents = await readdir(join(root, dirKey), { withFileTypes: true });
    } catch (error) {
      if (isMissing(error) || (error as NodeJS.ErrnoException).code === "EACCES") return;
      throw error;
    }
    if (options.cleanTemp && dirents.some((d) => d.name.includes(TEMP_MARKER))) {
      await removeTempFiles(
        join(root, dirKey),
        dirents.map((d) => d.name),
      );
    }
    const subdirs: string[] = [];
    const files: Promise<void>[] = [];
    for (const d of dirents) {
      if (isHiddenName(d.name)) continue;
      // Symlinks are skipped: they could point outside the vault or loop.
      if (d.isDirectory()) {
        const key = joinKey(dirKey, d.name);
        if (options.excluded(key)) continue;
        entry(key).dir = true;
        subdirs.push(key);
      } else if (d.isFile() && d.name.endsWith(".base") && dirKey !== "") {
        (entry(dirKey).bases ??= []).push(d.name);
      } else if (d.isFile() && d.name.endsWith(MD) && d.name.length > MD.length) {
        const key = joinKey(dirKey, d.name.slice(0, -MD.length));
        if (options.excluded(key)) continue;
        files.push(
          lstat(join(root, dirKey, d.name)).then(
            (info) => {
              entry(key).file = { mtime: Math.floor(info.mtimeMs), size: info.size };
            },
            (error: unknown) => {
              if (!isMissing(error)) throw error;
            },
          ),
        );
      }
    }
    await Promise.all(files);
    await Promise.all(subdirs.map(walk));
  }

  if (start === "") {
    await walk("");
    return out;
  }
  // The start key itself: its file and folder.
  if (!isHiddenName(baseName(start)) || start.startsWith(".")) {
    const [file, dir] = await Promise.all([
      statKind(join(root, start + MD)),
      statKind(join(root, start)),
    ]);
    if (file?.kind === "file") entry(start).file = { mtime: file.mtime, size: file.size };
    if (dir?.kind === "dir") {
      entry(start).dir = true;
      await walk(start);
    }
  }
  return out;
}

async function statKind(
  path: string,
): Promise<{ kind: "file" | "dir" | "other"; mtime: number; size: number } | null> {
  try {
    const info = await lstat(path);
    return {
      kind: info.isFile() ? "file" : info.isDirectory() ? "dir" : "other",
      mtime: Math.floor(info.mtimeMs),
      size: info.size,
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
