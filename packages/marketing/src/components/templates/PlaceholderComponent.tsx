import type { NodeViewProps } from "@tiptap/react";

import { NodeViewWrapper } from "@tiptap/react";
import { useState, useRef, useEffect } from "react";

import { Button } from "../generic/Button";

/**
 * Simple read-only placeholder component for template preview.
 * Displays placeholder labels with styling but without editing functionality.
 * Shows a popover with CTA when clicked.
 */
export function PlaceholderComponent(props: NodeViewProps) {
  const { node, editor } = props;
  const label = node.attrs.label as string;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

  // Get template install URL from editor options
  const editorProps = editor?.options?.editorProps as
    | { templateInstallUrl?: string }
    | undefined;
  const installUrl = editorProps?.templateInstallUrl || "#";

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <NodeViewWrapper
      ref={containerRef as React.RefObject<HTMLDivElement>}
      data-placeholder="true"
      data-label={label}
      className="placeholder placeholder--empty"
      style={{
        display: "inline",
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded border-0 bg-transparent p-0"
      >
        <span className="placeholder-label">{label}</span>
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className="fill-white"
              style={{
                filter: "drop-shadow(0 -1px 0 rgba(0,0,0,0.1))",
              }}
            >
              <path d="M0 12 L6 6 L12 12" />
            </svg>
          </div>

          {/* Popover content */}
          <div className="bg-white rounded-lg shadow-popover border border-gray-200 p-4 w-64">
            <div className="flex flex-col gap-y-3">
              <div className="flex flex-col gap-y-1">
                <h4 className="text-sm font-semibold text-gray-900">
                  Fill out placeholders
                </h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Install this template on Lydie to fill out placeholders and
                  customize the content.
                </p>
              </div>

              <Button
                href={installUrl}
                size="sm"
                intent="primary"
                className="w-full justify-center"
              >
                Get template
              </Button>
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
