import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
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

      // Verify slug doesn't already exist and make it unique if needed
      let finalSlug = slug;
      let existingOrg = await tx.run(zql.organizations.where("slug", finalSlug).one());

      // If slug exists, try with a longer suffix
      if (existingOrg) {
        const baseSlug = slugify(name);
        finalSlug = `${baseSlug}-${createId().slice(0, 8)}`;
        existingOrg = await tx.run(zql.organizations.where("slug", finalSlug).one());
      }

      // If still exists, use organization ID as suffix (guaranteed unique)
      if (existingOrg) {
        const baseSlug = slugify(name);
        finalSlug = `${baseSlug}-${id.slice(0, 8)}`;
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

      // Create onboarding guide if onboardingDocId is provided
      if (onboardingDocId) {
        const { createOnboardingGuideContent } = await import("../onboarding-guide-content");
        const { demoContent } = await import("../demo-content");
        const { convertJsonToYjs } = await import("@lydie/core/yjs-to-json");

        // Create a map of demo document IDs
        const documentIdMap = new Map<string, string>();
        for (const doc of demoContent) {
          documentIdMap.set(doc.title, createId());
        }
        documentIdMap.set("Welcome to Your Workspace", onboardingDocId);

        // Create onboarding guide content with references to demo docs
        const guideContent = createOnboardingGuideContent(documentIdMap);
        const guideYjsState = convertJsonToYjs(guideContent);

        // Insert onboarding guide document
        await tx.mutate.documents.insert(
          withTimestamps({
            id: onboardingDocId,
            slug: `${slugify("Welcome to Your Workspace")}-${createId().slice(0, 6)}`,
            title: "👋 Welcome to Your Workspace!",
            yjs_state: guideYjsState,
            user_id: ctx.userId,
            organization_id: id,
            integration_link_id: null,
            is_locked: false,
            published: false,
            parent_id: null,
            sort_order: 0,
            custom_fields: {
              isOnboardingGuide: "true",
              Status: "Getting Started",
              Type: "Guide",
              Priority: "High",
            },
          }),
        );

        // Create demo documents as children of the onboarding guide
        for (let i = 0; i < demoContent.length; i++) {
          const doc = demoContent[i];
          if (!doc) continue;
          const docId = documentIdMap.get(doc.title)!;
          const yjsState = convertJsonToYjs(doc.content);

          await tx.mutate.documents.insert(
            withTimestamps({
              id: docId,
              slug: `${slugify(doc.title)}-${createId().slice(0, 6)}`,
              title: doc.title,
              yjs_state: yjsState,
              user_id: ctx.userId,
              organization_id: id,
              integration_link_id: null,
              is_locked: false,
              published: false,
              parent_id: onboardingDocId,
              sort_order: i,
              custom_fields: { isOnboarding: "true" },
            }),
          );
        }
      }
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
