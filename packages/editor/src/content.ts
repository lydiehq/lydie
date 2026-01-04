import { StarterKit, type StarterKitOptions } from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extension-character-count";
import { TableKit } from "@tiptap/extension-table";
import {
  Collaboration,
  type CollaborationOptions,
} from "@tiptap/extension-collaboration";
import CollaborationCaret, {
  type CollaborationCaretOptions,
} from "@tiptap/extension-collaboration-caret";

import * as E from "./extensions";

export interface GetContentExtensionsOptions {
  starterKit?: StarterKitOptions;
  textSelection?: Partial<E.TextSelectionOptions>;
  markdownPaste?: Partial<E.MarkdownPasteOptions>;
  keyboardShortcuts?: Partial<E.KeyboardShortcutOptions>;
  documentComponent?: Partial<E.DocumentComponentOptions>;
  collaboration?: Partial<CollaborationOptions>;
  collaborationCaret?: Partial<CollaborationCaretOptions>;
}

export function getContentExtensions(options?: GetContentExtensionsOptions) {
  return [
    StarterKit.configure({
      heading: options?.starterKit?.heading,
      undoRedo: options?.starterKit?.undoRedo,
      link: options?.starterKit?.link ?? {
        openOnClick: false,
        protocols: ["internal"],
      },
    }),
    TableKit,
    CharacterCount,
    E.TextSelectionExtension.configure(options?.textSelection),
    E.MarkdownPasteExtension.configure(options?.markdownPaste),
    E.KeyboardShortcutExtension.configure(options?.keyboardShortcuts),
    E.DocumentComponent.configure(options?.documentComponent),
    E.IndentHandlerExtension,
    E.ImageUpload,
    options?.collaboration
      ? Collaboration.configure(options.collaboration)
      : undefined,
    ...(options?.collaborationCaret
      ? [CollaborationCaret.configure(options.collaborationCaret)]
      : []),
  ];
}
