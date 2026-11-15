// Reconciling a file that changed on disk with the document open in the editor (spike S2).
//
//   ours   = save(base, editor document)        the editor's state, spliced onto the base text
//   merged = merge3(base, ours, disk)           line diff3, word-level retry on conflicts
//   steps  = blockDiff(editor document, parse(merged))
//
// `steps` are ProseMirror replace steps against the editor's current document, touching only the
// blocks (and inside them, only the range) that differ, so cursors and block ids elsewhere survive.
import { Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";

import { align } from "./align";
import type { Properties } from "./frontmatter";
import { merge3 } from "./merge";
import type { TextConflict } from "./merge";
import { fingerprint, importDoc, normalizeForMarkdown } from "./normalize";
import type { DocInput } from "./normalize";
import { parse } from "./parse";
import type { ParseResult } from "./parse";
import { save } from "./save";
import { schema } from "./schema";

export type ReplaceStepJSON = {
  // Positions in the editor's current document.
  from: number;
  to: number;
  // `Slice.toJSON()` in the Lydie schema: apply with `tr.replace(from, to, Slice.fromJSON(schema, slice))`.
  slice: ReturnType<Slice["toJSON"]>;
};

export type ReconcileInput = {
  // The last agreed version (LCA) of the file, as source or parse.
  base: ParseResult | string;
  // What is on disk now.
  disk: string;
  // The editor's current document (any schema with the Lydie names, or JSON).
  doc: DocInput;
  // The editor's current properties; omit if the editor does not edit frontmatter.
  properties?: Properties | null;
};

export type ReconcileResult =
  | {
      status: "clean";
      // The merged file. Write it to disk if it differs from `disk`; it is the new base.
      source: string;
      parse: ParseResult;
      // Steps that turn the editor's document into `parse.doc`, in descending position order, so
      // applying them one after another in the given order keeps positions valid.
      steps: ReplaceStepJSON[];
      properties: Properties | null;
    }
  | {
      status: "conflict";
      conflicts: TextConflict[];
      // The merge with git-style markers (`<<<<<<< editor` / `=======` / `>>>>>>> disk`).
      marked: string;
      // The editor's state serialised onto the base, for a conflict UI.
      ours: string;
    };

export function reconcile(input: ReconcileInput): ReconcileResult {
  const base = typeof input.base === "string" ? parse(input.base) : input.base;
  const current = importDoc(input.doc);
  const ours = save({ original: base, doc: current, properties: input.properties }).source;
  const merged = merge3(base.source, ours, input.disk);
  if (!merged.clean)
    return { status: "conflict", conflicts: merged.conflicts, marked: merged.marked, ours };
  const result = parse(merged.text);
  return {
    status: "clean",
    source: merged.text,
    parse: result,
    steps: diffDocs(current, result.doc),
    properties: result.properties,
  };
}

function isEmptyParagraph(node: Node): boolean {
  return node.type === schema.nodes.paragraph && node.childCount === 0;
}

function blockFingerprint(node: Node): string {
  return fingerprint(normalizeForMarkdown(schema.nodes.doc.create(null, node)).firstChild!);
}

// Replace steps turning `current` into `next`, block by block. Empty paragraphs in the editor
// (which Markdown cannot hold) are left alone.
export function diffDocs(current: Node, next: Node): ReplaceStepJSON[] {
  const curIndex: number[] = [];
  const curPos: number[] = [];
  current.forEach((child, offset, i) => {
    if (!isEmptyParagraph(child)) {
      curIndex.push(i);
      curPos.push(offset);
    }
  });
  const cur = curIndex.map((i) => current.child(i));
  const nxt: Node[] = [];
  next.forEach((c) => {
    if (!isEmptyParagraph(c)) nxt.push(c);
  });
  const ops = align(
    cur.map(blockFingerprint),
    nxt.map(blockFingerprint),
    cur.map((n) => n.type.name),
    nxt.map((n) => n.type.name),
  );

  const steps: ReplaceStepJSON[] = [];
  // Position right after the last kept/changed block, where insertions go.
  let cursor = 0;
  let hunk: { from: number; to: number; nodes: Node[] } | null = null;
  const flush = () => {
    if (hunk && (hunk.from !== hunk.to || hunk.nodes.length)) {
      steps.push({
        from: hunk.from,
        to: hunk.to,
        slice: new Slice(fragment(hunk.nodes), 0, 0).toJSON(),
      });
    }
    hunk = null;
  };
  for (const op of ops) {
    if (op.kind === "keep" || op.kind === "change") {
      flush();
      const start = curPos[op.a]!;
      const node = cur[op.a]!;
      if (op.kind === "change") steps.push(...diffBlock(node, nxt[op.b]!, start));
      cursor = start + node.nodeSize;
    } else if (op.kind === "delete") {
      const start = curPos[op.a]!;
      const node = cur[op.a]!;
      hunk ??= { from: start, to: start, nodes: [] };
      hunk.to = start + node.nodeSize;
      cursor = hunk.to;
    } else {
      hunk ??= { from: cursor, to: cursor, nodes: [] };
      hunk.nodes.push(nxt[op.b]!);
    }
  }
  flush();
  return steps.sort((a, b) => b.from - a.from);
}

function fragment(nodes: Node[]) {
  return Fragment.fromArray(nodes);
}

// The narrowest replace step inside one block.
function diffBlock(a: Node, b: Node, pos: number): ReplaceStepJSON[] {
  if (!a.sameMarkup(b)) {
    return [{ from: pos, to: pos + a.nodeSize, slice: new Slice(fragment([b]), 0, 0).toJSON() }];
  }
  const start = a.content.findDiffStart(b.content);
  if (start === null) return [];
  const end = a.content.findDiffEnd(b.content)!;
  let endA = end.a;
  let endB = end.b;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  const slice = b.slice(start, endB);
  return [{ from: pos + 1 + start, to: pos + 1 + endA, slice: slice.toJSON() }];
}
