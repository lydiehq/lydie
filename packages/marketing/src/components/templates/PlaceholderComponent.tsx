import type { NodeViewProps } from "@tiptap/react";

import { NodeViewWrapper } from "@tiptap/react";

/**
 * Simple read-only placeholder component for template preview.
 * Displays placeholder labels with styling but without editing functionality.
 */
export function PlaceholderComponent(props: NodeViewProps) {
  const { node } = props;
  const label = node.attrs.label as string;

  return (
    <NodeViewWrapper
      data-placeholder="true"
      data-label={label}
      className="placeholder placeholder--empty"
      style={{
        display: "inline",
      }}
    >
      <span className="placeholder-label">{label}</span>
    </NodeViewWrapper>
  );
}
