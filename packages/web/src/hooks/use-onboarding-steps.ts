import { useState, useEffect } from "react";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";
import { useAuth } from "@/context/auth.context";

export type OnboardingStep = "documents" | "assistant" | "integrations";

const ONBOARDING_STEP_KEY = "onboarding_step";
const ONBOARDING_COMPLETED_KEY = "onboarding_completed";

const STEP_ORDER: OnboardingStep[] = ["documents", "assistant", "integrations"];

export function useOnboardingSteps() {
  const { session } = useAuth();
  const userId = session?.userId;

  const [currentStep, setCurrentStepState] = useState<OnboardingStep>("documents");
  const [isCompleted, setIsCompletedState] = useState(false);

  // Load initial state from localStorage
  useEffect(() => {
    const storedStep = getUserStorage(userId, ONBOARDING_STEP_KEY) as OnboardingStep | null;
    const storedCompleted = getUserStorage(userId, ONBOARDING_COMPLETED_KEY) === "true";

    if (storedStep && STEP_ORDER.includes(storedStep)) {
      setCurrentStepState(storedStep);
    }

    if (storedCompleted) {
      setIsCompletedState(true);
    }
  }, [userId]);

  const setCurrentStep = (step: OnboardingStep) => {
    setCurrentStepState(step);
    setUserStorage(userId, ONBOARDING_STEP_KEY, step);
  };

  const nextStep = () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[currentIndex + 1];
      setCurrentStep(next);
    }
  };

  const previousStep = () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      const previous = STEP_ORDER[currentIndex - 1];
      setCurrentStep(previous);
    }
  };

  const completeOnboarding = () => {
    setIsCompletedState(true);
    setUserStorage(userId, ONBOARDING_COMPLETED_KEY, "true");
  };

  const getStepIndex = (step: OnboardingStep) => STEP_ORDER.indexOf(step);
  const getCurrentStepIndex = () => getStepIndex(currentStep);
  const getTotalSteps = () => STEP_ORDER.length;
  const getProgress = () => ((getCurrentStepIndex() + 1) / getTotalSteps()) * 100;

  const isFirstStep = getCurrentStepIndex() === 0;
  const isLastStep = getCurrentStepIndex() === STEP_ORDER.length - 1;

  return {
    currentStep,
    setCurrentStep,
    nextStep,
    previousStep,
    completeOnboarding,
    isCompleted,
    getStepIndex,
    getCurrentStepIndex,
    getTotalSteps,
    getProgress,
    isFirstStep,
    isLastStep,
  };
}
