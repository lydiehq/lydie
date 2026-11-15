import type { SlashCommandItem } from "./extensions/slash-commands";

// The built-in `/` menu entries (v1's list minus the collection view, plus the v2 blocks). Hosts
// pass these to the editor, usually with icons attached by id and plugin items appended.
export const defaultSlashItems: SlashCommandItem[] = [
  {
    id: "paragraph",
    title: "Text",
    keywords: ["paragraph", "plain"],
    group: "Basic",
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "heading1",
    title: "Heading 1",
    keywords: ["h1", "title"],
    group: "Basic",
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "heading2",
    title: "Heading 2",
    keywords: ["h2", "subtitle"],
    group: "Basic",
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    title: "Heading 3",
    keywords: ["h3"],
    group: "Basic",
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bulletList",
    title: "Bullet List",
    keywords: ["ul", "unordered"],
    group: "Lists",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    title: "Ordered List",
    keywords: ["ol", "numbered"],
    group: "Lists",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "taskList",
    title: "Task List",
    keywords: ["todo", "checkbox"],
    group: "Lists",
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "blockquote",
    title: "Blockquote",
    keywords: ["quote"],
    group: "Blocks",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "callout",
    title: "Callout",
    description: "Note, tip or warning box",
    keywords: ["admonition", "note", "tip", "warning"],
    group: "Blocks",
    run: (editor) => editor.chain().focus().setCallout({ kind: "note" }).run(),
  },
  {
    id: "codeBlock",
    title: "Code Block",
    keywords: ["code", "pre", "snippet"],
    group: "Blocks",
    run: (editor) => editor.chain().focus().setCodeBlock().run(),
  },
  {
    id: "mathBlock",
    title: "Math Block",
    keywords: ["latex", "equation", "formula"],
    group: "Blocks",
    run: (editor) => editor.chain().focus().setMathBlock().run(),
  },
  {
    id: "table",
    title: "Table",
    keywords: ["grid"],
    group: "Blocks",
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  ...[2, 3, 4].map((count): SlashCommandItem => ({
    id: `columns${String(count)}`,
    title: `${String(count)} Columns`,
    description: "Blocks side by side",
    keywords: ["columns", "layout", "side by side", "split"],
    group: "Layout",
    run: (editor) => editor.chain().focus().insertColumns(count).run(),
  })),
  {
    id: "horizontalRule",
    title: "Divider",
    keywords: ["hr", "rule", "separator"],
    group: "Blocks",
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];
