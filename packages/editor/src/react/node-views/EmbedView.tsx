import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

import { embedSource } from "../../extensions/embed";
import type { EmbedAttrs } from "../../extensions/embed";
import { useLydieEditorSlots } from "../context";

// `![[target]]`: what to show is the host's business (`renderEmbed`); without it, the source.
export function EmbedView({ node, selected }: NodeViewProps) {
  const { renderEmbed } = useLydieEditorSlots();
  // The host gets the whole text between the brackets, as before the attributes were split.
  const target = embedSource(node.attrs as EmbedAttrs);
  return (
    <NodeViewWrapper data-type="embed" data-target={target} contentEditable={false}>
      {renderEmbed ? renderEmbed({ target, selected }) : <span>{`![[${target}]]`}</span>}
    </NodeViewWrapper>
  );
}
