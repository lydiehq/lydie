import type { OnboardingStatus, OnboardingStep } from "@lydie/core/onboarding-status";

import { DEFAULT_ONBOARDING_STATUS, STEP_ORDER } from "@lydie/core/onboarding-status";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useCallback, useMemo } from "react";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export type { OnboardingStep };

export function useOnboardingSteps() {
  const { organization } = useOrganization();
  const z = useZero();

  // Query organization settings
  const [settings] = useQuery(
    queries.settings.organization({
      organizationId: organization.id,
    }),
  );

  // Parse onboarding status from settings
  const onboardingStatus: OnboardingStatus = useMemo(() => {
    if (!settings?.onboarding_status) {
      return DEFAULT_ONBOARDING_STATUS;
    }
    return {
      ...DEFAULT_ONBOARDING_STATUS,
      ...(settings.onboarding_status as OnboardingStatus),
    };
  }, [settings]);

  const currentStep = onboardingStatus.currentStep;
  const isCompleted = onboardingStatus.isCompleted;

  const setCurrentStep = useCallback(
    async (step: OnboardingStep) => {
      const updatedStatus: OnboardingStatus = {
        ...onboardingStatus,
        currentStep: step,
      };

      await z.mutate(
        mutators.organizationSettings.update({
          organizationId: organization.id,
          onboardingStatus: updatedStatus as any,
        }),
      );
    },
    [z, organization.id, onboardingStatus],
  );

  const nextStep = useCallback(async () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const next = STEP_ORDER[currentIndex + 1];
      await setCurrentStep(next);
    }
  }, [currentStep, setCurrentStep]);

  const previousStep = useCallback(async () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      const previous = STEP_ORDER[currentIndex - 1];
      await setCurrentStep(previous);
    }
  }, [currentStep, setCurrentStep]);

  const completeOnboarding = useCallback(async () => {
    const updatedStatus: OnboardingStatus = {
      ...onboardingStatus,
      isCompleted: true,
      completedSteps: [...STEP_ORDER],
    };

    await z.mutate(
      mutators.organizationSettings.update({
        organizationId: organization.id,
        onboardingStatus: updatedStatus as any,
      }),
    );
  }, [z, organization.id, onboardingStatus]);

  const getStepIndex = useCallback((step: OnboardingStep) => STEP_ORDER.indexOf(step), []);
  const getCurrentStepIndex = useCallback(
    () => getStepIndex(currentStep),
    [currentStep, getStepIndex],
  );
  const getTotalSteps = useCallback(() => STEP_ORDER.length, []);
  const getProgress = useCallback(
    () => ((getCurrentStepIndex() + 1) / getTotalSteps()) * 100,
    [getCurrentStepIndex, getTotalSteps],
  );

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
