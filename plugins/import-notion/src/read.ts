// Notion's HTML export as an import plan. Pages are folders and files named "<title> <id>": a
// page's sub-pages are in the folder of the same name next to it, a database's rows in its folder
// (an inline database has a folder but no page of its own). Two passes over the pages: the first
// reads titles, properties and tables (to know every page, database and file), the second
// converts the bodies, whose links need all of that.
import { importEntries, importFileRef, newImportId } from "@lydie/plugin-api";
import type {
  ImportEntry,
  ImportFile,
  ImportPage,
  ImportPlan,
  ImportReadContext,
  ImportWarning,
} from "@lydie/plugin-api";
import type { PropertyValue } from "@lydie/plugin-api/databases";

import { prepareBody } from "./body.ts";
import { inferDayFirst } from "./dates.ts";
import { basename, contentTypeOf, dirname, extensionOf, notionIdOf, titleOfName } from "./names.ts";
import { parsePage, readPage } from "./page.ts";
import type { CollectionTable, PageInfo } from "./page.ts";
import { buildDatabase } from "./schema.ts";

// Each part of Notion's export starts with this folder.
const EXPORT_ROOT = /^Export-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\//i;

export const MARKDOWN_EXPORT =
  "This is a Markdown & CSV export. Export again from Notion with the format set to HTML: it " +
  "keeps the types and colours of database properties and the links between databases.";

const NOT_NOTION =
  "No Notion pages were found. Pick the .zip file Notion sent you, exported as HTML.";

type Node = {
  key: string;
  id: string;
  title: string;
  parent: Node | null;
  info: PageInfo | null;
  children: Node[];
  database: boolean;
};

function stop(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("The import was stopped", "AbortError");
}

const byTitle = (a: Node, b: Node) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });

export async function readNotionExport(
  files: readonly File[],
  context: ImportReadContext,
): Promise<ImportPlan> {
  context.onProgress({ done: 0, total: 0, label: "Opening the export" });
  return planFromEntries(await importEntries(files, { stripRoot: EXPORT_ROOT }), context);
}

