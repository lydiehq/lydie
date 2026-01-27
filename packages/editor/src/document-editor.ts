import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { CharacterCount } from "@tiptap/extension-character-count";
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
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { TrailingNode, Selection } from "@tiptap/extensions";

import * as E from "./extensions";

export interface GetDocumentEditorExtensionsOptions {
  heading?: Partial<HeadingOptions>;
  documentComponent?: Partial<E.DocumentComponentOptions>;
  codeBlock?: Partial<E.CodeBlockOptions>;
  onboardingStep?: Partial<E.OnboardingStepOptions>;
  onboardingTextPractice?: Partial<E.OnboardingTextPracticeOptions>;
  onboardingAssistantTask?: Partial<E.OnboardingAssistantTaskOptions>;
  slashCommands?: Partial<E.SlashCommandsOptions>;
  collaboration?: Partial<CollaborationOptions>;
  collaborationCaret?: Partial<CollaborationCaretOptions>;
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
      protocols: ["internal"],
    }),
    E.KeyboardShortcutExtension,
    E.DocumentComponent.configure(options?.documentComponent),
    E.CodeBlock.configure(options?.codeBlock),
    E.OnboardingStep.configure(options?.onboardingStep),
    E.OnboardingTextPractice.configure(options?.onboardingTextPractice),
    E.OnboardingAssistantTask.configure(options?.onboardingAssistantTask),
    E.IndentHandlerExtension,
    E.ImageUpload,
  ];

  // Add slash commands if configured
  if (options?.slashCommands) {
    extensions.push(E.SlashCommandsExtension.configure(options.slashCommands));
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
