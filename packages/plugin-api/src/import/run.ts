// Writes an `ImportPlan` into the open workspace through operations, so the same import works in a
// folder, this browser's workspace and a cloud workspace (whose local replica uploads them).
//
// Order: every page (no body yet, so links made by the bodies resolve to pages that exist), the
// databases and their properties, the bodies, the files, then the row values (files values need
// the attachments' ids). Each step is a few small transactions rather than one long one, so the
// window stays responsive, and none of it is on an undo stack: the import sits under one page,
// which can be moved to the trash.
import type { PropertyValue } from "@lydie/contract";

import type { AppApi } from "../plugin.ts";
import { IMPORT_FILE_PREFIX, IMPORT_LINK_PREFIX, newImportId } from "./plan.ts";
import type { ImportPage, ImportPlan, ImportProperty, ImportWarning } from "./plan.ts";

export type ImportPhase = "pages" | "databases" | "bodies" | "files" | "values";

export type ImportRunProgress = { phase: ImportPhase; done: number; total: number };

export type ImportResult = {
  rootId: string;
  rootTitle: string;
  // Imported pages, databases and rows (the root page not counted).
  pages: number;
  databases: number;
  files: number;
  // File names that could not be added.
  failedFiles: string[];
  // The plan's, then what writing found.
  warnings: ImportWarning[];
  // Stopped before the end (`signal`): what was written so far stays.
  stopped: boolean;
};

export type RunImportOptions = {
  onProgress?: (progress: ImportRunProgress) => void;
  signal?: AbortSignal;
};

const PAGES_PER_STEP = 100;
const BODY_BYTES_PER_STEP = 512 * 1024;
const ROWS_PER_STEP = 200;
const TITLE_MAX = 255;
const LABEL = "Import";

// Titles as documents take them: one line, at most 255 characters, never empty.
export function importTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, TITLE_MAX).trim() : "Untitled";
}

const keyOf = (text: string) => text.normalize("NFC").toLowerCase();

// `base`, or `base 2`, `base 3` … when `taken` (lower-cased) has it.
export function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(keyOf(name)); n++) name = `${base} ${n}`;
  taken.add(keyOf(name));
  return name;
}

