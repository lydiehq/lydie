export * from "./link";

export { KeyboardShortcutExtension } from "./keyboard-shortcuts";

export { IndentHandlerExtension } from "./indent-handler";

export { ImageUpload } from "./image-upload";

export { DocumentComponent } from "./document-component";
export type { DocumentComponentOptions } from "./document-component";

export { CodeBlock } from "./code-block";
export type { CodeBlockOptions } from "./code-block";

export { OnboardingTextPractice } from "./onboarding/onboarding-text-practice";
export type {
  OnboardingTextPracticeOptions,
  OnboardingTextPracticeTask,
} from "./onboarding/onboarding-text-practice";

export { OnboardingAssistantTask } from "./onboarding/onboarding-assistant-task";
export type { OnboardingAssistantTaskOptions } from "./onboarding/onboarding-assistant-task";

export { SlashCommandsExtension } from "./slash-commands";
export type { SlashCommandsOptions } from "./slash-commands";

export { MentionCommandsExtension } from "./mention-commands";
export type { MentionCommandsOptions } from "./mention-commands";

export { Placeholder } from "./placeholder";
export type { PlaceholderOptions, PlaceholderAttributes } from "./placeholder";

export { VersionHistory } from "./version-history";
export type { VersionHistoryOptions, VersionHistoryStorage } from "./version-history";

export { ProposedChange } from "./proposed-change";
export type { ProposedChangeOptions, ProposedChangeStorage } from "./proposed-change";

export { DatabaseBlock } from "./database-block";
export type { DatabaseBlockOptions } from "./database-block";
