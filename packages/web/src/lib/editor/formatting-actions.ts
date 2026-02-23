import type { Editor } from "@tiptap/react";

export type FormattingAction = {
  id: string;
  label: string;
  icon?: any;
  description?: string;
  isActive?: (editor: Editor) => boolean;
  execute: (editor: Editor) => void;
  group?: string;
};

export const textFormattingActions: FormattingAction[] = [
  {
    id: "bold",
    label: "Bold",
    isActive: (editor) => editor.isActive("bold"),
    execute: (editor) => editor.chain().focus().toggleBold().run(),
    group: "text-style",
  },
  {
    id: "italic",
    label: "Italic",
    isActive: (editor) => editor.isActive("italic"),
    execute: (editor) => editor.chain().focus().toggleItalic().run(),
    group: "text-style",
  },
  {
    id: "strike",
    label: "Strike",
    isActive: (editor) => editor.isActive("strike"),
    execute: (editor) => editor.chain().focus().toggleStrike().run(),
    group: "text-style",
  },
  {
    id: "code",
    label: "Code",
    isActive: (editor) => editor.isActive("code") || editor.isActive("codeBlock"),
    execute: (editor) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (hasSelection) {
        // If text is selected, apply inline code
        editor.chain().focus().toggleCode().run();
      } else {
        // If no selection, create a code block
        editor.chain().focus().toggleCodeBlock().run();
      }
    },
    group: "text-style",
  },
];

export const blockFormattingActions: FormattingAction[] = [
  {
    id: "paragraph",
    label: "Paragraph",
    isActive: (editor) => editor.isActive("paragraph") && !editor.isActive("heading"),
    execute: (editor) => editor.chain().focus().setParagraph().run(),
    group: "block-type",
  },
  {
    id: "heading1",
    label: "Heading 1",
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    group: "block-type",
  },
  {
    id: "heading2",
    label: "Heading 2",
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    group: "block-type",
  },
  {
    id: "heading3",
    label: "Heading 3",
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    group: "block-type",
  },
  {
    id: "heading4",
    label: "Heading 4",
    isActive: (editor) => editor.isActive("heading", { level: 4 }),
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    group: "block-type",
  },
  {
    id: "heading5",
    label: "Heading 5",
    isActive: (editor) => editor.isActive("heading", { level: 5 }),
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 5 }).run(),
    group: "block-type",
  },
  {
    id: "blockquote",
    label: "Blockquote",
    isActive: (editor) => editor.isActive("blockquote"),
    execute: (editor) => editor.chain().focus().toggleBlockquote().run(),
    group: "block-type",
  },
];

export const listFormattingActions: FormattingAction[] = [
  {
    id: "bulletList",
    label: "Bullet List",
    isActive: (editor) => editor.isActive("bulletList"),
    execute: (editor) => editor.chain().focus().toggleBulletList().run(),
    group: "list",
  },
  {
    id: "orderedList",
    label: "Ordered List",
    isActive: (editor) => editor.isActive("orderedList"),
    execute: (editor) => editor.chain().focus().toggleOrderedList().run(),
    group: "list",
  },
  {
    id: "taskList",
    label: "Task List",
    isActive: (editor) => editor.isActive("taskList"),
    execute: (editor) => editor.chain().focus().toggleTaskList().run(),
    group: "list",
  },
];

export const insertActions: FormattingAction[] = [
  {
    id: "table",
    label: "Table",
    isActive: (editor) => editor.isActive("table"),
    execute: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    group: "insert",
  },
  {
    id: "collection",
    label: "Collection view",
    description: "Embed a filtered view of a collection",
    execute: (editor) => {
      const insertAt = editor.state.selection.from;
      editor
        .chain()
        .focus()
        .insertContentAt(insertAt, [
          {
            type: "collectionViewBlock",
            attrs: {
              viewId: null,
              blockId: null,
            },
          },
          {
            type: "paragraph",
          },
        ])
        .run();
    },
    group: "insert",
  },
];

export const allFormattingActions = [
  ...blockFormattingActions,
  ...textFormattingActions,
  ...listFormattingActions,
  ...insertActions,
];

export function getActiveBlockType(editor: Editor): string {
  const activeBlock = blockFormattingActions.find((action) => action.isActive?.(editor));
  return activeBlock?.label || "Paragraph";
}
