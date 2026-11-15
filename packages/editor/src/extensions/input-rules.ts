import { InputRule } from "@tiptap/core";
import type { NodeType } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

// Replaces the whole textblock with a block atom when its text matches `find` (anchored at the
// start), e.g. `![[Note]]` → embed. Only fires when the match covers the whole block.
export function blockAtomInputRule(options: {
  find: RegExp;
  type: NodeType;
  getAttributes: (match: RegExpMatchArray) => Record<string, unknown>;
}) {
  return new InputRule({
    find: options.find,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from);
      const block = $from.parent;
      if (!block.isTextblock || range.from !== $from.start()) return null;
      if (range.to < $from.end()) return null;

      const { tr } = state;
      const start = $from.before();
      const end = $from.after();
      tr.replaceWith(start, end, options.type.create(options.getAttributes(match)));
      const after = tr.doc.resolve(Math.min(start + 1, tr.doc.content.size));
      tr.setSelection(TextSelection.near(after));
    },
  });
}

// Replaces the whole match with an inline atom. TipTap's nodeInputRule replaces only the first
// capture group, which leaves the brackets of `[[…]]` and `[^…]` behind.
export function inlineAtomInputRule(options: {
  find: RegExp;
  type: NodeType;
  getAttributes: (match: RegExpMatchArray) => Record<string, unknown>;
}) {
  return new InputRule({
    find: options.find,
    handler: ({ state, range, match }) => {
      state.tr.replaceWith(range.from, range.to, options.type.create(options.getAttributes(match)));
    },
  });
}
