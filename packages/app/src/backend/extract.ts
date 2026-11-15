import { extract as extractMarkdown } from "@lydie/markdown";
import type { Extract, ExtractedLink, Runtime } from "@lydie/runtime";
import type { Store } from "@lydie/store";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const NON_MARKDOWN_FILE = /\.(?!md$)[a-z0-9]{1,8}$/i;
const BLOCK_ID = /^[A-Za-z0-9-]{1,64}$/;

// @lydie/markdown's extractor in the shape @lydie/runtime stores (links, `^id` blocks, headings,
// tags, text): pass it as `createRuntime({ extract: markdownExtract })`. Same mapping as the file
// bridge's `extractBody`, for backends without a folder.
export const markdownExtract: Extract = (markdown) => {
  const x = extractMarkdown(markdown);
  const blockIdAt = new Map<number, string>();
  for (const b of x.blocks) if (b.id && BLOCK_ID.test(b.id)) blockIdAt.set(b.index, b.id);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const l of x.links) {
    if (l.block < 0) continue;
    const syntax = l.kind === "wikilink" || l.kind === "embed" ? "wikilink" : "markdown";
    const kind = l.kind === "embed" || l.kind === "image" ? "embed" : "link";
    const target = l.target.trim();
    if (!target) continue;
    if (syntax === "markdown" && (SCHEME.test(target) || NON_MARKDOWN_FILE.test(target))) continue;
    const link: ExtractedLink = {
      kind,
      syntax,
      target,
      heading: l.heading,
      blockId: l.blockId && BLOCK_ID.test(l.blockId) ? l.blockId : null,
      sourceBlockId: blockIdAt.get(l.block) ?? null,
    };
    const key = [kind, syntax, target, link.heading, link.blockId, link.sourceBlockId].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  return {
    links,
    blocks: x.blocks
      .filter((b) => b.id && BLOCK_ID.test(b.id))
      .map((b) => ({ id: b.id!, type: b.type, text: b.text, order: b.index })),
    headings: x.headings.map((h) => ({ level: h.level, text: h.text })),
    tags: x.tags,
    text: x.text,
  };
};

// Bump when what `markdownExtract` returns changes. A database without a folder has no files to
// re-read, so `reextractIfStale` re-extracts its stored bodies on the next open instead. (The file
// bridge keeps its own INDEX_VERSION.)
export const MARKDOWN_EXTRACT_VERSION = "1";

const VERSION_KEY = "extract_version";

// Re-extracts a local database's bodies with the runtime's extractor when they were indexed by
// another `MARKDOWN_EXTRACT_VERSION` (LYD-208), or before versions were recorded. The runtime must
// use `markdownExtract`. Resolves with whether it re-extracted.
export async function reextractIfStale(
  store: Pick<Store, "meta">,
  runtime: Pick<Runtime, "reindexBodies">,
  workspaceId: string,
): Promise<boolean> {
  if ((await store.meta.get(VERSION_KEY)) === MARKDOWN_EXTRACT_VERSION) return false;
  await runtime.reindexBodies(workspaceId);
  await store.meta.set(VERSION_KEY, MARKDOWN_EXTRACT_VERSION);
  return true;
}
