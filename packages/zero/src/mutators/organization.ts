import { defineMutator } from "@rocicorp/zero"
import { createId } from "@lydie/core/id"
import { slugify } from "@lydie/core/utils"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess } from "../auth"
import { zql } from "../schema"
import { withTimestamps, withUpdatedTimestamp } from "../utils/timestamps"

const DEFAULT_ONBOARDING_STATUS = {
  currentStep: "documents",
  isCompleted: false,
  completedSteps: [],
  checkedItems: [],
  createdDemoGuide: false,
}

export const organizationMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      logo: z.string().optional(),
      metadata: z.string().optional(),
      color: z.string().optional(),
    }),
    async ({ tx, ctx, args: { id, name, slug, logo, metadata, color } }) => {
      isAuthenticated(ctx)

      // Verify slug doesn't already exist and make it unique if needed
      let finalSlug = slug
      let existingOrg = await tx.run(zql.organizations.where("slug", finalSlug).one())

      // If slug exists, try with a longer suffix
      if (existingOrg) {
        const baseSlug = slugify(name)
        finalSlug = `${baseSlug}-${createId().slice(0, 8)}`
        existingOrg = await tx.run(zql.organizations.where("slug", finalSlug).one())
      }

      // If still exists, use organization ID as suffix (guaranteed unique)
      if (existingOrg) {
        const baseSlug = slugify(name)
        finalSlug = `${baseSlug}-${id.slice(0, 8)}`
      }

      await tx.mutate.organizations.insert(
        withTimestamps({
          id,
          name,
          slug: finalSlug,
          logo: logo || null,
          metadata: metadata || null,
          color: color || null,
          subscription_status: "free",
          subscription_plan: "free",
          polar_subscription_id: null,
        }),
      )

      await tx.mutate.members.insert(
        withTimestamps({
          id: createId(),
          organization_id: id,
          user_id: ctx.userId,
          role: "owner",
        }),
      )

      // Create default organization settings with default onboarding status
      await tx.mutate.organization_settings.insert(
        withTimestamps({
          id: createId(),
          organization_id: id,
          onboarding_status: DEFAULT_ONBOARDING_STATUS,
        }),
      )
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
      hasOrganizationAccess(ctx, organizationId)

      const updates: any = {
        id: organizationId,
      }

      if (name !== undefined) {
        updates.name = name
      }

      if (slug !== undefined) {
        // Check if slug is already taken by another organization
        const existingOrg = await tx.run(
          zql.organizations.where("slug", slug).where("id", "!=", organizationId).one(),
        )

        if (existingOrg) {
          throw new Error("Slug is already taken")
        }

        updates.slug = slug
      }

      if (color !== undefined) {
        updates.color = color
      }

      await tx.mutate.organizations.update(withUpdatedTimestamp(updates))
    },
  ),

  delete: defineMutator(
    z.object({
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId)

      // Verify user is an owner before allowing deletion
      const member = await tx.run(
        zql.members.where("organization_id", organizationId).where("user_id", ctx.userId).one(),
      )

      console.log(member)

      if (!member || member.role !== "owner") {
        throw new Error("Only organization owners can delete the organization")
      }

      // Delete the organization - database cascades will handle related records
      await tx.mutate.organizations.delete({ id: organizationId })
    },
  ),
}
