import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface MarkdownPasteOptions {
  onPaste?: (html: string) => void;
}

export const MarkdownPasteExtension = Extension.create<MarkdownPasteOptions>({
  name: "markdownPaste",

  addOptions() {
    return {
      onPaste: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (_, event) => {
            // First, try to get HTML from clipboard to preserve formatting
            const clipboardHtml = event.clipboardData?.getData("text/html");
            const clipboardText = event.clipboardData?.getData("text/plain");

            if (clipboardHtml) {
              // If HTML is available, use it directly to preserve formatting
              try {
                this.options.onPaste?.(clipboardHtml);
                this.editor.commands.insertContent(clipboardHtml);
                return true;
              } catch (error) {
                console.error("Error inserting HTML content:", error);
                // Fall through to markdown parsing
              }
            }

            // Fall back to plain text if HTML is not available
            if (clipboardText) {
              try {
                this.options.onPaste?.(clipboardText);
                this.editor.commands.insertContent(clipboardText);
                return true;
              } catch (error) {
                console.error("Error inserting text content:", error);
                return false;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

