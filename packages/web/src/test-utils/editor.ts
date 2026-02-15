import type { Editor } from "@tiptap/core";
import type { Extensions } from "@tiptap/react";

import { Link } from "@lydie/editor/extensions";
import { Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Creates a minimal TipTap editor instance for testing.
 *
 * Uses a simplified set of extensions suitable for unit tests.
 * For full editor testing, use the complete getDocumentEditorExtensions.
 *
 * @param content - Initial HTML content for the editor
 * @param extensions - Optional additional extensions
 * @returns A TipTap Editor instance
 *
 * @example
 * ```ts
 * const editor = createTestEditor('<p>Hello world</p>');
 * expect(editor.getText()).toBe('Hello world');
 * editor.destroy();
 * ```
 */
export function createTestEditor(content = "", extensions: Extensions = []): Editor {
  return new TiptapEditor({
    content,
    extensions: [
      StarterKit.configure({
        // Disable features that require collaboration
        undoRedo: false,
        // Disable built-in link to use our custom one
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        // "internal" protocol is registered at module load time in
        // @lydie/editor/extensions/link.ts
        protocols: [],
      }),
      ...extensions,
    ],
    editorProps: {
      attributes: {
        "data-testid": "test-editor",
        role: "textbox",
      },
    },
  });
}

/**
 * Sets a text selection in the editor.
 *
 * @param editor - The TipTap editor instance
 * @param from - Start position of selection
 * @param to - End position of selection (defaults to from for cursor)
 *
 * @example
 * ```ts
 * const editor = createTestEditor('<p>Hello world</p>');
 * setEditorSelection(editor, 1, 6); // Select "Hello"
 * ```
 */
export function setEditorSelection(editor: Editor, from: number, to: number = from): void {
  editor.commands.setTextSelection({ from, to });
}

/**
 * Focuses the editor and places cursor at a position.
 *
 * @param editor - The TipTap editor instance
 * @param position - Position to place cursor (defaults to start)
 */
export function focusEditor(editor: Editor, position: number = 0): void {
  editor.commands.focus(position);
}

/**
 * Creates a link in the editor at current selection.
 *
 * @param editor - The TipTap editor instance
 * @param href - The URL for the link
 *
 * @example
 * ```ts
 * const editor = createTestEditor('<p>Hello world</p>');
 * setEditorSelection(editor, 1, 6);
 * createLink(editor, 'https://example.com');
 * ```
 */
export function createLink(editor: Editor, href: string): void {
  editor.chain().focus().setLink({ href }).run();
}

/**
 * Creates an internal document link.
 *
 * @param editor - The TipTap editor instance
 * @param documentId - The document ID to link to
 */
export function createInternalLink(editor: Editor, documentId: string): void {
  createLink(editor, `internal://${documentId}`);
}

/**
 * Gets the HTML content of the editor.
 */
export function getEditorHTML(editor: Editor): string {
  return editor.getHTML();
}

/**
 * Gets the plain text content of the editor.
 */
export function getEditorText(editor: Editor): string {
  return editor.getText();
}

/**
 * Checks if a mark (like link, bold, italic) is active at current selection.
 */
export function isMarkActive(editor: Editor, markName: string): boolean {
  return editor.isActive(markName);
}

/**
 * Gets attributes of a mark at current selection.
 */
export function getMarkAttributes(editor: Editor, markName: string): Record<string, unknown> {
  return editor.getAttributes(markName);
}

/**
 * Cleanup helper - destroys editor and releases resources.
 * Call this in afterEach to prevent memory leaks.
 */
export function destroyEditor(editor: Editor): void {
  editor.destroy();
}

/**
 * Creates an editor with a link for testing link-related components.
 *
 * @param text - The link text
 * @param href - The link URL
 * @returns Editor with cursor inside the link
 */
export function createEditorWithLink(text: string, href: string): Editor {
  const editor = createTestEditor(`<p><a href="${href}">${text}</a></p>`);
  // Position cursor inside the link
  editor.commands.setTextSelection(2);
  return editor;
}

/**
 * Creates an editor with an internal document link.
 *
 * @param text - The link text
 * @param documentId - The document ID
 * @returns Editor with cursor inside the link
 */
export function createEditorWithInternalLink(text: string, documentId: string): Editor {
  return createEditorWithLink(text, `internal://${documentId}`);
}
