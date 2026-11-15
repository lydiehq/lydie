import { PlatformError } from "./errors.ts";
import type { WorkspacePath } from "./types.ts";

// Validates a workspace-relative path and returns its canonical form: POSIX separators, no "." or
// empty segments, no trailing slash. "" is the workspace root. Throws `invalid-path` for anything
// that could name a file outside the workspace on some OS: absolute paths, "..", drive letters,
// backslashes (a separator on Windows) and NUL. Every shell runs paths through this before touching
// the folder; the desktop shell additionally resolves symlinks.
//
// It deliberately accepts names that are legal on the current disk but not portable (e.g. "a:b.md"
// on macOS), because existing vaults contain them. Use `isPortableName` before creating files.
export function normalizePath(path: string): WorkspacePath {
  if (typeof path !== "string") throw new PlatformError("invalid-path", "Path must be a string");
  if (path.includes("\0")) throw new PlatformError("invalid-path", "Path contains a NUL byte");
  if (path.includes("\\"))
    throw new PlatformError("invalid-path", `Path uses backslashes: ${path}`);
  if (path.startsWith("/")) throw new PlatformError("invalid-path", `Path is absolute: ${path}`);
  if (/^[a-zA-Z]:/.test(path)) throw new PlatformError("invalid-path", `Path has a drive: ${path}`);

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw new PlatformError("invalid-path", `Path leaves the workspace: ${path}`);
    }
    segments.push(segment);
  }
  return segments.join("/");
}

// Names Windows refuses regardless of extension.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const NOT_PORTABLE = /[<>:"/\\|?*]/;

// True when a single file or folder name can be stored on Windows, macOS and Linux alike.
export function isPortableName(name: string): boolean {
  if (name === "" || name === "." || name === "..") return false;
  if (NOT_PORTABLE.test(name) || WINDOWS_RESERVED.test(name)) return false;
  if (name.endsWith(" ") || name.endsWith(".")) return false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return false;
  }
  return true;
}

export function joinPath(...parts: string[]): WorkspacePath {
  return normalizePath(parts.filter(Boolean).join("/"));
}

export function parentPath(path: WorkspacePath): WorkspacePath {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function baseName(path: WorkspacePath): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// True when `path` is `dir` or inside it.
export function isWithin(dir: WorkspacePath, path: WorkspacePath): boolean {
  return dir === "" || path === dir || path.startsWith(`${dir}/`);
}
