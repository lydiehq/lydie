import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { ReactNode } from "react";

// One entry in the `/` menu. The host passes the list in, so plugins can contribute blocks.
export type SlashCommandItem = {
  id: string;
  title: string;
  description?: string;
  // Extra search terms ("h1", "todo", …).
  keywords?: string[];
  group?: string;
  icon?: ReactNode;
  run: (editor: Editor) => void;
};

export type SuggestionRender<T> = NonNullable<SuggestionOptions<T, T>["render"]>;

export type SlashCommandsOptions = {
  items: () => readonly SlashCommandItem[];
  render: SuggestionRender<SlashCommandItem> | null;
  filter: (items: readonly SlashCommandItem[], query: string) => SlashCommandItem[];
};

export const slashCommandsPluginKey = new PluginKey("slashCommands");

export function filterSlashItems(items: readonly SlashCommandItem[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const starts: SlashCommandItem[] = [];
  const contains: SlashCommandItem[] = [];
  for (const item of items) {
    const words = [item.title, item.id, ...(item.keywords ?? [])].map((w) => w.toLowerCase());
    if (words.some((w) => w.startsWith(q))) starts.push(item);
    else if (words.some((w) => w.includes(q))) contains.push(item);
  }
  return [...starts, ...contains];
}

// Ported from v1's slash-commands extension; the item list and rendering are now options.
export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return { items: () => [], render: null, filter: filterSlashItems };
  },

  addProseMirrorPlugins() {
    const { items, render, filter } = this.options;
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        char: "/",
        pluginKey: slashCommandsPluginKey,
        items: ({ query }) => filter(items(), query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        ...(render ? { render } : {}),
      }),
    ];
  },
});
