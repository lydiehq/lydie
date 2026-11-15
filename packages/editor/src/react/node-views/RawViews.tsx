import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

import type { RawAttrs } from "../../extensions/raw";

// Markdown the editor cannot represent, shown as its source so it can still be edited. The source
// lives in an attribute; typing updates it (TipTap's node views let inputs keep their own keys).
export function RawBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const { source } = node.attrs as RawAttrs;
  return (
    <NodeViewWrapper data-type="raw-block">
      <div
        contentEditable={false}
        className="mb-1 font-sans text-xs font-medium text-gray-500 select-none"
      >
        Markdown source
      </div>
      <textarea
        aria-label="Markdown source"
        value={source}
        spellCheck={false}
        readOnly={!editor.isEditable}
        onChange={(event) => updateAttributes({ source: event.target.value })}
      />
    </NodeViewWrapper>
  );
}

// An input would drop the line breaks of a source over several lines (an MDX tag spread over
// lines is one inline raw node) and save it without them, so those get a textarea that wraps.
export function RawInlineView({ node, updateAttributes, editor }: NodeViewProps) {
  const { source } = node.attrs as RawAttrs;
  if (source.includes("\n")) {
    return (
      <NodeViewWrapper as="span" data-type="raw-inline" data-multiline="">
        <textarea
          aria-label="Markdown source"
          value={source}
          spellCheck={false}
          readOnly={!editor.isEditable}
          rows={source.split("\n").length}
          onChange={(event) => updateAttributes({ source: event.target.value })}
        />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="span" data-type="raw-inline">
      <input
        aria-label="Markdown source"
        value={source}
        spellCheck={false}
        readOnly={!editor.isEditable}
        size={Math.max(source.length, 1)}
        onChange={(event) => updateAttributes({ source: event.target.value })}
        className="bg-transparent font-[inherit] text-[length:inherit] text-inherit outline-none"
      />
    </NodeViewWrapper>
  );
}
