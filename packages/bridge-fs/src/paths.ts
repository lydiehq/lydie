// Vault paths. Every document has a key: its vault-relative path with forward slashes and without
// `.md` ("Notes/Idea"). A key can have a file (`Notes/Idea.md`), a folder (`Notes/Idea/`), or both
// (a note with children). Trashed documents live under `.trash/`.

export const TRASH_DIR = ".trash";
export const META_DIR = ".lydie";
export const TEMP_MARKER = ".lydie-tmp-";
export const MD = ".md";

export function parentKey(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash === -1 ? "" : key.slice(0, slash);
}

export function baseName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

export function joinKey(parent: string, name: string): string {
  return parent === "" ? name : `${parent}/${name}`;
}

export function isUnder(key: string, root: string): boolean {
  return root === "" || key === root || key.startsWith(`${root}/`);
}

// Re-roots `key` from `from` to `to` (for keys at or under `from`).
export function rebase(key: string, from: string, to: string): string {
  return key === from ? to : to + key.slice(from.length);
}

export const filePath = (key: string) => key + MD;

export function isTrashKey(key: string): boolean {
  return key === TRASH_DIR || key.startsWith(`${TRASH_DIR}/`);
}

// Names Lydie never indexes: hidden files and folders (`.obsidian`, `.git`, `.trash`, `.lydie`,
// editor temp files) and `node_modules`. Obsidian hides dot-files too.
export function isHiddenName(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

// File names follow the folder format in @lydie/contract, which exports also use.
export { compareNames, fileNameFor, titleOf, uniqueName } from "@lydie/contract";

// Minimal glob for `exclude` patterns in `.lydie/workspace.json`: `*` (no slash), `**` (anything),
// `?`; a pattern without a slash matches a name at any depth; a trailing `/` matches folders only
// (folders are matched by their key, so it is dropped).
export function globMatcher(patterns: readonly string[]): (key: string) => boolean {
  const regexes = patterns
    .map((p) => p.trim().replace(/\/+$/, ""))
    .filter((p) => p !== "" && !p.startsWith("#"))
    .map((p) => {
      const anchored = p.includes("/");
      const body = p
        .replace(/^\//, "")
        .split(/(\*\*\/?|\*|\?)/)
        .map((part) => {
          if (part === "**/" || part === "**") return ".*";
          if (part === "*") return "[^/]*";
          if (part === "?") return "[^/]";
          return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      return new RegExp(anchored ? `^${body}(?:/.*)?$` : `(?:^|/)${body}(?:/.*)?$`);
    });
  return (key) => regexes.some((r) => r.test(key));
}
