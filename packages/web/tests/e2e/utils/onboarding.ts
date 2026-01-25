import type { OnboardingStatus, OnboardingStep } from "@lydie/core/onboarding-status";
import type { Page } from "@playwright/test";

import { db, organizationSettingsTable } from "@lydie/database";
import { eq } from "drizzle-orm";

// Navigate to a specific onboarding step
export async function navigateToOnboardingStep(page: Page, step: OnboardingStep) {
  const stepMap: Record<OnboardingStep, number> = {
    documents: 0,
    assistant: 1,
    integrations: 2,
  };

  const targetIndex = stepMap[step];
  const currentStepText = await page.getByText(/\d+ \/ 3/).textContent();
  const currentIndex = parseInt(currentStepText?.split("/")[0]?.trim() || "1") - 1;

  if (targetIndex > currentIndex) {
    // Go forward
    const stepsToGo = targetIndex - currentIndex;
    for (let i = 0; i < stepsToGo; i++) {
      await page.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(300);
    }
  } else if (targetIndex < currentIndex) {
    // Go backward
    const stepsToGo = currentIndex - targetIndex;
    for (let i = 0; i < stepsToGo; i++) {
      await page.getByRole("button", { name: "Back" }).click();
      await page.waitForTimeout(300);
    }
  }
}

// Get onboarding status from database
export async function getOnboardingStatus(
  organizationId: string,
): Promise<OnboardingStatus | null> {
  const [settings] = await db
    .select()
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.organizationId, organizationId))
    .limit(1);

  if (!settings || !settings.onboardingStatus) {
    return null;
  }

  return settings.onboardingStatus as OnboardingStatus;
}

// Update onboarding status in database
export async function updateOnboardingStatus(
  organizationId: string,
  status: Partial<OnboardingStatus>,
) {
  const [settings] = await db
    .select()
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.organizationId, organizationId))
    .limit(1);

  if (!settings) {
    throw new Error(`No settings found for organization ${organizationId}`);
  }

  const currentStatus = (settings.onboardingStatus as OnboardingStatus) || {
    currentStep: "documents",
    isCompleted: false,
    completedSteps: [],
    checkedItems: [],
    createdDemoGuide: false,
  };

  await db
    .update(organizationSettingsTable)
    .set({
      onboardingStatus: {
        ...currentStatus,
        ...status,
      },
    })
    .where(eq(organizationSettingsTable.id, settings.id));
}

// Mark onboarding as completed
export async function completeOnboarding(organizationId: string) {
  await updateOnboardingStatus(organizationId, {
    isCompleted: true,
    completedSteps: ["documents", "assistant", "integrations"],
  });
}

// Reset onboarding to initial state
export async function resetOnboarding(organizationId: string) {
  await updateOnboardingStatus(organizationId, {
    currentStep: "documents",
    isCompleted: false,
    completedSteps: [],
    checkedItems: [],
    createdDemoGuide: false,
  });
}

// Check if a specific checklist item is checked
export async function isChecklistItemChecked(
  organizationId: string,
  item: string,
): Promise<boolean> {
  const status = await getOnboardingStatus(organizationId);
  return status?.checkedItems?.includes(item as any) || false;
}

// Wait for onboarding state to sync (useful for multi-tab tests)
export async function waitForOnboardingSync(page: Page, timeoutMs = 2000) {
  await page.waitForTimeout(timeoutMs);
}
