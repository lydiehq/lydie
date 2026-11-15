// What an importer reads a source into, and `runImport` writes: pages (some of them databases, whose
// child pages are their rows), files, and what did not carry over. A plan is plain data, the same
// for every source, so writing it (through operations, in every kind of workspace) is done once.
import type { PropertyConfigInput, PropertyType, PropertyValue } from "@lydie/contract";
import type { ReactNode } from "react";

import type { AppApi } from "../plugin.ts";

export type ImportPlan = {
  // The title of the page everything is imported under ("Notion"). It gets a number when a
  // top-level page already has it.
  rootTitle: string;
  // Parents before their children.
  pages: ImportPage[];
  files: ImportFile[];
  warnings: ImportWarning[];
};

export type ImportPage = {
  // The new document's id (`newImportId()`), so pages, links and relations can name each other.
  id: string;
  // A page of this plan, or null for the root page.
  parentId: string | null;
  title: string;
  // Lydie Markdown. Links to pages of the plan are `[[${importLink(id)}]]` (with an alias), files
  // `![[${importFileRef(id)}]]`: the writer turns them into links that resolve to what was made.
  markdown: string;
  // Frontmatter and page options (icon, cover); a cover may be `importFileRef(id)`.
  properties?: Record<string, PropertyValue>;
  // Makes the page a database; the pages under it are its rows.
  database?: ImportDatabase;
  // A row's values by `ImportProperty.id`. Relations hold page ids, files `importFileRef`s.
  values?: Record<string, PropertyValue>;
};

export type ImportDatabase = {
  // The name of the title property ("Name").
  titleName?: string;
  // In order. A relation's `config.relation.databaseId` is a database page of the plan.
  properties: ImportProperty[];
};

export type ImportProperty = {
  id: string;
  name: string;
  type: PropertyType;
  // The frontmatter key; the name when left out.
  key?: string;
  config?: PropertyConfigInput;
};

export type ImportFile = {
  id: string;
  // The attachment's file name. The writer adds a number when the workspace already has it.
  name: string;
  contentType: string;
  // The page it belongs to (a page of the plan), or null.
  pageId: string | null;
  size: number;
  read: () => Promise<Uint8Array>;
};

export type ImportWarning = {
  message: string;
  // Where it happened (a page's title or a file's path).
  source?: string;
};

export type ImportProgress = { done: number; total: number; label?: string };

export type ImportReadContext = {
  app: AppApi;
  onProgress(progress: ImportProgress): void;
  signal: AbortSignal;
};

// A source the Import and export settings page offers (Notion, Markdown files).
export type ImporterDef = {
  id: string;
  name: string;
  // One line under the name.
  description: string;
  icon?: ReactNode;
  order?: number;
  // What the file picker accepts (".zip", ".md"). Several files may be picked.
  accept: readonly string[];
  // Shown above the file picker: how to get the files out of the source.
  instructions?: ReactNode;
  // Throws an Error with a message for the person when the files cannot be imported.
  read(files: readonly File[], context: ImportReadContext): Promise<ImportPlan>;
};

const LINK = "lydie-import:";
const FILE = "lydie-file:";

// The wiki-link target of a page of the plan, before it is written.
export const importLink = (pageId: string) => `${LINK}${pageId}`;
// An inline database: `![[${importDatabaseEmbed(id)}]]`.
export const importDatabaseEmbed = (pageId: string) => `${LINK}${pageId}.base`;
// A file of the plan, in an embed, a cover or a files value.
export const importFileRef = (fileId: string) => `${FILE}${fileId}`;

export const IMPORT_LINK_PREFIX = LINK;
export const IMPORT_FILE_PREFIX = FILE;

// Version 7 UUIDs (time first), as the runtime mints, so imported documents sort as they were made.
let lastMs = 0;
let sequence = 0;
export function newImportId(): string {
  const now = Date.now();
  sequence = now === lastMs ? sequence + 1 : 0;
  lastMs = now;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(40 - i * 8)) & 0xffn);
  // 12 bits of sequence keep ids made in the same millisecond in order.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
