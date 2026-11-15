// A folder of Markdown files (an Obsidian vault, a Lydie export, notes from anywhere) as an import
// plan. Folders with notes in them are pages (a folder of only images is not); a note named like its folder (beside it, "Projects.md", or inside it,
// "Projects/Projects.md") is that page's content. Frontmatter becomes properties. Other files
// are attachments, and embeds and images that point at them are pointed at what is uploaded.
import { importEntries, importFileRef, newImportId } from "@lydie/plugin-api";
import type {
  ImportEntry,
  ImportFile,
  ImportPage,
  ImportPlan,
  ImportReadContext,
  ImportWarning,
  JSONContent,
} from "@lydie/plugin-api";
import { isUuid } from "@lydie/plugin-api/databases";
import type { PropertyValue } from "@lydie/plugin-api/databases";

const NOTE = /\.(md|markdown)$/i;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  txt: "text/plain",
  csv: "text/csv",
};

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const extension = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function join(dir: string, relative: string): string {
  const parts = dir ? dir.split("/") : [];
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export type FindAttachment = (target: string, noteDir: string) => string | null;

// Embeds and images of attachments in a note's document now name the import's files. Returns
// whether anything changed. An image alone in its paragraph becomes an embed (attachments are
// embedded by name); an image within text keeps its address.
export function rewriteAttachments(doc: JSONContent, find: (target: string) => string | null) {
  let changed = false;
  const visit = (node: JSONContent) => {
    if (!node.content) return;
    node.content = node.content.map((child) => {
      if (child.type === "embed") {
        const file = find(String(child.attrs?.target ?? ""));
        if (file) {
          changed = true;
          return { type: "embed", attrs: { target: importFileRef(file) } };
        }
      }
      const only =
        child.type === "paragraph" && child.content?.length === 1 ? child.content[0] : null;
      if (only?.type === "image") {
        const file = find(decode(String(only.attrs?.src ?? "")));
        if (file) {
          changed = true;
          return { type: "embed", attrs: { target: importFileRef(file) } };
        }
      }
      visit(child);
      return child;
    });
  };
  visit(doc);
  return changed;
}

// Frontmatter values a document can hold; the rest is left out with a warning.
function propertyValue(value: unknown): PropertyValue | undefined {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as PropertyValue;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value) && value.every((v) => ["string", "number"].includes(typeof v))) {
    return value.map(String);
  }
  return undefined;
}

type Node = {
  key: string;
  id: string;
  title: string;
  parentKey: string | null;
  note: ImportEntry | null;
};

export async function readMarkdownFiles(
  files: readonly File[],
  context: ImportReadContext,
): Promise<ImportPlan> {
  context.onProgress({ done: 0, total: 0, label: "Opening the files" });
  const single = files.length === 1 ? files[0]!.name.replace(/\.zip$/i, "") : null;
  return planFromEntries(await importEntries(files), context, single ?? "Markdown");
}

