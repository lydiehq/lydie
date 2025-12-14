import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { marked } from "marked";

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
            const clipboardText = event.clipboardData?.getData("text/plain");

            if (clipboardText) {
              try {
                const html = marked(clipboardText);
                this.options.onPaste?.(html);
                this.editor.commands.insertContent(html);
                return true;
              } catch (error) {
                console.error("Error parsing markdown:", error);
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
