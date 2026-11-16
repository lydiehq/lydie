// Find in page (Mod+F): the matches of a query in the editor's document, painted as decorations.
// Local view state only: setting the query or moving between matches dispatches meta-only
// transactions (no doc change, not added to history), so nothing is saved and nothing syncs.
import {
  changedTextblocks,
  Decoration,
  DecorationSet,
  Extension,
  Plugin,
  PluginKey,
  wikiLinkLabel,
} from "@lydie/plugin-api/editor";
import type {
  EditorState,
  ProseMirrorNode,
  Transaction,
  WikiLinkAttrs,
} from "@lydie/plugin-api/editor";

export type Match = { from: number; to: number };

export type FindState = {
  query: string;
  matches: readonly Match[];
  // Index into `matches`; -1 when there are none.
  current: number;
  decorations: DecorationSet;
};

export type FindMeta = { query: string; anchor?: number } | { step: 1 | -1 } | { current: number };

export const findKey = new PluginKey<FindState>("editor-view:find");

const MATCH_CLASS = "rounded-[2px] bg-yellow-200";
const CURRENT_CLASS = "rounded-[2px] bg-orange-300";

// Lower case per UTF-16 unit, so indexes into the folded text are indexes into the original
// (a few characters change length when lowered; those stay as they are).
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

// What an inline atom shows. TipTap's `renderText` does not reach the schema's `leafText`, so the
// wiki link (the atom people read as text) is named here.
function atomText(node: ProseMirrorNode): string {
  if (node.type.name === "wikiLink") return wikiLinkLabel(node.attrs as WikiLinkAttrs);
  return node.type.spec.leafText?.(node) ?? "";
}

// Every case-insensitive occurrence of `query`, in document order, within one textblock each (a
// match may span text split by marks, not paragraphs). Inline atoms count as their text (a wiki
// link's label) and match whole; hard breaks and other leaves without text separate words.
export function findMatches(doc: ProseMirrorNode, query: string): Match[] {
  if (!query) return [];
  const needle = fold(query);
  const matches: Match[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    blockMatches(block, blockPos, needle, matches);
    return false;
  });
  return matches;
}

// The matches of `needle` (folded) in one textblock at `blockPos`, appended to `out`.
function blockMatches(block: ProseMirrorNode, blockPos: number, needle: string, out: Match[]) {
  let text = "";
  // Document positions of each character's start and end.
  const starts: number[] = [];
  const ends: number[] = [];
  block.descendants((child, offset) => {
    const pos = blockPos + 1 + offset;
    if (child.isText) {
      const value = child.text ?? "";
      text += value;
      for (let i = 0; i < value.length; i++) {
        starts.push(pos + i);
        ends.push(pos + i + 1);
      }
    } else if (child.isLeaf) {
      const value = atomText(child) || "￼";
      text += value;
      for (let i = 0; i < value.length; i++) {
        starts.push(pos);
        ends.push(pos + child.nodeSize);
      }
    }
    return true;
  });
  const haystack = fold(text);
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  ) {
    const from = starts[i];
    const to = ends[i + needle.length - 1];
    if (from !== undefined && to !== undefined) out.push({ from, to });
  }
}

// The matches after an edit, from those before it: the textblocks the transaction touched are
// searched again, the others' matches only move. The same as `findMatches(tr.doc, query)`, without
// walking the whole document per keystroke.
export function remapMatches(tr: Transaction, matches: readonly Match[], query: string): Match[] {
  const changed = changedTextblocks(tr);
  if (changed.length === 0 && matches.length === 0) return [];
  const needle = fold(query);
  const fresh: Match[] = [];
  for (const { node, pos } of changed) blockMatches(node, pos, needle, fresh);
  // Kept: matches outside the touched blocks, whose text is as it was (a block that was deleted
  // whole leaves its matches collapsed).
  const kept: Match[] = [];
  let c = 0;
  for (const m of matches) {
    const from = tr.mapping.map(m.from, 1);
    const to = tr.mapping.map(m.to, -1);
    if (to <= from) continue;
    while (c < changed.length && changed[c]!.pos + changed[c]!.node.nodeSize <= from) c++;
    const block = changed[c];
    if (block && block.pos < to && from < block.pos + block.node.nodeSize) continue;
    kept.push({ from, to });
  }
  // Both are in document order and never overlap: merge.
  const out: Match[] = [];
  let i = 0;
  let j = 0;
  while (i < kept.length || j < fresh.length) {
    if (j >= fresh.length || (i < kept.length && kept[i]!.from < fresh[j]!.from))
      out.push(kept[i++]!);
    else out.push(fresh[j++]!);
  }
  return out;
}

// The next (or previous) match, wrapping around; -1 without matches.
export function stepMatch(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

// The first match at or after `pos`, wrapping to the first; -1 without matches.
export function matchAt(matches: readonly Match[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

function decorate(doc: ProseMirrorNode, matches: readonly Match[], current: number) {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      i === current
        ? Decoration.inline(m.from, m.to, { class: CURRENT_CLASS, "data-find-current": "" })
        : Decoration.inline(m.from, m.to, { class: MATCH_CLASS, "data-find-match": "" }),
    ),
  );
}

const EMPTY: FindState = { query: "", matches: [], current: -1, decorations: DecorationSet.empty };

function next(
  query: string,
  matches: readonly Match[],
  current: number,
  doc: ProseMirrorNode,
): FindState {
  return { query, matches, current, decorations: decorate(doc, matches, current) };
}

export function findPlugin() {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(findKey) as FindMeta | undefined;
        if (meta && "query" in meta) {
          if (!meta.query) return EMPTY;
          const matches = findMatches(state.doc, meta.query);
          return next(meta.query, matches, matchAt(matches, meta.anchor ?? 0), state.doc);
        }
        if (meta && "step" in meta) {
          const current = stepMatch(prev.current, prev.matches.length, meta.step);
          return next(prev.query, prev.matches, current, state.doc);
        }
        if (meta && "current" in meta) {
          return next(prev.query, prev.matches, meta.current, state.doc);
        }
        if (!tr.docChanged || !prev.query) return prev;
        // Edited (here, by a collaborator or from disk): search again, staying on the same match.
        const matches = remapMatches(tr, prev.matches, prev.query);
        const was = prev.matches[prev.current];
        const current = was ? matchAt(matches, tr.mapping.map(was.from, -1)) : matchAt(matches, 0);
        return next(prev.query, matches, current, state.doc);
      },
    },
    props: {
      decorations: (state) => findKey.getState(state)?.decorations,
    },
  });
}

export const FindExtension = Extension.create({
  name: "editorViewFind",
  addProseMirrorPlugins: () => [findPlugin()],
});

export function findState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY;
}

// A transaction that only changes the find state: off the undo stack, the document untouched.
export function findTransaction(state: EditorState, meta: FindMeta): Transaction {
  return state.tr.setMeta(findKey, meta).setMeta("addToHistory", false);
}
