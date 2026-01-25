import { CharacterCount } from "@tiptap/extension-character-count";
import { Collaboration, type CollaborationOptions } from "@tiptap/extension-collaboration";
import CollaborationCaret, {
  type CollaborationCaretOptions,
} from "@tiptap/extension-collaboration-caret";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit, type StarterKitOptions } from "@tiptap/starter-kit";

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

export function getDocumentEditorExtensions(options?: GetDocumentEditorExtensionsOptions) {
  const extensions = [
    StarterKit.configure({
      heading: options?.starterKit?.heading,
      undoRedo: false,
      code: false,
      codeBlock: false,
      link: false,
    }),
    E.Link.configure({
      openOnClick: false,
      protocols: ["internal"],
    }),
    TableKit,
    TaskList,
    TaskItem,
    CharacterCount,
    E.TextSelectionExtension.configure(options?.textSelection),
    E.KeyboardShortcutExtension.configure(options?.keyboardShortcuts),
    E.DocumentComponent.configure(options?.documentComponent),
    E.CodeBlock.configure(options?.codeBlock),
    E.IndentHandlerExtension,
    E.ImageUpload,
  ];

  // Add collaboration extensions if configured
  if (options?.collaboration) {
    extensions.push(Collaboration.configure(options.collaboration));
  }
  if (options?.collaborationCaret) {
    extensions.push(CollaborationCaret.configure(options.collaborationCaret));
  }

  return extensions;
}
