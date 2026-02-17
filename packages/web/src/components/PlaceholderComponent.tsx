import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";

export function PlaceholderComponent(props: NodeViewProps) {
  const { node, editor, getPos, selected } = props;
  const label = node.attrs.label as string;
  const wasSelectedRef = useRef(false);

  const content = node.textContent || "";
  const isEmpty = !content || content === label;
  const showPlaceholder = isEmpty && !selected;

  // Handle selection changes to track when user leaves the placeholder
  useEffect(() => {
    const wasSelected = wasSelectedRef.current;

    // If previously selected and now not selected, check if we need to restore
    if (wasSelected && !selected) {
      const pos = getPos();
      if (typeof pos !== "number") return;

      const currentContent = node.textContent || "";

      if (!currentContent) {
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

    wasSelectedRef.current = selected;
  }, [selected, editor, getPos, node.nodeSize, node.textContent, label]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle clicks directly on the placeholder content, not on empty space after it
      // Check if the click target is the actual content span or the wrapper itself
      const target = e.target as HTMLElement;
      const wrapper = e.currentTarget as HTMLElement;

      // If clicking on the wrapper but not on the actual content (empty space to the right),
      // let the editor handle it naturally - this allows clicking after the placeholder
      if (target === wrapper) {
        const rect = wrapper.getBoundingClientRect();
        // Check if click is in the right 20% of the wrapper (likely after the content)
        if (e.clientX > rect.left + rect.width * 0.8) {
          return; // Let the editor place cursor after the placeholder
        }
      }

      const pos = getPos();
      if (typeof pos !== "number") return;

      // When clicking on placeholder or when content equals label,
      // select all content so typing replaces it
      if (showPlaceholder || node.textContent === label) {
        e.preventDefault();
        e.stopPropagation();

        editor
          .chain()
          .focus()
          .setTextSelection({ from: pos, to: pos + node.nodeSize })
          .run();
      }
      // Otherwise, let the default TipTap behavior handle cursor placement
    },
    [editor, getPos, node.textContent, node.nodeSize, label, showPlaceholder],
  );

  return (
    <NodeViewWrapper
      data-placeholder="true"
      data-label={label}
      className={`group relative isolate inline cursor-text rounded-sm px-1 py-0.5 transition-all hover:bg-gray-100 ${showPlaceholder ? "bg-gray-200" : "bg-transparent"}`}
      onClick={handleClick}
    >
      {showPlaceholder ? (
        <span className="inline text-gray-600">{label}</span>
      ) : (
        <NodeViewContent className="inline" />
      )}
    </NodeViewWrapper>
  );
}
