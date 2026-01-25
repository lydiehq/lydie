import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { notFoundError } from "../utils/errors";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

const DEFAULT_ONBOARDING_STATUS = {
  currentStep: "documents",
  isCompleted: false,
  completedSteps: [],
  checkedItems: [],
  createdDemoGuide: false,
};

export const organizationSettingsMutators = {
  update: defineMutator(
    z.object({
      organizationId: z.string(),
      onboardingStatus: z.json().optional(),
    }),
    async ({ tx, ctx, args: { organizationId, onboardingStatus } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get or create the organization's settings
      let settings = await tx.run(
        zql.organization_settings.where("organization_id", organizationId).one(),
      );

      if (!settings) {
        // Create settings if they don't exist with default onboarding status
        const id = createId();
        await tx.mutate.organization_settings.insert(
          withTimestamps({
            id,
            organization_id: organizationId,
            onboarding_status: DEFAULT_ONBOARDING_STATUS,
          }),
        );
        settings = await tx.run(zql.organization_settings.where("id", id).one());
      }

      if (!settings) {
        throw notFoundError("Organization settings", organizationId);
      }

      const updates: any = {
        id: settings.id,
      };

      if (onboardingStatus !== undefined) {
        updates.onboarding_status = onboardingStatus;
      }

      await tx.mutate.organization_settings.update(withUpdatedTimestamp(updates));
    },
  ),

  resetOnboarding: defineMutator(
    z.object({
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get the organization's settings
      const settings = await tx.run(
        zql.organization_settings.where("organization_id", organizationId).one(),
      );

      if (!settings) {
        throw notFoundError("Organization settings", organizationId);
      }

      // Reset onboarding status to default
      await tx.mutate.organization_settings.update(
        withUpdatedTimestamp({
          id: settings.id,
          onboarding_status: DEFAULT_ONBOARDING_STATUS,
        }),
      );

      // Delete all onboarding guide documents
      const onboardingDocs = await tx.run(
        zql.documents.where("organization_id", organizationId).where("deleted_at", "IS", null),
      );

      const onboardingDocumentIds = onboardingDocs
        .filter(
          (doc) =>
            doc.custom_fields &&
            typeof doc.custom_fields === "object" &&
            "isOnboardingGuide" in doc.custom_fields &&
            doc.custom_fields.isOnboardingGuide === "true",
        )
        .map((doc) => doc.id);

      const now = Date.now();
      for (const docId of onboardingDocumentIds) {
        await tx.mutate.documents.update(
          withUpdatedTimestamp({
            id: docId,
            deleted_at: now,
          }),
        );
      }
    },
  ),
};