export async function planFromEntries(
  entries: readonly ImportEntry[],
  context: ImportReadContext,
): Promise<ImportPlan> {
  const { signal } = context;
  const isPage = (e: ImportEntry) =>
    extensionOf(e.path) === "html" && notionIdOf(basename(e.path)) !== null;
  const isTable = (e: ImportEntry) =>
    ["md", "csv"].includes(extensionOf(e.path)) && notionIdOf(basename(e.path)) !== null;
  const pageEntries = entries.filter(isPage);
  if (pageEntries.length === 0) {
    throw new Error(
      entries.some((e) => extensionOf(e.path) === "md") ? MARKDOWN_EXPORT : NOT_NOTION,
    );
  }

  const warnings: ImportWarning[] = [];
  const warned = new Set<string>();
  const warn = (message: string, source?: string) => {
    const key = `${source ?? ""}\n${message}`;
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(source ? { message, source } : { message });
  };

  // ---- First pass: every page's title, properties and tables.
  const nodes = new Map<string, Node>();
  const nodeOfPath = new Map<string, Node>();
  const folderNode = (dir: string): Node | null => {
    if (!dir) return null;
    const segment = basename(dir);
    const notionId = notionIdOf(segment);
    const key = notionId ?? `folder:${dir}`;
    let node = nodes.get(key);
    if (!node) {
      node = {
        key,
        id: newImportId(),
        title: titleOfName(segment) || "Untitled",
        parent: folderNode(dirname(dir)),
        info: null,
        children: [],
        database: false,
      };
      nodes.set(key, node);
    }
    return node;
  };

  for (const [index, entry] of pageEntries.entries()) {
    stop(signal);
    context.onProgress({ done: index, total: pageEntries.length, label: "Reading pages" });
    const key = notionIdOf(basename(entry.path))!;
    const existing = nodes.get(key);
    if (existing?.info) continue;
    let info: PageInfo;
    try {
      info = readPage(entry.path, await entry.text());
    } catch (error) {
      warn(
        `Could not be read: ${error instanceof Error ? error.message : String(error)}`,
        entry.path,
      );
      continue;
    }
    let parent = folderNode(dirname(entry.path));
    // A page kept inside its own folder.
    if (parent?.key === key) parent = parent.parent;
    const node = existing ?? {
      key,
      id: newImportId(),
      title: "",
      parent,
      info: null,
      children: [],
      database: false,
    };
    node.info = info;
    node.title = info.title || titleOfName(basename(entry.path)) || "Untitled";
    if (!existing) nodes.set(key, node);
    nodeOfPath.set(entry.path, node);
  }

  for (const node of nodes.values()) node.parent?.children.push(node);
  for (const node of nodes.values()) {
    node.database = Boolean(node.info?.collection) || node.children.some((c) => c.info?.properties);
  }

  // A workspace export of one teamspace (or "Private & Shared") alone: its pages go at the top.
  let roots = [...nodes.values()].filter((n) => !n.parent);
  if (roots.length === 1 && !roots[0]!.info && !roots[0]!.database) {
    const only = roots[0]!;
    for (const child of only.children) child.parent = null;
    roots = only.children;
    nodes.delete(only.key);
  }

  // The tables of inline databases, from the pages that show them.
  const inlineTable = new Map<Node, CollectionTable>();
  for (const node of nodes.values()) {
    for (const table of node.info?.inline ?? []) {
      const row = table.rows.map((p) => nodeOfPath.get(p)).find(Boolean);
      if (row?.parent?.database && !row.parent.info) inlineTable.set(row.parent, table);
    }
  }

  // Siblings in the order their parent shows them (its links to sub-pages, a database's table),
  // then by title.
  const childOf = (parent: Node, path: string): Node | null => {
    for (let n = nodeOfPath.get(path) ?? null; n; n = n.parent) if (n.parent === parent) return n;
    return null;
  };
  const sortChildren = (parent: Node | null, list: Node[]) => {
    const order = parent?.info?.order ?? (parent ? (inlineTable.get(parent)?.rows ?? []) : []);
    const position = new Map<Node, number>();
    if (parent) {
      for (const path of order) {
        const child = childOf(parent, path);
        if (child && !position.has(child)) position.set(child, position.size);
      }
    }
    return list.sort((a, b) => {
      const pa = position.get(a);
      const pb = position.get(b);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return byTitle(a, b);
    });
  };
  const ordered: Node[] = [];
  const visit = (list: Node[], parent: Node | null) => {
    for (const node of sortChildren(parent, list)) {
      ordered.push(node);
      visit(node.children, node);
    }
  };
  visit(roots, null);

  const byId = new Map(ordered.map((n) => [n.id, n]));

  // ---- Files: the export's other files, uploaded with the page that shows them.
  const fileEntries = new Map(
    entries
      .filter((e) => !isPage(e) && !isTable(e) && basename(e.path) !== "index.html")
      .map((e) => [e.path, e]),
  );
  const files = new Map<string, ImportFile>();
  const fileOf = (path: string, pageId: string | null): string | null => {
    const known = files.get(path);
    if (known) return known.id;
    const entry = fileEntries.get(path);
    if (!entry) return null;
    let name = basename(path);
    try {
      name = decodeURIComponent(name);
    } catch {
      // Not encoded after all.
    }
    const file: ImportFile = {
      id: newImportId(),
      name,
      contentType: contentTypeOf(path),
      pageId,
      size: entry.size,
      read: entry.read,
    };
    files.set(path, file);
    return file.id;
  };

  const pageOf = (path: string) => nodeOfPath.get(path)?.id ?? null;
  const pageOfNotionId = (id: string) => (id ? (nodes.get(id)?.id ?? null) : null);
  const databaseOf = (pageId: string) => {
    const parent = byId.get(pageId)?.parent;
    return parent?.database ? parent.id : null;
  };

  // ---- Databases
  const dayFirst = inferDayFirst(
    ordered.flatMap((n) => n.info?.properties?.flatMap((c) => c.times.map((t) => t.text)) ?? []),
  );
  const database = new Map<Node, ReturnType<typeof buildDatabase>>();
  for (const node of ordered) {
    if (!node.database) continue;
    database.set(
      node,
      buildDatabase(
        {
          id: node.id,
          title: node.title,
          table: node.info?.collection ?? inlineTable.get(node) ?? null,
          rows: node.children.map((row) => ({
            id: row.id,
            title: row.title,
            dir: row.info ? dirname(row.info.path) : "",
            cells: row.info?.properties ?? [],
          })),
        },
        { pageOf, pageOfNotionId, databaseOf, fileOf, dayFirst, warn },
      ),
    );
  }

  // ---- Second pass: bodies.
  const pages: ImportPage[] = [];
  const entryOfPath = new Map(pageEntries.map((e) => [e.path, e]));
  const withBody = ordered.filter((n) => n.info);
  let converted = 0;
  for (const node of ordered) {
    stop(signal);
    const info = node.info;
    let markdown = "";
    const properties: Record<string, PropertyValue> = {};
    if (info) {
      context.onProgress({ done: converted++, total: withBody.length, label: "Converting pages" });
      if (info.icon) properties.icon = info.icon;
      if (info.cover && "url" in info.cover) properties.cover = info.cover.url;
      else if (info.cover) {
        const file = fileOf(info.cover.path, node.id);
        if (file) properties.cover = importFileRef(file);
      }
      try {
        const entry = entryOfPath.get(info.path)!;
        const doc = parsePage(await entry.text());
        const body = doc.querySelector(".page-body");
        const description = doc.querySelector(".page-description");
        const html =
          (description?.textContent?.trim() ? `<p>${description.innerHTML}</p>` : "") +
          (body
            ? prepareBody(body, {
                dir: dirname(info.path),
                pageOf,
                pageOfNotionId,
                databaseOfRow: (path) => {
                  const row = nodeOfPath.get(path);
                  return row?.parent?.database ? row.parent.id : null;
                },
                fileOf: (path) => fileOf(path, node.id),
                warn: (message) => warn(message, node.title),
              })
            : "");
        markdown = html.trim() ? context.app.editor.fromHtml(html) : "";
      } catch (error) {
        warn(
          `Its content could not be converted: ${error instanceof Error ? error.message : String(error)}`,
          node.title,
        );
      }
    }
    const built = database.get(node);
    const values = node.parent ? database.get(node.parent)?.values.get(node.id) : undefined;
    pages.push({
      id: node.id,
      parentId: node.parent?.id ?? null,
      title: node.title,
      markdown,
      ...(Object.keys(properties).length ? { properties } : {}),
      ...(built ? { database: built.database } : {}),
      ...(values && Object.keys(values).length ? { values } : {}),
    });
  }

  // Files nothing links to still come along, with the page whose folder they are in.
  for (const path of fileEntries.keys()) {
    if (files.has(path)) continue;
    let owner: Node | null = null;
    for (let dir = dirname(path); dir && !owner; dir = dirname(dir)) {
      const id = notionIdOf(basename(dir));
      owner = (id && nodes.get(id)) || null;
    }
    fileOf(path, owner?.id ?? null);
  }

  return { rootTitle: "Notion", pages, files: [...files.values()], warnings };
}
