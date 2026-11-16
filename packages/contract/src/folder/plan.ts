// The folder format (plan §1, "export guarantee"): a workspace as a folder of Markdown files that
// Lydie's local mode and Obsidian open as a vault. The file bridge (@lydie/bridge-fs) keeps such a
// folder in step with a database; this module lays a whole workspace out at once, for exports and
// backups. Both follow the same rules (`client/packages/bridge-fs/AGENTS.md`, "On-disk rules"):
//
//   <Title>.md                  a document: frontmatter (`id:` and its properties) + its body
//   <Title>/                    its children (a note with children is `<Title>.md` + `<Title>/`)
//   <Folder>/<Folder>.base      a database: rows are the folder's notes, the definition the .base
//   attachments/<file>          attachment bytes, once per SHA-256
//   .lydie/workspace.json       { version, workspaceId }
//   .lydie/ids.json             ids of documents that have no `id:` of their own (databases)
//   .lydie/order.json           manual sibling order where it differs from name order
//   .lydie/attachments.json     the attachment rows, so their ids survive
//
// Pure: no I/O. Bodies and bytes are read by the caller, one at a time, while it writes.
// It loads `yaml`, so it is reached through the `@lydie/contract/files` entry point; the names and
// helpers that do not need it are in `./format.ts`.
import { stringify } from "yaml";

import { toBase } from "../database/base-file.ts";
import type { DatabaseDefinition, DatabaseProperty } from "../database/entities.ts";
import { toFileValue } from "../database/values.ts";
import type { Attachment, Document, Properties } from "../entities.ts";
import {
  attachmentIdIn,
  baseDefinitionOf,
  baseFileFor,
  DEFAULT_ATTACHMENTS_FOLDER,
  FOLDER_FORMAT_VERSION,
  META_DIR,
} from "./format.ts";
import type { AttachmentRecord } from "./format.ts";
import { compareNames, fileNameFor, uniqueName } from "./names.ts";

export type FolderSnapshot = {
  workspaceId: string;
  // Live documents in any order. A document whose parent is not listed is laid out at the top
  // level (a page shared on its own, a parent the reader cannot see).
  documents: readonly Document[];
  // Definitions of live databases (their documents are in `documents`).
  databases: readonly DatabaseDefinition[];
  // Live attachments.
  attachments: readonly Attachment[];
  attachmentsFolder?: string;
  // Top-level documents grouped into folders (hosted: a teamspace, the private section).
  sections?: FolderSections;
};

// A folder per section, in `list` order, holding the top-level documents `of` assigns to it
// (documents it gives null stay at the top level, before the sections). A section folder is not a
// document of the snapshot and has no note or id: opened as a vault, it becomes a top-level page
// like any folder without a note. Sections without documents get no folder.
export type FolderSections = {
  list: readonly { id: string; name: string }[];
  of(documentId: string): string | null;
};

export type FolderEntry =
  // `head + body`. `optional`: a database's own note, written only when it has a body or
  // properties (a database is a folder; it gets a note only then, as in the bridge).
  | { kind: "note"; path: string; documentId: string; head: string; optional: boolean }
  | { kind: "text"; path: string; text: string }
  // Bytes of an attachment (the first row with these bytes; the others share the file).
  | { kind: "attachment"; path: string; attachment: Attachment }
  // An empty folder (a database without rows).
  | { kind: "folder"; path: string };

export type FolderPlan = {
  // Notes and folders depth-first in tree order, then .base files, then attachments.
  entries: FolderEntry[];
  // Vault-relative key of a document (its path without `.md`).
  keyOf(documentId: string): string | null;
  // What a link in a document points at instead, when it names an attachment by id
  // (`attachmentIdIn`): its vault path in a wikilink or embed, the path relative to the note in a
  // Markdown link or image. undefined for other links and attachments that are not in the folder.
  attachmentLink(documentId: string, link: { kind: string; target: string }): string | undefined;
  // `.lydie/` files. `written`: the SHA-256s whose bytes made it into the folder; rows whose bytes
  // were missing (an upload that never finished) are left out.
  meta(written?: ReadonlySet<string>): { path: string; text: string }[];
};

