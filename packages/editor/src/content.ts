import { StarterKit } from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extension-character-count";
import { TableKit } from "@tiptap/extension-table";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { NodeViewRenderer } from "@tiptap/core";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";

import * as E from "./extensions";

export interface GetContentExtensionsOptions {
  /**
   * Text selection extension options
   */
  textSelection?: Partial<E.TextSelectionOptions> & { enabled?: boolean };

  /**
   * Markdown paste extension options
   */
  markdownPaste?: Partial<E.MarkdownPasteOptions> & { enabled?: boolean };

  /**
   * Keyboard shortcuts extension options
   */
  keyboardShortcuts?: Partial<E.KeyboardShortcutOptions> & { enabled?: boolean };

  /**
   * Indent handler extension
   */
  indentHandler?: { enabled?: boolean };

  /**
   * Image upload extension
   */
  imageUpload?: { enabled?: boolean };

  /**
   * Document component extension
   */
  documentComponent?: Partial<E.DocumentComponentOptions> & { enabled?: boolean };

  /**
   * Collaboration extension options (for Yjs)
   */
  collaboration?: {
    document: Y.Doc;
    provider?: HocuspocusProvider;
    user?: {
      name: string;
      color: string;
    };
  };

  /**
   * StarterKit configuration
   */
  starterKit?: {
    heading?: any;
    link?: any;
    undoRedo?: boolean;
  };
}

/**
 * Get all content editor extensions
 * This is the main function to get all extensions needed for the content editor
 */
export function getContentExtensions(options?: GetContentExtensionsOptions) {
  const extensions = [];

  // StarterKit (includes basic nodes and marks)
  extensions.push(
    StarterKit.configure({
      heading: options?.starterKit?.heading ?? {},
      undoRedo: options?.starterKit?.undoRedo ?? true,
      link: options?.starterKit?.link ?? {
        openOnClick: false,
        protocols: ["internal"],
      },
    })
  );

  // Table support
  extensions.push(TableKit);

  // Character count
  extensions.push(CharacterCount);

  // Text selection extension
  if (options?.textSelection?.enabled !== false) {
    extensions.push(E.TextSelectionExtension.configure(options?.textSelection));
  }

  // Markdown paste extension
  if (options?.markdownPaste?.enabled !== false) {
    extensions.push(E.MarkdownPasteExtension.configure(options?.markdownPaste));
  }

  // Keyboard shortcuts extension
  if (options?.keyboardShortcuts?.enabled !== false) {
    extensions.push(
      E.KeyboardShortcutExtension.configure(options?.keyboardShortcuts)
    );
  }

  // Document component extension
  if (options?.documentComponent?.enabled !== false) {
    extensions.push(E.DocumentComponent.configure(options?.documentComponent));
  }

  // Indent handler extension
  if (options?.indentHandler?.enabled !== false) {
    extensions.push(E.IndentHandlerExtension);
  }

  // Image upload extension
  if (options?.imageUpload?.enabled !== false) {
    extensions.push(E.ImageUpload);
  }

  // Collaboration extensions (if provided)
  if (options?.collaboration) {
    extensions.push(
      Collaboration.configure({
        document: options.collaboration.document,
      })
    );

    if (options.collaboration.provider && options.collaboration.user) {
      extensions.push(
        CollaborationCaret.configure({
          provider: options.collaboration.provider,
          user: options.collaboration.user,
        })
      );
    }
  }

  return extensions;
}