export async function planFromEntries(
  input: readonly ImportEntry[],
  context: ImportReadContext,
  defaultTitle: string,
): Promise<ImportPlan> {
  const warnings: ImportWarning[] = [];
  let entries = [...input];
  let rootTitle = defaultTitle;
  // Everything in one folder (a zipped vault): the folder is the import's page.
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  if (tops.size === 1 && entries.every((e) => e.path.includes("/"))) {
    const [top] = tops;
    rootTitle = top!;
    entries = entries.map((e) => ({ ...e, path: e.path.slice(top!.length + 1) }));
  }

  const notes = entries.filter((e) => NOTE.test(e.path));
  if (notes.length === 0) throw new Error("No Markdown files were found in what you picked.");
  const skipped = (ext: string) => entries.filter((e) => extension(e.path) === ext).length;
  const files = (n: number, what: string) =>
    n === 1 ? `1 ${what} file was` : `${n} ${what} files were`;
  if (skipped("base")) {
    warnings.push({
      message: `${files(skipped("base"), "collection (.base)")} left out: their pages come in as pages, without the collection's properties and views.`,
    });
  }
  if (skipped("canvas")) {
    warnings.push({ message: `${files(skipped("canvas"), "canvas (.canvas)")} left out.` });
  }
  const attachments = entries.filter(
    (e) => !NOTE.test(e.path) && !["base", "canvas"].includes(extension(e.path)),
  );

  // ---- Pages: notes and the folders they are in.
  const nodes = new Map<string, Node>();
  const nodeFor = (key: string): Node => {
    let node = nodes.get(key);
    if (!node) {
      const parent = dirname(key);
      node = {
        key,
        id: newImportId(),
        title: basename(key),
        parentKey: parent ? nodeFor(parent).key : null,
        note: null,
      };
      nodes.set(key, node);
    }
    return node;
  };
  for (const note of notes) {
    let key = note.path.replace(NOTE, "");
    // A folder note inside its folder.
    if (dirname(key) && basename(key) === basename(dirname(key))) key = dirname(key);
    const node = nodeFor(key);
    if (node.note) {
      warnings.push({ source: note.path, message: "Left out: another note has the same name." });
      continue;
    }
    node.note = note;
  }

  // ---- Files
  const byPath = new Map(attachments.map((e) => [e.path.toLowerCase(), e]));
  const byName = new Map<string, ImportEntry[]>();
  for (const entry of attachments) {
    const name = basename(entry.path).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), entry]);
  }
  const planned = new Map<string, ImportFile>();
  const fileOf = (entry: ImportEntry, pageId: string | null) => {
    let file = planned.get(entry.path);
    if (!file) {
      file = {
        id: newImportId(),
        name: basename(entry.path),
        contentType: TYPES[extension(entry.path)] ?? "application/octet-stream",
        pageId,
        size: entry.size,
        read: entry.read,
      };
      planned.set(entry.path, file);
    }
    return file.id;
  };
  // Obsidian's rules: a path from the top, a path from the note, or a name found once.
  const find: FindAttachment = (target, noteDir) => {
    const clean = target.replace(/[#?].*$/, "").trim();
    if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
    const entry =
      byPath.get(clean.toLowerCase()) ??
      byPath.get(join(noteDir, clean).toLowerCase()) ??
      (byName.get(basename(clean).toLowerCase())?.length === 1
        ? byName.get(basename(clean).toLowerCase())![0]
        : undefined);
    return entry ? entry.path : null;
  };

  // ---- Notes
  const pages: ImportPage[] = [];
  const children = new Map<string | null, Node[]>();
  for (const node of nodes.values()) {
    children.set(node.parentKey, [...(children.get(node.parentKey) ?? []), node]);
  }
  const ordered: Node[] = [];
  const visit = (key: string | null) => {
    const list = (children.get(key) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
    );
    for (const node of list) {
      ordered.push(node);
      visit(node.key);
    }
  };
  visit(null);

  const withNotes = ordered.filter((n) => n.note).length;
  let done = 0;
  for (const node of ordered) {
    if (context.signal.aborted) throw new DOMException("The import was stopped", "AbortError");
    const page: ImportPage = {
      id: node.id,
      parentId: node.parentKey ? nodes.get(node.parentKey)!.id : null,
      title: node.title,
      markdown: "",
    };
    if (node.note) {
      context.onProgress({ done: done++, total: withNotes, label: "Reading notes" });
      const noteDir = dirname(node.note.path);
      const { properties, body } = context.app.editor.splitFrontmatter(await node.note.text());
      const kept: Record<string, PropertyValue> = {};
      for (const [key, value] of Object.entries(properties ?? {})) {
        // A Lydie export's own id: the imported page gets a new one.
        if (key === "id" && isUuid(value)) continue;
        const converted = propertyValue(value);
        if (converted === undefined) {
          warnings.push({ source: node.title, message: `The property “${key}” was left out.` });
          continue;
        }
        const cover = key === "cover" && typeof converted === "string" && find(converted, noteDir);
        kept[key] = cover
          ? importFileRef(fileOf(byPath.get(cover.toLowerCase())!, node.id))
          : converted;
      }
      if (Object.keys(kept).length) page.properties = kept;
      page.markdown = body;
      if (attachments.length && body.trim()) {
        const parsed = context.app.editor.fromMarkdown(body);
        const changed = rewriteAttachments(parsed.content, (target) => {
          const path = find(target, noteDir);
          return path ? fileOf(byPath.get(path.toLowerCase())!, node.id) : null;
        });
        if (changed) page.markdown = context.app.editor.toMarkdown(parsed, parsed.content);
      }
    }
    pages.push(page);
  }

  // Files no note embeds still come along, with the page of their folder if it is one.
  for (const entry of attachments) {
    if (planned.has(entry.path)) continue;
    const dir = dirname(entry.path);
    fileOf(entry, dir ? (nodes.get(dir)?.id ?? null) : null);
  }

  return { rootTitle, pages, files: [...planned.values()], warnings };
}
