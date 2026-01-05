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

export interface GetDocumentEditorExtensionsOptions {
  starterKit?: StarterKitOptions;
  textSelection?: Partial<E.TextSelectionOptions>;
  keyboardShortcuts?: Partial<E.KeyboardShortcutOptions>;
  documentComponent?: Partial<E.DocumentComponentOptions>;
  codeBlock?: Partial<E.CodeBlockOptions>;
  collaboration?: Partial<CollaborationOptions>;
  collaborationCaret?: Partial<CollaborationCaretOptions>;
}

export function getDocumentEditorExtensions(
  options?: GetDocumentEditorExtensionsOptions
) {
  return [
    StarterKit.configure({
      heading: options?.starterKit?.heading,
      undoRedo: false,
      code: false,
      codeBlock: false,
    }),
    TableKit,
    CharacterCount,
    E.TextSelectionExtension.configure(options?.textSelection),
    E.KeyboardShortcutExtension.configure(options?.keyboardShortcuts),
    E.DocumentComponent.configure(options?.documentComponent),
    E.CodeBlock.configure(options?.codeBlock),
    E.IndentHandlerExtension,
    E.ImageUpload,
    options?.collaboration
      ? Collaboration.configure(options.collaboration)
      : undefined,
    ...(options?.collaborationCaret
      ? [CollaborationCaret.configure(options.collaborationCaret)]
      : []),
  ].filter((ext): ext is NonNullable<typeof ext> => ext !== undefined);
}
