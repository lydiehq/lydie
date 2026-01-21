export type OnboardingStep = "documents" | "assistant" | "integrations"

export type OnboardingChecklistItem =
  | "documents:open-command-menu"
  | "documents:import-demo-content"
  | "documents:explore-editor"
  | "assistant:organize-documents"
  | "assistant:create-document"
  | "assistant:improve-document"

export interface OnboardingStatus {
  currentStep: OnboardingStep
  isCompleted: boolean
  completedSteps: OnboardingStep[]
  checkedItems: OnboardingChecklistItem[]
  createdDemoGuide?: boolean
}

export const STEP_ORDER: OnboardingStep[] = ["documents", "assistant", "integrations"]

export const DEFAULT_ONBOARDING_STATUS: OnboardingStatus = {
  currentStep: "documents",
  isCompleted: false,
  completedSteps: [],
  checkedItems: [],
  createdDemoGuide: false,
}
