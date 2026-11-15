// @lydie/markdown: Lydie Markdown ⇄ ProseMirror. See AGENTS.md for the API and SPEC.md for the dialect.
import { serializeFrontmatter } from "./frontmatter";
import type { Properties } from "./frontmatter";
import { importDoc } from "./normalize";
import type { DocInput } from "./normalize";
import { serializeBody } from "./serialize";

export { schema } from "./schema";
export type { MarkName, NodeName } from "./schema";
export { parse } from "./parse";
export type { Fallback, Hints, ParseResult, Span } from "./parse";
export { save } from "./save";
export type { SaveInput, SaveResult } from "./save";
export { reconcile } from "./reconcile";
export type { ReconcileInput, ReconcileResult, ReplaceStepJSON } from "./reconcile";
export { merge3 } from "./merge";
export type { MergeResult, TextConflict } from "./merge";
export { assignBlockId, extract, plainText, rewriteLinks } from "./extract";
export { columnShares } from "./columns";
export type { BlockIdRef, BlockInfo, Extracted, HeadingInfo, LinkKind, LinkRef } from "./extract";
export { importDoc, normalizeForMarkdown } from "./normalize";
export type { DocInput } from "./normalize";
export type { Frontmatter, Properties } from "./frontmatter";

// Canonical Markdown for a document that has no source yet (a new file, an export).
export function serialize(
  doc: DocInput,
  properties?: Properties | null,
  options: { eol?: "\n" | "\r\n" } = {},
): string {
  const eol = options.eol ?? "\n";
  const head =
    properties && Object.keys(properties).length ? serializeFrontmatter(properties, eol) : "";
  return head + serializeBody(importDoc(doc), eol);
}
