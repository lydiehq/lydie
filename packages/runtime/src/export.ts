// Workspace export (`workspace.export`, backups): the workspace as the folder format
// (@lydie/contract's `planFolder`), read through the ports, and zipped as a stream. The hosted core
// runs the same code over its Postgres ports, so a hosted export and a local one are the same files.
import type { DatabaseDefinition, Document, FolderSections } from "@lydie/contract";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

import type { Blob, DbRead } from "./ports.ts";

export type ExportEntry = {
  // Vault-relative, forward slashes; a trailing `/` is an empty folder.
  path: string;
  data: string | Uint8Array;
  modified?: Date;
};

export type ExportSource = {
  // Each call may be its own transaction: bodies are read one at a time, so a large workspace never
  // sits in memory (or in one long transaction) as a whole.
  read<T>(fn: (tx: DbRead) => Promise<T>): Promise<T>;
  blob?: Blob | undefined;
};

// @lydie/markdown's `rewriteLinks` (the runtime does not depend on it): `rewrite` returns a link's
// new target, or undefined to leave it; only link bytes change.
export type RewriteLinks = (
  markdown: string,
  rewrite: (link: { kind: string; target: string }) => string | undefined,
) => string;

export type ExportOptions = {
  attachmentsFolder?: string;
  // Called after each entry, for progress.
  onEntry?: (done: number, total: number) => void;
  // Rewrites links to attachments by id (`attachment:<id>`, API URLs, as hosted bodies may have)
  // to the files in the export. Without it bodies are written as stored.
  rewriteLinks?: RewriteLinks;
  // A folder per section for the top-level documents (the core: per teamspace, "Private").
  sections?: FolderSections;
};

// Cheap test before parsing a body for links to attachments by id.
const MAY_LINK_ATTACHMENT = /attachment:|\/attachments\//;

// The files of a workspace in the folder format: every live document the ports return (on the
// core: what the caller can read), the databases among them and their attachments.
export async function* exportWorkspace(
  source: ExportSource,
  workspaceId: string,
  options: ExportOptions = {},
): AsyncGenerator<ExportEntry> {
  const snapshot = await source.read(async (tx) => {
    const tree = await tx.docs.tree(workspaceId, { includeDeleted: false });
    const documents: Document[] = tree.map(({ depth: _depth, ...doc }) => doc);
    const live = new Set(documents.map((d) => d.id));
    const databases: DatabaseDefinition[] = [];
    for (const database of (await tx.databases?.list(workspaceId)) ?? []) {
      if (!live.has(database.id)) continue;
      const [properties, views] = await Promise.all([
        tx.databases!.properties(database.id),
        tx.databases!.views(database.id),
      ]);
      databases.push({ database, properties, views });
    }
    const attachments = (await tx.attachments?.list(workspaceId)) ?? [];
    return { documents, databases, attachments };
  });
  const updatedAt = new Map(snapshot.documents.map((d) => [d.id, new Date(d.updatedAt)]));
  // On first use: the planner loads `yaml`, which the runtime does not need to start.
  const { planFolder } = await import("@lydie/contract/files");
  const plan = planFolder({
    workspaceId,
    ...snapshot,
    ...(options.attachmentsFolder ? { attachmentsFolder: options.attachmentsFolder } : {}),
    ...(options.sections ? { sections: options.sections } : {}),
  });
  const total = plan.entries.length;
  let done = 0;
  const written = new Set<string>();
  for (const entry of plan.entries) {
    switch (entry.kind) {
      case "note": {
        const body = await source.read((tx) => tx.bodies.get(entry.documentId));
        const markdown = body?.markdown ?? "";
        if (entry.optional && markdown === "") break;
        const modified = updatedAt.get(entry.documentId);
        let text = entry.head + markdown;
        if (options.rewriteLinks && MAY_LINK_ATTACHMENT.test(markdown)) {
          text = options.rewriteLinks(text, (link) => plan.attachmentLink(entry.documentId, link));
        }
        yield { path: entry.path, data: text, ...(modified ? { modified } : {}) };
        break;
      }
      case "text":
        yield { path: entry.path, data: entry.text };
        break;
      case "folder":
        yield { path: `${entry.path}/`, data: "" };
        break;
      case "attachment": {
        const bytes = await source.blob?.get(entry.attachment.sha256);
        // Bytes that never arrived (an unfinished upload) are left out, with their rows.
        if (!bytes) break;
        written.add(entry.attachment.sha256);
        yield { path: entry.path, data: bytes, modified: new Date(entry.attachment.createdAt) };
        break;
      }
    }
    options.onEntry?.(++done, total);
  }
  for (const file of plan.meta(written)) yield { path: file.path, data: file.text };
}

const COMPRESSIBLE = /\.(?:md|base|json|txt|csv|svg|html?)$/i;

// A zip of `entries`, produced as it is read: one entry is in memory at a time. Text is deflated,
// other files (images, PDFs: already compressed) are stored.
export function zipStream(entries: AsyncIterable<ExportEntry>): ReadableStream<Uint8Array> {
  const iterator = entries[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let zip: Zip;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        if (chunk.length) controller.enqueue(chunk);
        if (final) controller.close();
      });
    },
    async pull() {
      const next = await iterator.next();
      if (next.done) {
        zip.end();
        return;
      }
      const { path, data, modified } = next.value;
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const file =
        COMPRESSIBLE.test(path) && bytes.length > 0
          ? new ZipDeflate(path, { level: 6 })
          : new ZipPassThrough(path);
      if (modified && !Number.isNaN(modified.getTime())) file.mtime = modified;
      zip.add(file);
      file.push(bytes, true);
    },
    async cancel(reason) {
      zip.terminate();
      await iterator.return?.(reason);
    },
  });
}

// "Notes 2026-11-15.zip": the workspace's name (made safe for a file name) and the day.
export function exportFilename(name: string, now: Date): string {
  // oxlint-disable-next-line no-control-regex
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Lydie";
  return `${safe} ${now.toISOString().slice(0, 10)}.zip`;
}
