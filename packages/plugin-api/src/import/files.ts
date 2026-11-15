// The files someone picked for an import, flattened: zips are opened (and zips at the top of a
// zip, as Notion sends a large export), hidden files and folders left out.
import { openZip } from "./zip.ts";

export type ImportEntry = {
  // Forward slashes; a picked file's own name, or its path inside the zip.
  path: string;
  size: number;
  read: () => Promise<Uint8Array>;
  text: () => Promise<string>;
};

export type ImportEntriesOptions = {
  // A folder every entry of a zip starts with that is not part of the content (Notion's
  // "Export-<uuid>/"); removed from the paths.
  stripRoot?: RegExp;
};

// `.obsidian`, `.git`, `.DS_Store`, macOS's resource forks.
export const isHiddenPath = (path: string) =>
  path.startsWith("__MACOSX/") || path.split("/").some((part) => part.startsWith("."));

async function addZip(
  blob: Blob,
  out: ImportEntry[],
  depth: number,
  options: ImportEntriesOptions,
): Promise<void> {
  const entries = (await openZip(blob)).filter(
    (e) => !e.path.endsWith("/") && !isHiddenPath(e.path),
  );
  const root = options.stripRoot?.exec(entries[0]?.path ?? "")?.[0];
  const strip = root && entries.every((e) => e.path.startsWith(root)) ? root.length : 0;
  for (const entry of entries) {
    const path = entry.path.slice(strip);
    // Only zips at the top are parts of the export; deeper ones are files someone attached.
    if (depth < 2 && !path.includes("/") && /\.zip$/i.test(path)) {
      await addZip(await entry.blob(), out, depth + 1, options);
      continue;
    }
    out.push({ path, size: entry.size, read: entry.read, text: entry.text });
  }
}

export async function importEntries(
  files: readonly File[],
  options: ImportEntriesOptions = {},
): Promise<ImportEntry[]> {
  const out: ImportEntry[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      await addZip(file, out, 0, options);
      continue;
    }
    // A folder picked in the browser keeps its relative paths.
    const path = file.webkitRelativePath || file.name;
    if (isHiddenPath(path)) continue;
    out.push({
      path,
      size: file.size,
      read: async () => new Uint8Array(await file.arrayBuffer()),
      text: () => file.text(),
    });
  }
  return out;
}