// The frontmatter block of a new file. Same bytes as @lydie/markdown's `serialize` (one YAML pair
// per key, no line folding), which the bridge's tests check.
export function frontmatterBlock(properties: Record<string, unknown>, eol = "\n"): string {
  const lines = Object.entries(properties).map(([key, value]) =>
    stringify({ [key]: value }, { lineWidth: 0 })
      .replace(/\n$/, "")
      .split("\n")
      .join(eol),
  );
  return `---${eol}${lines.map((l) => l + eol).join("")}---${eol}`;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

const bySortKey = (a: Document, b: Document) =>
  a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function planFolder(snapshot: FolderSnapshot): FolderPlan {
  const attachmentsFolder = snapshot.attachmentsFolder ?? DEFAULT_ATTACHMENTS_FOLDER;
  const docs = new Map(snapshot.documents.filter((d) => !d.deletedAt).map((d) => [d.id, d]));
  const databases = new Map(
    snapshot.databases.filter((d) => docs.has(d.database.id)).map((d) => [d.database.id, d]),
  );
  const children = new Map<string | null, Document[]>();
  for (const doc of docs.values()) {
    const parent = doc.parentId && docs.has(doc.parentId) ? doc.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(doc);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort(bySortKey);

  // Keys first: row values and .base filters link to other documents by path.
  const keys = new Map<string, string>();
  const order: Record<string, string[]> = {};
  const tree: string[] = [];
  const join = (folder: string, name: string) => (folder === "" ? name : `${folder}/${name}`);
  // Names `list` in `folder` (after `taken`) and records the order where it is not by name.
  // `after`: names already taken in `folder` that come after the list (section folders).
  const placeList = (
    list: readonly Document[],
    folder: string,
    taken: string[],
    after: readonly string[] = [],
  ) => {
    const names: string[] = [];
    for (const doc of list) {
      const name = uniqueName(fileNameFor(doc.title), taken);
      taken.push(name);
      names.push(name);
      keys.set(doc.id, join(folder, name));
    }
    names.push(...after);
    const byName = [...names].sort(compareNames);
    if (names.some((n, i) => n !== byName[i])) order[folder] = names;
    for (const doc of list) {
      tree.push(doc.id);
      placeList(children.get(doc.id) ?? [], keys.get(doc.id)!, []);
    }
  };
  // The bridge never indexes the attachments folder: keep top-level documents out of it.
  const topTaken = [attachmentsFolder];
  const roots = children.get(null) ?? [];
  const sections = snapshot.sections;
  if (sections) {
    const known = new Set(sections.list.map((s) => s.id));
    const sectionOf = (doc: Document) => {
      const id = sections.of(doc.id);
      return id !== null && known.has(id) ? id : null;
    };
    // Section folders keep their names; the documents without a section come first.
    const folders: { name: string; members: Document[] }[] = [];
    for (const section of sections.list) {
      const members = roots.filter((doc) => sectionOf(doc) === section.id);
      if (!members.length) continue;
      const name = uniqueName(fileNameFor(section.name), topTaken);
      topTaken.push(name);
      folders.push({ name, members });
    }
    placeList(
      roots.filter((doc) => sectionOf(doc) === null),
      "",
      topTaken,
      folders.map((f) => f.name),
    );
    for (const { name, members } of folders) placeList(members, name, []);
  } else {
    placeList(roots, "", topTaken);
  }

  // Attachments: one file per SHA-256, named after the first row's file name.
  const attachmentPaths = new Map<string, string>();
  const bytesPaths = new Map<string, string>();
  const attachmentEntries: FolderEntry[] = [];
  const takenFiles: string[] = [];
  for (const a of [...snapshot.attachments]
    .filter((a) => !a.deletedAt)
    .sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0))) {
    let path = bytesPaths.get(a.sha256);
    if (!path) {
      const dot = a.filename.lastIndexOf(".");
      const stem = fileNameFor(dot > 0 ? a.filename.slice(0, dot) : a.filename);
      const ext = dot > 0 ? a.filename.slice(dot).replace(/[^.\w-]/g, "") : "";
      let name = `${stem}${ext}`;
      const lower = new Set(takenFiles.map((n) => n.toLowerCase()));
      for (let i = 1; lower.has(name.toLowerCase()); i++) name = `${stem} ${i}${ext}`;
      takenFiles.push(name);
      path = `${attachmentsFolder}/${name}`;
      bytesPaths.set(a.sha256, path);
      attachmentEntries.push({ kind: "attachment", path, attachment: a });
    }
    attachmentPaths.set(a.id, path);
  }

  const linkFor = (id: string) => keys.get(id) ?? attachmentPaths.get(id) ?? null;
  const allProperties = new Map<string, DatabaseProperty>();
  for (const def of databases.values()) for (const p of def.properties) allProperties.set(p.id, p);
  const ids: Record<string, string> = {};

  const entries: FolderEntry[] = [];
  for (const id of tree) {
    const doc = docs.get(id)!;
    const key = keys.get(id)!;
    const linked = doc.parentId
      ? databases.get(doc.parentId)?.properties.filter((p) => !p.deletedAt)
      : undefined;
    const properties: Properties = { ...doc.properties };
    for (const p of linked ?? []) {
      if (p.type !== "relation" && p.type !== "files") continue;
      const value = properties[p.key];
      if (value === undefined || value === null) continue;
      properties[p.key] = toFileValue(p, value, { linkFor });
    }
    const isDatabase = databases.has(id);
    // Documents carry their id in the file, as documents Lydie creates do (plan §3). A database
    // has a note only sometimes, so its id goes to the sidecar; so does the id of a document that
    // uses `id` as a property of its own.
    const writeId = !isDatabase && !Object.hasOwn(properties, "id");
    if (!writeId) ids[key] = id;
    const frontmatter = writeId ? { id, ...properties } : properties;
    const head = Object.keys(frontmatter).length ? frontmatterBlock(frontmatter) : "";
    entries.push({
      kind: "note",
      path: `${key}.md`,
      documentId: id,
      head,
      optional: isDatabase && head === "",
    });
    if (isDatabase && !(children.get(id)?.length ?? 0)) entries.push({ kind: "folder", path: key });
  }

  for (const [id, def] of databases) {
    const key = keys.get(id)!;
    const text = toBase(baseDefinitionOf(def), {
      folder: key,
      linkFor,
      resolveProperty: (propertyId) => {
        const p = allProperties.get(propertyId);
        return p ? { type: p.type, key: p.key } : null;
      },
    });
    entries.push({ kind: "text", path: `${key}/${baseFileFor(key)}`, text });
  }
  entries.push(...attachmentEntries);

  return {
    entries,
    keyOf: (id) => keys.get(id) ?? null,
    attachmentLink(documentId, link) {
      const id = attachmentIdIn(link.target);
      const path = id ? attachmentPaths.get(id) : undefined;
      const key = keys.get(documentId);
      if (!path || key === undefined) return undefined;
      if (link.kind === "wikilink" || link.kind === "embed") return path;
      const depth = key.split("/").length - 1;
      return "../".repeat(depth) + path;
    },
    meta(written) {
      const records: Record<string, AttachmentRecord> = {};
      for (const a of snapshot.attachments) {
        const path = attachmentPaths.get(a.id);
        if (!path || (written && !written.has(a.sha256))) continue;
        records[a.id] = {
          path,
          workspaceId: a.workspaceId,
          documentId: a.documentId,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          sha256: a.sha256,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          deletedAt: null,
          createdBy: a.createdBy ?? null,
          updatedBy: a.updatedBy ?? null,
        };
      }
      const workspace: Record<string, unknown> = {
        version: FOLDER_FORMAT_VERSION,
        workspaceId: snapshot.workspaceId,
      };
      if (attachmentsFolder !== DEFAULT_ATTACHMENTS_FOLDER) {
        workspace.attachmentsFolder = attachmentsFolder;
      }
      const out = [{ path: `${META_DIR}/workspace.json`, text: json(workspace) }];
      // Empty records are not written, as in the bridge.
      const files: [string, Record<string, unknown>][] = [
        ["ids.json", ids],
        ["order.json", order],
        ["attachments.json", records],
      ];
      for (const [name, record] of files) {
        if (Object.keys(record).length)
          out.push({ path: `${META_DIR}/${name}`, text: json(sorted(record)) });
      }
      return out;
    },
  };
}
