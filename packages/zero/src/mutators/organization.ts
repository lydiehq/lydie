import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, isAuthenticated } from "../auth";
import { zql } from "../schema";
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps";

export const organizationMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
      metadata: z.string().optional(),
      color: z.string().optional(),
      onboardingDocId: z.string().optional(),
    }),
    async ({ tx, ctx, args: { id, name, slug, logo, metadata, color, onboardingDocId } }) => {
      isAuthenticated(ctx);

      // Client generates unique slug (baseSlug-createId) so redirect goes to correct workspace
      await tx.mutate.organizations.insert(
        withTimestamps({
          id,
          name,
          slug,
          logo: logo || null,
          metadata: metadata || null,
          color: color || null,
        }),
      );

      await tx.mutate.members.insert(
        withTimestamps({
          id: createId(),
          organization_id: id,
          user_id: ctx.userId,
          role: "owner",
        }),
      );

      // Create default organization settings
      await tx.mutate.organization_settings.insert(
        withTimestamps({
          id: createId(),
          organization_id: id,
        }),
      );

      // Note: Onboarding documents are created by the server mutator
      // which handles embedding generation. The onboardingDocId is passed
      // through to enable this, but document creation happens server-side.
    },
  ),

  update: defineMutator(
    z.object({
      organizationId: z.string(),
      name: z.string().optional(),
      slug: z.string().optional(),
      color: z.string().optional(),
    }),
    async ({ tx, ctx, args: { organizationId, name, slug, color } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const updates: any = {
        id: organizationId,
      };

      if (name !== undefined) {
        updates.name = name;
      }

      if (slug !== undefined) {
        // Check if slug is already taken by another organization
        const existingOrg = await tx.run(
          zql.organizations.where("slug", slug).where("id", "!=", organizationId).one(),
        );

        if (existingOrg) {
          throw new Error("Slug is already taken");
        }

        updates.slug = slug;
      }

      if (color !== undefined) {
        updates.color = color;
      }

      await tx.mutate.organizations.update(withUpdatedTimestamp(updates));
    },
  ),

  delete: defineMutator(
    z.object({
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Verify user is an owner before allowing deletion
      const member = await tx.run(
        zql.members.where("organization_id", organizationId).where("user_id", ctx.userId).one(),
      );

      console.log(member);

      if (!member || member.role !== "owner") {
        throw new Error("Only organization owners can delete the organization");
      }

      // Delete the organization - database cascades will handle related records
      await tx.mutate.organizations.delete({ id: organizationId });
    },
  ),
};
