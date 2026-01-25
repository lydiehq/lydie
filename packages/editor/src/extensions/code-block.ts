import type { NodeViewRenderer } from "@tiptap/core";

import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { all, createLowlight } from "lowlight";

// Create a lowlight instance with all languages loaded
const lowlight = createLowlight(all);

export interface CodeBlockOptions {
  // Allow overriding lowlight if needed, but default to our instance
  lowlight?: typeof lowlight;
  addNodeView?: () => NodeViewRenderer;
}

export const CodeBlock = CodeBlockLowlight.extend<CodeBlockOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: lowlight,
      addNodeView: undefined,
    };
  },

  addNodeView() {
    return this.options.addNodeView?.() || this.parent?.() || null;
  },
});
