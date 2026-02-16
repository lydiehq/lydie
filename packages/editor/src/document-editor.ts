import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { CharacterCount } from "@tiptap/extension-character-count";
import { Code } from "@tiptap/extension-code";
import { Collaboration, type CollaborationOptions } from "@tiptap/extension-collaboration";
import CollaborationCaret, {
  type CollaborationCaretOptions,
} from "@tiptap/extension-collaboration-caret";
import { Document } from "@tiptap/extension-document";
import { Dropcursor } from "@tiptap/extension-dropcursor";
import { Gapcursor } from "@tiptap/extension-gapcursor";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading, type HeadingOptions } from "@tiptap/extension-heading";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Italic } from "@tiptap/extension-italic";
import { ListKit } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
import { TableOfContents, type TableOfContentsOptions } from "@tiptap/extension-table-of-contents";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { TrailingNode, Selection } from "@tiptap/extensions";

import * as E from "./extensions";

export interface GetDocumentEditorExtensionsOptions {
  heading?: Partial<HeadingOptions>;
  documentComponent?: Partial<E.DocumentComponentOptions>;
  codeBlock?: Partial<E.CodeBlockOptions>;
  onboardingTextPractice?: Partial<E.OnboardingTextPracticeOptions>;
  onboardingAssistantTask?: Partial<E.OnboardingAssistantTaskOptions>;
  slashCommands?: Partial<E.SlashCommandsOptions>;
  mentionCommands?: Partial<E.MentionCommandsOptions>;
  placeholder?: Partial<E.PlaceholderOptions>;
  collaboration?: Partial<CollaborationOptions>;
  collaborationCaret?: Partial<CollaborationCaretOptions>;
  tableOfContents?: Partial<TableOfContentsOptions>;
}

export function getDocumentEditorExtensions(options?: GetDocumentEditorExtensionsOptions) {
  const extensions = [
    Document,
    Paragraph,
    Text,
    Heading.configure(options?.heading),
    Blockquote,
    HardBreak,
    HorizontalRule,
    Bold,
    Code,
    Italic,
    Strike,
    Underline,
    Dropcursor,
    Gapcursor,
    ListKit,
    TableKit,
    TrailingNode,
    Selection,
    CharacterCount,
    E.Link.configure({
      openOnClick: false,
      // "internal" protocol is registered at module load time in
      protocols: [],
    }),
    E.KeyboardShortcutExtension,
    E.DocumentComponent.configure(options?.documentComponent),
    E.CodeBlock.configure(options?.codeBlock),
    E.OnboardingTextPractice.configure(options?.onboardingTextPractice),
    E.OnboardingAssistantTask.configure(options?.onboardingAssistantTask),
    E.IndentHandlerExtension,
    E.ImageUpload,
    E.Placeholder.configure(options?.placeholder),
    TableOfContents.configure(options?.tableOfContents),
    E.ProposedChange,
  ];

  // Add slash commands if configured
  if (options?.slashCommands) {
    extensions.push(E.SlashCommandsExtension.configure(options.slashCommands));
  }

  // Add mention commands if configured
  if (options?.mentionCommands) {
    extensions.push(E.MentionCommandsExtension.configure(options.mentionCommands));
  }

  // Add collaboration extensions if configured
  if (options?.collaboration) {
    extensions.push(Collaboration.configure(options.collaboration));
  }
  if (options?.collaborationCaret) {
    extensions.push(CollaborationCaret.configure(options.collaborationCaret));
  }

  return extensions;
}
