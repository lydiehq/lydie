import type { NodeViewProps } from "@tiptap/react";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

export function PlaceholderComponent(props: NodeViewProps) {
  const { node, editor, getPos, selected } = props;
  const label = node.attrs.label as string;
  const [content, setContent] = useState(node.textContent || "");
  const [wasSelected, setWasSelected] = useState(false);

  // Check if placeholder is empty (no content or just the label)
  const isEmpty = !content || content === "" || content === label;

  // Update content when node changes
  useEffect(() => {
    setContent(node.textContent || "");
  }, [node.textContent]);

  // Handle selection changes to track when user leaves the placeholder
  useEffect(() => {
    // If previously selected and now not selected, check if we need to restore
    if (wasSelected && !selected) {
      const pos = getPos();
      if (typeof pos !== "number") return;

      const currentContent = node.textContent || "";

      if (!currentContent || currentContent === "") {
        // Empty - restore the placeholder label inside this node
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: pos + 1, to: pos + node.nodeSize - 1 },
            {
              type: "text",
              text: label,
            },
          )
          .run();
      } else if (currentContent !== label) {
        // Has content different from label - unwrap and convert to plain text
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + node.nodeSize })
          .insertContentAt(pos, {
            type: "text",
            text: currentContent,
          })
          .run();
      }
    }

    setWasSelected(selected);
  }, [selected, wasSelected, editor, getPos, node, label]);

  // Handle click - focus and select all text
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getPos();
      if (typeof pos !== "number") return;

      // Focus the editor at this position
      editor.chain().focus().setTextSelection(pos).run();

      // If content equals the label, select all so typing replaces it
      if (node.textContent === label) {
        editor
          .chain()
          .setTextSelection({ from: pos, to: pos + node.nodeSize })
          .run();
      }
    },
    [editor, getPos, node.textContent, node.nodeSize, label],
  );

  // Subscribe to editor updates to track content changes
  useEffect(() => {
    const updateHandler = () => {
      setContent(node.textContent || "");
    };

    editor.on("update", updateHandler);
    return () => {
      editor.off("update", updateHandler);
    };
  }, [editor, node.textContent]);

  // Show placeholder label when empty and not currently selected
  const showPlaceholder = isEmpty && !selected;

  return (
    <NodeViewWrapper
      data-placeholder="true"
      data-label={label}
      className={`placeholder ${showPlaceholder ? "placeholder--empty" : "placeholder--filled"}`}
      onClick={handleClick}
      style={{
        cursor: "text",
        display: "inline",
      }}
    >
      {showPlaceholder ? (
        <span className="placeholder-label">{label}</span>
      ) : (
        <NodeViewContent style={{ display: "inline" }} />
      )}
    </NodeViewWrapper>
  );
}
