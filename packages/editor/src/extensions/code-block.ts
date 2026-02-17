import type { NodeViewRenderer } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { all, createLowlight } from "lowlight";

const lowlight = createLowlight(all);

export interface CodeBlockOptions {
  addNodeView?: () => NodeViewRenderer;
}

export const CodeBlock = CodeBlockLowlight.extend<CodeBlockOptions>({
  addOptions() {
    return {
      lowlight,
      addNodeView: undefined,
    };
  },

  addNodeView() {
    return this.options.addNodeView?.() || this.parent?.() || null;
  },
});
