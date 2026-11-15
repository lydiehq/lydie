import type { Editor } from "@tiptap/core";

// Ported from v1's lib/editor/formatting-actions.ts (minus the collection block). Toolbars and menus
// render these; they hold no UI.
export type FormattingAction = {
  id: string;
  label: string;
  // Display hint such as "Mod-b"; the binding itself lives in the extension.
  shortcut?: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

export const blockTypeActions: FormattingAction[] = [
  {
    id: "paragraph",
    label: "Paragraph",
    shortcut: "Mod-Alt-0",
    isActive: (editor) => editor.isActive("paragraph") && !editor.isActive("heading"),
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  // Mod-Alt-4…6 are Notion's to-do and lists (notion-shortcuts.ts), so H4 and H5 have none.
  ...([1, 2, 3, 4, 5] as const).map((level): FormattingAction => ({
    id: `heading${level}`,
    label: `Heading ${level}`,
    ...(level <= 3 ? { shortcut: `Mod-Alt-${level}` } : {}),
    isActive: (editor) => editor.isActive("heading", { level }),
    run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
  })),
  {
    id: "blockquote",
    label: "Blockquote",
    shortcut: "Mod-Shift-b",
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

export const markActions: FormattingAction[] = [
  {
    id: "bold",
    label: "Bold",
    shortcut: "Mod-b",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    id: "italic",
    label: "Italic",
    shortcut: "Mod-i",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    id: "strike",
    label: "Strike",
    shortcut: "Mod-Shift-s",
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    id: "code",
    label: "Code",
    shortcut: "Mod-e",
    isActive: (editor) => editor.isActive("code") || editor.isActive("codeBlock"),
    // v1: inline code for a selection, a code block otherwise.
    run: (editor) => {
      if (editor.state.selection.empty) editor.chain().focus().toggleCodeBlock().run();
      else editor.chain().focus().toggleCode().run();
    },
  },
  {
    id: "highlight",
    label: "Highlight",
    shortcut: "Mod-Shift-h",
    isActive: (editor) => editor.isActive("highlight"),
    run: (editor) => editor.chain().focus().toggleHighlight().run(),
  },
];

export function getActiveBlockType(editor: Editor): FormattingAction {
  return blockTypeActions.find((action) => action.isActive(editor)) ?? blockTypeActions[0]!;
}

// Applies a link to the selection, or removes it when `href` is empty.
export function setLinkHref(editor: Editor, href: string) {
  const chain = editor.chain().focus().extendMarkRange("link");
  if (href.trim()) chain.setLink({ href: href.trim() }).run();
  else chain.unsetLink().run();
}