// `photo.png`, `photo 2.png`, … for attachments. Characters that would end an embed's target, or
// that a folder cannot have in a file name, become "-".
export function uniqueFileName(original: string, taken: Set<string>): string {
  const name =
    original
      .replace(/[[\]|#^\\/:*?"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "file";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let n = 2; taken.has(keyOf(candidate)); n++) candidate = `${stem} ${n}${ext}`;
  taken.add(keyOf(candidate));
  return candidate;
}

// A title that can be a segment of a wiki-link path: no characters that end or split a target.
const SAFE_SEGMENT = /^[^/\\[\]|#^]+$/;

// The wiki-link target of each page: its path from the top ("Notion/Projects/Plan"), which
// resolves to it alone, or its id when a title cannot be written in a path or two pages share the
// path (Notion allows two "Untitled" pages side by side).
export function linkTargets(
  pages: readonly Pick<ImportPage, "id" | "parentId" | "title">[],
  root: { id: string; title: string },
): Map<string, string> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const paths = new Map<string, string[]>();
  const pathOf = (id: string): string[] => {
    const known = paths.get(id);
    if (known) return known;
    const page = byId.get(id);
    if (!page) return [root.title];
    const path = [...(page.parentId ? pathOf(page.parentId) : [root.title]), page.title];
    paths.set(id, path);
    return path;
  };
  const counts = new Map<string, number>();
  for (const page of pages) {
    const key = keyOf(pathOf(page.id).join("/"));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const targets = new Map<string, string>();
  for (const page of pages) {
    const path = pathOf(page.id);
    const writable = path.every((s) => SAFE_SEGMENT.test(s) && s !== "." && s !== "..");
    const unique = counts.get(keyOf(path.join("/"))) === 1;
    targets.set(page.id, writable && unique ? path.join("/") : page.id);
  }
  return targets;
}

// The prefixes are letters, "-" and ":", which need no escaping.
const LINK_PATTERN = new RegExp(`\\[\\[${IMPORT_LINK_PREFIX}([0-9a-f-]{36})(\\.base)?`, "g");
const FILE_PATTERN = new RegExp(`\\[\\[${IMPORT_FILE_PREFIX}([0-9a-f-]{36})`, "g");

// Puts the real targets in a body: page links, inline databases and file embeds.
export function resolvePlaceholders(
  markdown: string,
  targets: ReadonlyMap<string, string>,
  fileNames: ReadonlyMap<string, string>,
): string {
  return markdown
    .replace(LINK_PATTERN, (match, id: string, base: string | undefined) => {
      const target = targets.get(id);
      if (!target) return match;
      // An id cannot carry `.base`; the database's page is embedded by id instead.
      return `[[${target}${base && target !== id ? ".base" : ""}`;
    })
    .replace(FILE_PATTERN, (match, id: string) => {
      const name = fileNames.get(id);
      return name ? `[[${name}` : match;
    });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runImport(
  app: Pick<AppApi, "backend" | "workspace">,
  plan: ImportPlan,
  options: RunImportOptions = {},
): Promise<ImportResult> {
  const { backend } = app;
  const workspaceId = app.workspace.workspaceId;
  const signal = options.signal;
  const warnings: ImportWarning[] = [...plan.warnings];
  const write = { history: false, label: LABEL } as const;

  const pages = plan.pages.map((p) => ({ ...p, title: importTitle(p.title) }));
  const databases = pages.filter((p) => p.database);
  const rows = pages.filter((p) => p.values && Object.keys(p.values).length > 0);
  const total = {
    pages: pages.length + 1,
    databases: databases.length,
    bodies: pages.filter((p) => p.markdown.trim()).length,
    files: plan.files.length,
    values: rows.length,
  };
  const report = (phase: ImportPhase, done: number) =>
    options.onProgress?.({ phase, done, total: total[phase] });

  const top = await backend.query("doc.children", { workspaceId, parentId: null });
  const rootTitle = uniqueName(
    importTitle(plan.rootTitle),
    new Set(top.map((d) => keyOf(d.title))),
  );
  const rootId = newImportId();
  const targets = linkTargets(pages, { id: rootId, title: rootTitle });

  const existing = await backend.query("attachment.list", { workspaceId });
  const takenFiles = new Set(existing.map((a) => keyOf(a.filename)));
  const fileNames = new Map(plan.files.map((f) => [f.id, uniqueFileName(f.name, takenFiles)]));
  const fileValue = (value: string) =>
    value.startsWith(IMPORT_FILE_PREFIX)
      ? (fileNames.get(value.slice(IMPORT_FILE_PREFIX.length)) ?? value)
      : value;

  const result: ImportResult = {
    rootId,
    rootTitle,
    pages: 0,
    databases: 0,
    files: 0,
    failedFiles: [],
    warnings,
    stopped: false,
  };
  const stopped = () => {
    if (signal?.aborted) result.stopped = true;
    return result.stopped;
  };

  // ---- Pages
  report("pages", 0);
  await backend.ops.doc.create(
    { workspaceId, id: rootId, parentId: null, title: rootTitle },
    write,
  );
  let done = 1;
  for (const chunk of chunks(pages, PAGES_PER_STEP)) {
    if (stopped()) return result;
    await backend.transaction(
      LABEL,
      async (ops) => {
        for (const page of chunk) {
          const properties: Record<string, PropertyValue> = {};
          for (const [key, value] of Object.entries(page.properties ?? {})) {
            properties[key] = typeof value === "string" ? fileValue(value) : value;
          }
          await ops.doc.create({
            workspaceId,
            id: page.id,
            parentId: page.parentId ?? rootId,
            title: page.title,
            properties,
          });
        }
      },
      write,
    );
    result.pages += chunk.length;
    report("pages", (done += chunk.length));
  }

  // ---- Databases: all of them first, so relations can point at any of them.
  report("databases", 0);
  const added = new Map<string, Map<string, ImportProperty>>();
  if (databases.length && !stopped()) {
    await backend.transaction(
      LABEL,
      async (ops) => {
        for (const page of databases) {
          const definition = await ops.database.create({ workspaceId, documentId: page.id });
          const title = definition.properties.find((p) => p.type === "title");
          const name = page.database!.titleName?.trim();
          if (title && name && name !== title.name) {
            await ops.database.renameProperty({ id: title.id, name });
          }
        }
      },
      write,
    );
  }
  for (const [index, page] of databases.entries()) {
    if (stopped()) return result;
    const properties = new Map<string, ImportProperty>();
    for (const property of page.database!.properties) {
      try {
        await backend.ops.database.addProperty(
          {
            databaseId: page.id,
            id: property.id,
            name: property.name,
            type: property.type,
            ...(property.key ? { key: property.key } : {}),
            config: property.config ?? {},
          },
          write,
        );
        properties.set(property.id, property);
      } catch (error) {
        warnings.push({
          source: page.title,
          message: `The property “${property.name}” could not be added: ${message(error)}`,
        });
      }
    }
    added.set(page.id, properties);
    result.databases++;
    report("databases", index + 1);
  }

  // ---- Bodies
  report("bodies", 0);
  let bodies = 0;
  let batch: { id: string; markdown: string }[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const step = batch;
    batch = [];
    bytes = 0;
    await backend.transaction(
      LABEL,
      async (ops) => {
        for (const body of step) await ops.doc.updateBody(body);
      },
      write,
    );
    report("bodies", (bodies += step.length));
  };
  for (const page of pages) {
    if (!page.markdown.trim()) continue;
    if (stopped()) return result;
    const markdown = resolvePlaceholders(page.markdown, targets, fileNames);
    batch.push({ id: page.id, markdown });
    bytes += markdown.length;
    if (batch.length >= PAGES_PER_STEP || bytes >= BODY_BYTES_PER_STEP) await flush();
  }
  await flush();

  // ---- Files
  report("files", 0);
  const attachmentIds = new Map<string, string>();
  for (const [index, file] of plan.files.entries()) {
    if (stopped()) return result;
    const filename = fileNames.get(file.id)!;
    try {
      const attachment = await backend.attachments.add(
        {
          workspaceId,
          documentId: file.pageId,
          filename,
          contentType: file.contentType || "application/octet-stream",
          data: await file.read(),
        },
        write,
      );
      attachmentIds.set(file.id, attachment.id);
      result.files++;
    } catch (error) {
      result.failedFiles.push(filename);
      warnings.push({ source: filename, message: `Not added: ${message(error)}` });
    }
    report("files", index + 1);
  }

  // ---- Row values
  report("values", 0);
  let valuesDone = 0;
  const byDatabase = new Map<string, ImportPage[]>();
  for (const row of rows) {
    if (!row.parentId || !added.has(row.parentId)) continue;
    byDatabase.set(row.parentId, [...(byDatabase.get(row.parentId) ?? []), row]);
  }
  for (const [databaseId, list] of byDatabase) {
    const properties = added.get(databaseId)!;
    const valuesOf = (row: ImportPage) => {
      const set: Record<string, PropertyValue> = {};
      for (const [propertyId, value] of Object.entries(row.values ?? {})) {
        const property = properties.get(propertyId);
        if (!property || value === null) continue;
        if (property.type === "files" && Array.isArray(value)) {
          const ids = value.flatMap((v) => {
            if (!v.startsWith(IMPORT_FILE_PREFIX)) return [v];
            const id = attachmentIds.get(v.slice(IMPORT_FILE_PREFIX.length));
            return id ? [id] : [];
          });
          if (ids.length) set[propertyId] = ids;
        } else set[propertyId] = value;
      }
      return set;
    };
    for (const chunk of chunks(list, ROWS_PER_STEP)) {
      if (stopped()) return result;
      const updates = chunk
        .map((row) => ({ rowId: row.id, set: valuesOf(row) }))
        .filter((u) => Object.keys(u.set).length > 0);
      if (updates.length) {
        try {
          await backend.ops.database.setValues({ databaseId, updates }, write);
        } catch {
          // One value the database refuses fails the whole step: retry it a value at a time, so
          // only what is refused is left out.
          for (const update of updates) {
            for (const [propertyId, value] of Object.entries(update.set)) {
              try {
                await backend.ops.database.setValues(
                  { databaseId, updates: [{ rowId: update.rowId, set: { [propertyId]: value } }] },
                  write,
                );
              } catch (error) {
                const row = chunk.find((r) => r.id === update.rowId);
                warnings.push({
                  source: row?.title,
                  message: `“${properties.get(propertyId)?.name}” was left empty: ${message(error)}`,
                });
              }
            }
          }
        }
      }
      report("values", (valuesDone += chunk.length));
    }
  }
  return result;
}
