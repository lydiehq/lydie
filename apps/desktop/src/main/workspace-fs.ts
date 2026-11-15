// File operations confined to one workspace folder. No Electron imports, so it is unit-tested in
// plain Node. Every path from the renderer goes through `normalizePath` (no "..", no absolute
// paths) and then through `resolve`, which follows symlinks and rejects anything whose real
// location is outside the folder's real path.
import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import { normalizePath, PlatformError } from "@lydie/platform";
import type { FileEntry, FileStat, WorkspacePath, WriteOptions } from "@lydie/platform";

// Temporary files of atomic writes. The watcher ignores them.
export const TEMP_MARKER = ".lydie-tmp-";

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function toPlatformCode(error: unknown, path: string): PlatformError {
  if (error instanceof PlatformError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return new PlatformError("not-found", `No such file or folder: ${path}`);
    case "EEXIST":
      return new PlatformError("exists", `Already exists: ${path}`);
    case "ENOTDIR":
      return new PlatformError("not-a-directory", `Not a folder: ${path}`);
    case "EISDIR":
      return new PlatformError("is-a-directory", `Is a folder: ${path}`);
    case "ENOTEMPTY":
      return new PlatformError("not-empty", `Folder is not empty: ${path}`);
    case "EACCES":
    case "EPERM":
      return new PlatformError("permission-denied", `Permission denied: ${path}`);
    case "ELOOP":
      return new PlatformError("invalid-path", `Too many symlinks: ${path}`);
    default:
      return new PlatformError("unknown", `${path}: ${(error as Error)?.message ?? String(error)}`);
  }
}

function toStat(path: WorkspacePath, stats: Stats): FileStat {
  return {
    path,
    kind: stats.isDirectory() ? "directory" : "file",
    size: stats.isDirectory() ? 0 : stats.size,
    mtime: stats.mtimeMs,
  };
}

export type WorkspaceFsOptions = {
  // Moves a file to the OS trash (Electron's shell.trashItem); absent in tests.
  trash?: (absolutePath: string) => Promise<void>;
};

export class WorkspaceFs {
  private constructor(
    // Real path of the folder (symlinks resolved, canonical case on macOS).
    readonly root: string,
    private readonly options: WorkspaceFsOptions,
  ) {}

  static async open(folder: string, options: WorkspaceFsOptions = {}): Promise<WorkspaceFs> {
    if (!isAbsolute(folder)) throw new PlatformError("invalid-path", "Folder must be absolute");
    let root: string;
    try {
      root = await realpath(folder);
    } catch (error) {
      throw toPlatformCode(error, folder);
    }
    const stats = await stat(root);
    if (!stats.isDirectory()) throw new PlatformError("not-a-directory", folder);
    return new WorkspaceFs(root, options);
  }

  // Absolute path of a workspace path, with every existing component's symlinks resolved. The
  // target need not exist; its nearest existing ancestor must resolve inside the folder.
  async resolve(path: string): Promise<{ rel: WorkspacePath; abs: string }> {
    const rel = normalizePath(path);
    const lexical = rel === "" ? this.root : join(this.root, ...rel.split("/"));
    const missing: string[] = [];
    let probe = lexical;
    for (;;) {
      try {
        const real = await realpath(probe);
        const abs = missing.length ? join(real, ...missing.reverse()) : real;
        if (!isInside(this.root, abs)) {
          throw new PlatformError(
            "outside-workspace",
            `Path resolves outside the workspace: ${rel}`,
          );
        }
        return { rel, abs };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") throw toPlatformCode(error, rel);
        if (probe === this.root) throw toPlatformCode(error, rel);
        missing.push(basename(probe));
        probe = dirname(probe);
      }
    }
  }

  // Like `resolve` but does not follow a symlink in the last component, for operations on the
  // entry itself (delete, rename). The parent must resolve inside the folder.
  async resolveEntry(path: string): Promise<{ rel: WorkspacePath; abs: string }> {
    const rel = normalizePath(path);
    if (rel === "") throw new PlatformError("invalid-path", "Not allowed on the workspace root");
    const slash = rel.lastIndexOf("/");
    const parent = await this.resolve(slash === -1 ? "" : rel.slice(0, slash));
    return { rel, abs: join(parent.abs, rel.slice(slash + 1)) };
  }

  async stat(path: string): Promise<FileStat | null> {
    const { rel, abs } = await this.resolve(path);
    try {
      return toStat(rel, await stat(abs));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw toPlatformCode(error, rel);
    }
  }

