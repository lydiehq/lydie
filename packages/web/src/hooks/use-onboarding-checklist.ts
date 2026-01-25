import type { OnboardingChecklistItem, OnboardingStatus } from "@lydie/core/onboarding-status";

import { DEFAULT_ONBOARDING_STATUS } from "@lydie/core/onboarding-status";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useCallback, useMemo } from "react";

import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export type { OnboardingChecklistItem };

export function useOnboardingChecklist() {
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
      ...(settings.onboarding_status as unknown as OnboardingStatus),
    };
  }, [settings]);

  const checkedItems = useMemo(() => {
    return new Set(onboardingStatus.checkedItems || []);
  }, [onboardingStatus]);

  const setChecked = useCallback(
    async (item: OnboardingChecklistItem, checked: boolean) => {
      const currentItems = onboardingStatus.checkedItems || [];
      const itemSet = new Set(currentItems);

      if (checked) {
        // Only add if not already present to avoid unnecessary updates
        if (itemSet.has(item)) return;
        itemSet.add(item);
      } else {
        itemSet.delete(item);
      }

      const updatedStatus: OnboardingStatus = {
        ...onboardingStatus,
        checkedItems: Array.from(itemSet),
      };

      z.mutate(
        mutators.organizationSettings.update({
          organizationId: organization.id,
          onboardingStatus: updatedStatus as any,
        }),
      );
    },
    [z, organization.id, onboardingStatus],
  );

  const isChecked = useCallback(
    (item: OnboardingChecklistItem) => {
      return checkedItems.has(item);
    },
    [checkedItems],
  );

  return {
    isChecked,
    setChecked,
    checkedItems,
  };
}
