export * from "./link";

export { KeyboardShortcutExtension } from "./keyboard-shortcuts";

export { IndentHandlerExtension } from "./indent-handler";

export { ImageUpload } from "./image-upload";

export { DocumentComponent } from "./document-component";
export type { DocumentComponentOptions } from "./document-component";

export { CodeBlock } from "./code-block";
export type { CodeBlockOptions } from "./code-block";

export { OnboardingStep } from "./onboarding/onboarding-step";
export type { OnboardingStepOptions, OnboardingStepTask } from "./onboarding/onboarding-step";

export { OnboardingTextPractice } from "./onboarding/onboarding-text-practice";
export type {
  OnboardingTextPracticeOptions,
  OnboardingTextPracticeTask,
} from "./onboarding/onboarding-text-practice";

export { OnboardingAssistantTask } from "./onboarding/onboarding-assistant-task";
export type { OnboardingAssistantTaskOptions } from "./onboarding/onboarding-assistant-task";

export { SlashCommandsExtension } from "./slash-commands";
export type { SlashCommandsOptions } from "./slash-commands";

export { Placeholder } from "./placeholder";
export type { PlaceholderOptions, PlaceholderAttributes } from "./placeholder";