  async list(path: string, recursive = false): Promise<FileEntry[]> {
    const { rel, abs } = await this.resolve(path);
    const out: FileEntry[] = [];
    await this.walk(rel, abs, recursive, out);
    return out;
  }

  private async walk(rel: string, abs: string, recursive: boolean, out: FileEntry[]) {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
    for (const entry of entries) {
      if (entry.name.includes(TEMP_MARKER)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(abs, entry.name);
      let stats: Stats;
      try {
        if (entry.isSymbolicLink()) {
          // Show links that stay inside the folder; never descend into them (cycles).
          const real = await realpath(childAbs);
          if (!isInside(this.root, real)) continue;
          stats = await stat(real);
          out.push({ ...toStat(childRel, stats), name: entry.name });
          continue;
        }
        stats = await lstat(childAbs);
      } catch {
        // Vanished between readdir and stat, or a dangling link.
        continue;
      }
      out.push({ ...toStat(childRel, stats), name: entry.name });
      if (recursive && stats.isDirectory()) await this.walk(childRel, childAbs, true, out);
    }
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const { rel, abs } = await this.resolve(path);
    try {
      const buffer = await readFile(abs);
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
  }

  async readText(path: string): Promise<string> {
    const { rel, abs } = await this.resolve(path);
    try {
      return await readFile(abs, "utf8");
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
  }

  // Writes to a temporary sibling and renames it over the target, so readers (and other programs
  // watching the folder) never see a half-written file.
  async write(
    path: string,
    content: string | Uint8Array,
    options: WriteOptions = {},
  ): Promise<FileStat> {
    const { rel, abs } = await this.resolve(path);
    if (rel === "") throw new PlatformError("is-a-directory", "Cannot write the workspace root");
    try {
      const existing = await stat(abs).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (existing?.isDirectory()) throw new PlatformError("is-a-directory", rel);
      if (options.expectedMtime !== undefined && existing?.mtimeMs !== options.expectedMtime) {
        throw new PlatformError("conflict", `${rel} changed on disk`);
      }
      const dir = dirname(abs);
      if (options.createParents ?? true) {
        await mkdir(dir, { recursive: true });
        // mkdir may have created folders through a link created since `resolve`; check again.
        if (!isInside(this.root, await realpath(dir))) {
          throw new PlatformError("outside-workspace", rel);
        }
      }
      const temp = join(dir, `.${basename(abs)}${TEMP_MARKER}${randomBytes(6).toString("hex")}`);
      try {
        await writeFile(temp, content, { flag: "wx" });
        await rename(temp, abs);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
      return toStat(rel, await stat(abs));
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
  }

  async mkdir(path: string): Promise<void> {
    const { rel, abs } = await this.resolve(path);
    try {
      await mkdir(abs, { recursive: true });
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
  }

  async rename(from: string, to: string, overwrite = false): Promise<void> {
    const source = await this.resolveEntry(from);
    const target = await this.resolveEntry(to);
    if (isInside(source.abs, target.abs) && source.abs !== target.abs) {
      throw new PlatformError("invalid-argument", "Cannot move a folder into itself");
    }
    try {
      const sourceStats = await lstat(source.abs);
      if (!overwrite) {
        const targetStats = await lstat(target.abs).catch(() => null);
        // A case-only rename on a case-insensitive disk finds the same entry, not a collision.
        const sameEntry =
          targetStats?.ino === sourceStats.ino && targetStats.dev === sourceStats.dev;
        if (targetStats && !sameEntry) throw new PlatformError("exists", target.rel);
      }
      await rename(source.abs, target.abs);
    } catch (error) {
      throw toPlatformCode(error, source.rel);
    }
  }

  async delete(
    path: string,
    options: { recursive?: boolean; toTrash?: boolean } = {},
  ): Promise<void> {
    const { rel, abs } = await this.resolveEntry(path);
    try {
      const stats = await lstat(abs);
      if (stats.isDirectory() && !options.recursive) {
        if ((await readdir(abs)).length) throw new PlatformError("not-empty", rel);
      }
      if (options.toTrash && this.options.trash) {
        await this.options.trash(abs);
        return;
      }
      await rm(abs, { recursive: stats.isDirectory(), force: false });
    } catch (error) {
      throw toPlatformCode(error, rel);
    }
  }

  // Workspace path of an absolute path reported by the watcher, or null when outside.
  relativeOf(absolute: string): WorkspacePath | null {
    if (!isInside(this.root, absolute)) return null;
    return relative(this.root, absolute).split(sep).join("/");
  }
}
