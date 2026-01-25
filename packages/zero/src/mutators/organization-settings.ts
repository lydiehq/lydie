import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { notFoundError } from "../utils/errors";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

export const organizationSettingsMutators = {
  resetOnboarding: defineMutator(
    z.object({
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

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
