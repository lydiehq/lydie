import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export type MentionCommandsOptions = {
  suggestion: Omit<SuggestionOptions, "editor">;
};

export const MentionCommandsExtension = Extension.create<MentionCommandsOptions>({
  name: "mentionCommands",

  addOptions() {
    return {
      suggestion: {
        char: "@",
        pluginKey: new PluginKey("mentionCommands"),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
