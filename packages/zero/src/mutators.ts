import { defineMutators, defineMutator } from "@rocicorp/zero"
import { createId } from "@lydie/core/id"
import { convertJsonToYjs } from "@lydie/core/yjs-to-json"
import { slugify } from "@lydie/core/utils"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess } from "./auth"
import { zql } from "./schema"

export const mutators = defineMutators({
  document: {
    publish: defineMutator(
      z.object({
        documentId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        const document = await tx.run(
          zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        await tx.mutate.documents.update({
          id: documentId,
          published: true,
        })

        await tx.mutate.document_publications.insert({
          id: createId(),
          document_id: documentId,
          organization_id: organizationId,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
    unpublish: defineMutator(
      z.object({
        documentId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        const document = await tx.run(
          zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // Set published to false (publication history is preserved)
        await tx.mutate.documents.update({
          id: documentId,
          published: false,
        })
      },
    ),
    create: defineMutator(
      z.object({
        id: z.string(),
        organizationId: z.string(),
        title: z.string().optional(),
        parentId: z.string().optional(),
        integrationLinkId: z.string().optional(),
      }),
      async ({ tx, ctx, args: { id, organizationId, title = "", parentId, integrationLinkId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        let finalIntegrationLinkId = integrationLinkId

        // If creating as a child page, verify parent document belongs to same organization
        if (parentId) {
          const parent = await tx.run(
            zql.documents
              .where("id", parentId)
              .where("organization_id", organizationId)
              .where("deleted_at", "IS", null)
              .one(),
          )

          if (!parent) {
            throw new Error(`Parent document not found: ${parentId}`)
          }

          // Inherit integration link from parent
          if (parent.integration_link_id) {
            finalIntegrationLinkId = parent.integration_link_id
          }
        }

        // Get the lowest sort_order at this level to prepend new document at the top
        const siblings = await tx.run(
          zql.documents
            .where("organization_id", organizationId)
            .where("parent_id", parentId ? "=" : "IS", parentId || null)
            .where("deleted_at", "IS", null),
        )

        const minSortOrder =
          siblings.length > 0
            ? siblings.reduce((min, doc) => Math.min(min, doc.sort_order ?? 0), siblings[0]?.sort_order ?? 0)
            : 0

        // Create empty Yjs state for new document
        const emptyContent = { type: "doc", content: [] }
        const yjsState = convertJsonToYjs(emptyContent)

        await tx.mutate.documents.insert({
          id,
          slug: id,
          title,
          yjs_state: yjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          index_status: "pending",
          integration_link_id: finalIntegrationLinkId || null,
          is_locked: false,
          published: false,
          parent_id: parentId || null,
          sort_order: minSortOrder - 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
    createOnboardingGuide: defineMutator(
      z.object({
        organizationId: z.string(),
        parentId: z.string(),
        childId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId, parentId, childId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        const { getOnboardingGuideContent } = await import("./onboarding-guide-content")
        const guideContent = getOnboardingGuideContent(childId)

        // Get the highest sort_order to append at the end
        const siblings = await tx.run(
          zql.documents
            .where("organization_id", organizationId)
            .where("parent_id", "IS", null)
            .where("deleted_at", "IS", null),
        )

        const maxSortOrder = siblings.reduce((max, doc) => Math.max(max, doc.sort_order ?? 0), 0)

        const parentYjsState = convertJsonToYjs(guideContent.parent.content)
        const childYjsState = convertJsonToYjs(guideContent.child.content)

        // Insert parent document
        await tx.mutate.documents.insert({
          id: parentId,
          slug: parentId,
          title: guideContent.parent.title,
          yjs_state: parentYjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          index_status: "pending",
          integration_link_id: null,
          is_locked: false,
          published: false,
          parent_id: null,
          sort_order: maxSortOrder + 1,
          custom_fields: { isOnboardingGuide: "true" },
          created_at: Date.now(),
          updated_at: Date.now(),
        })

        // Insert child document
        await tx.mutate.documents.insert({
          id: childId,
          slug: childId,
          title: guideContent.child.title,
          yjs_state: childYjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          index_status: "pending",
          integration_link_id: null,
          is_locked: false,
          published: false,
          parent_id: parentId,
          sort_order: 0,
          custom_fields: {
            isOnboardingGuide: "true",
            Status: "In Progress",
            Priority: "High",
            Type: "Tutorial",
          },
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
    update: defineMutator(
      z.object({
        documentId: z.string(),
        title: z.string().optional(),
        published: z.boolean().optional(),
        slug: z.string().optional(),
        indexStatus: z.string().optional(),
        customFields: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        coverImage: z.string().nullable().optional(),
        organizationId: z.string(),
      }),
      async ({
        tx,
        ctx,
        args: { documentId, title, published, slug, indexStatus, customFields, coverImage, organizationId },
      }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify document belongs to the organization
        const document = await tx.run(
          zql.documents
            .where("id", documentId)
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // Block title updates for locked pages
        if (document.is_locked && title !== undefined) {
          throw new Error("Cannot edit locked document. This page is managed by an integration.")
        }

        const updates: any = {
          id: documentId,
          updated_at: Date.now(),
        }

        if (title !== undefined) updates.title = title
        if (published !== undefined) updates.published = published
        if (slug !== undefined) updates.slug = slug
        if (indexStatus !== undefined) updates.index_status = indexStatus
        if (customFields !== undefined) updates.custom_fields = customFields
        if (coverImage !== undefined) updates.cover_image = coverImage

        await tx.mutate.documents.update(updates)
      },
    ),
    rename: defineMutator(
      z.object({
        documentId: z.string(),
        title: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, title, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify document belongs to the organization
        const document = await tx.run(
          zql.documents
            .where("id", documentId)
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // Block rename for locked pages
        if (document.is_locked) {
          throw new Error("Cannot rename locked document. This page is managed by an integration.")
        }

        await tx.mutate.documents.update({
          id: documentId,
          title,
          updated_at: Date.now(),
        })
      },
    ),
    moveToParent: defineMutator(
      z.object({
        documentId: z.string(),
        parentId: z.string().optional(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, parentId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify document belongs to the organization
        const document = await tx.run(
          zql.documents
            .where("id", documentId)
            .where("organization_id", organizationId)
            .where("deleted_at", "IS", null)
            .one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // If moving to a parent document, verify parent belongs to same organization
        // and check for circular references
        if (parentId) {
          if (parentId === documentId) {
            throw new Error("Cannot move document into itself")
          }

          const parent = await tx.run(
            zql.documents
              .where("id", parentId)
              .where("organization_id", organizationId)
              .where("deleted_at", "IS", null)
              .one(),
          )

          if (!parent) {
            throw new Error(`Parent document not found: ${parentId}`)
          }

          // Check for circular reference - ensure parent is not a descendant of this document
          let currentParentId: string | null = parent.parent_id
          while (currentParentId) {
            if (currentParentId === documentId) {
              throw new Error("Cannot move document into its own descendant")
            }
            const currentParent = await tx.run(
              zql.documents
                .where("id", currentParentId)
                .where("organization_id", organizationId)
                .where("deleted_at", "IS", null)
                .one(),
            )
            if (!currentParent) break
            currentParentId = currentParent.parent_id
          }
        }

        await tx.mutate.documents.update({
          id: documentId,
          parent_id: parentId || null,
          updated_at: Date.now(),
        })
      },
    ),
    reorder: defineMutator(
      z.object({
        documentIds: z.array(z.string()),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentIds, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify all documents belong to the organization
        const documents = await Promise.all(
          documentIds.map((id) =>
            tx.run(
              zql.documents
                .where("id", id)
                .where("organization_id", organizationId)
                .where("deleted_at", "IS", null)
                .one(),
            ),
          ),
        )

        // Check if any documents are missing
        for (let i = 0; i < documentIds.length; i++) {
          if (!documents[i]) {
            throw new Error(`Document not found: ${documentIds[i]}`)
          }
        }

        // Update sort_order for each document based on array position
        await Promise.all(
          documentIds.map((id, index) =>
            tx.mutate.documents.update({
              id,
              sort_order: index,
              updated_at: Date.now(),
            }),
          ),
        )
      },
    ),
    move: defineMutator(
      z.object({
        documentId: z.string(),
        targetParentId: z.string().optional().nullable(),
        targetIntegrationLinkId: z.string().optional().nullable(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, targetParentId, targetIntegrationLinkId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        const updates: any = {
          id: documentId,
          updated_at: Date.now(),
        }

        let parentIdQuery = targetParentId || null
        let integrationLinkIdQuery = targetIntegrationLinkId || null

        const siblings = await tx.run(
          zql.documents
            .where("organization_id", organizationId)
            .where("parent_id", parentIdQuery ? "=" : "IS", parentIdQuery)
            .where("integration_link_id", integrationLinkIdQuery ? "=" : "IS", integrationLinkIdQuery)
            .where("deleted_at", "IS", null),
        )

        const maxSortOrder = siblings.reduce((max, doc) => Math.max(max, doc.sort_order ?? 0), 0)
        updates.sort_order = maxSortOrder + 1

        if (targetParentId !== undefined) updates.parent_id = targetParentId
        if (targetIntegrationLinkId !== undefined) updates.integration_link_id = targetIntegrationLinkId

        // Ensure we clear integration link if we are moving out (targetParentId set but targetIntegrationLinkId not)
        // This logic is a bit implicit in client mutator, but server mutator handles it strictly.
        // For client optimistic update: if targetParentId is set and targetIntegrationLinkId is NOT set,
        // we might want to assume it's moving out?
        // Or we rely on the caller passing null for targetIntegrationLinkId explicitly if clearing.
        // My use-document-drag-drop implementation will need to be explicit.

        await tx.mutate.documents.update(updates)
      },
    ),
    delete: defineMutator(
      z.object({
        documentId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { documentId, organizationId } }) => {
        isAuthenticated(ctx)

        const document = await tx.run(
          zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
        )
        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // Recursively find all child documents (including nested children)
        const findAllChildIds = async (parentId: string, childIds: string[] = []): Promise<string[]> => {
          const children = await tx.run(
            zql.documents
              .where("parent_id", parentId)
              .where("organization_id", organizationId)
              .where("deleted_at", "IS", null),
          )

          for (const child of children) {
            childIds.push(child.id)
            // Recursively get children of this child
            await findAllChildIds(child.id, childIds)
          }

          return childIds
        }

        const childIds = await findAllChildIds(documentId)

        // Soft-delete by setting deleted_at
        const isIntegrationDocument = Boolean(document.integration_link_id && document.external_id)

        const now = Date.now()

        // If document is part of an integration, delete it completely from Lydie on delete
        if (isIntegrationDocument) {
          // For integration documents, hard delete all children first
          for (const childId of childIds) {
            await tx.mutate.documents.delete({
              id: childId,
            })
          }
          await tx.mutate.documents.delete({
            id: documentId,
          })
        } else {
          // For regular documents, soft-delete all children first
          for (const childId of childIds) {
            await tx.mutate.documents.update({
              id: childId,
              deleted_at: now,
              updated_at: now,
            })
          }
          // Then soft-delete the parent
          await tx.mutate.documents.update({
            id: documentId,
            deleted_at: now,
            updated_at: now,
          })
        }
      },
    ),
    deleteAllOnboarding: defineMutator(
      z.object({
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Find all onboarding documents
        const onboardingDocs = await tx.run(
          zql.documents.where("organization_id", organizationId).where("deleted_at", "IS", null),
        )

        // Filter to only onboarding documents (check custom_fields)
        const onboardingDocumentIds = onboardingDocs
          .filter(
            (doc) =>
              doc.custom_fields &&
              typeof doc.custom_fields === "object" &&
              "isOnboarding" in doc.custom_fields &&
              doc.custom_fields.isOnboarding === "true",
          )
          .map((doc) => doc.id)

        // Soft-delete all onboarding documents
        const now = Date.now()
        for (const docId of onboardingDocumentIds) {
          await tx.mutate.documents.update({
            id: docId,
            deleted_at: now,
            updated_at: now,
          })
        }
      },
    ),
    importDemoContent: defineMutator(
      z.object({
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        const { demoContent, createIntroDocument } = await import("./demo-content")
        const documentIdMap = new Map<string, string>()
        for (const doc of demoContent) {
          documentIdMap.set(doc.title, createId())
        }
        const introDoc = createIntroDocument(documentIdMap)
        const introDocId = createId()
        documentIdMap.set(introDoc.title, introDocId)
        const introYjsState = convertJsonToYjs(introDoc.content)

        await tx.mutate.documents.insert({
          id: introDocId,
          slug: `${slugify(introDoc.title)}-${createId().slice(0, 6)}`,
          title: introDoc.title,
          yjs_state: introYjsState,
          user_id: ctx.userId,
          organization_id: organizationId,
          index_status: "pending",
          integration_link_id: null,
          is_locked: false,
          published: false,
          parent_id: null,
          sort_order: 0,
          custom_fields: introDoc.customFields || { isOnboarding: "true" },
          created_at: Date.now(),
          updated_at: Date.now(),
        })

        // Step 3: Create all other demo documents
        for (let i = 0; i < demoContent.length; i++) {
          const doc = demoContent[i]
          const docId = documentIdMap.get(doc.title)!
          const yjsState = convertJsonToYjs(doc.content)

          await tx.mutate.documents.insert({
            id: docId,
            slug: `${slugify(doc.title)}-${createId().slice(0, 6)}`,
            title: doc.title,
            yjs_state: yjsState,
            user_id: ctx.userId,
            organization_id: organizationId,
            index_status: "pending",
            integration_link_id: null,
            is_locked: false,
            published: false,
            parent_id: null,
            sort_order: i + 1, // Intro is 0, others start at 1
            custom_fields: { isOnboarding: "true" },
            created_at: Date.now(),
            updated_at: Date.now(),
          })
        }
      },
    ),
  },
  documentComponent: {
    create: defineMutator(
      z.object({
        id: z.string(),
        name: z.string(),
        properties: z.any(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { id, name, properties, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        await tx.mutate.document_components.insert({
          id,
          name,
          properties,
          organization_id: organizationId,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
  },
  assistantConversation: {
    delete: defineMutator(
      z.object({
        conversationId: z.string(),
      }),
      async ({ tx, ctx, args: { conversationId } }) => {
        isAuthenticated(ctx)

        const conversation = await tx.run(zql.assistant_conversations.where("id", conversationId).one())

        if (!conversation) return

        if (conversation.user_id !== ctx.userId) {
          throw new Error("Unauthorized")
        }

        await tx.mutate.assistant_conversations.delete({
          id: conversationId,
        })

        const messages = await tx.run(zql.assistant_messages.where("conversation_id", conversationId))

        for (const message of messages) {
          await tx.mutate.assistant_messages.delete({ id: message.id })
        }
      },
    ),
  },
  apiKey: {
    revoke: defineMutator(
      z.object({
        keyId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { keyId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify API key belongs to the organization
        const apiKey = await tx.run(
          zql.api_keys.where("id", keyId).where("organization_id", organizationId).one(),
        )

        if (!apiKey) {
          throw new Error(`API key not found: ${keyId}`)
        }

        await tx.mutate.api_keys.update({
          id: keyId,
          revoked: true,
          updated_at: Date.now(),
        })
      },
    ),
  },
  userSettings: {
    update: defineMutator(
      z.object({
        persistDocumentTreeExpansion: z.boolean().optional(),
      }),
      async ({ tx, ctx, args: { persistDocumentTreeExpansion } }) => {
        isAuthenticated(ctx)

        // Get or create the user's settings
        let settings = await tx.run(zql.user_settings.where("user_id", ctx.userId).one())

        if (!settings) {
          // Create settings if they don't exist
          const id = createId()
          await tx.mutate.user_settings.insert({
            id,
            user_id: ctx.userId,
            persist_document_tree_expansion: true,
            created_at: Date.now(),
            updated_at: Date.now(),
          })
          settings = await tx.run(zql.user_settings.where("id", id).one())
        }

        if (!settings) {
          throw new Error("User settings not found")
        }

        const updates: any = {
          id: settings.id,
          updated_at: Date.now(),
        }

        if (persistDocumentTreeExpansion !== undefined) {
          updates.persist_document_tree_expansion = persistDocumentTreeExpansion
        }

        await tx.mutate.user_settings.update(updates)
      },
    ),
  },
  organizationSettings: {
    update: defineMutator(
      z.object({
        organizationId: z.string(),
        onboardingStatus: z.json().optional(),
      }),
      async ({ tx, ctx, args: { organizationId, onboardingStatus } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Get or create the organization's settings
        let settings = await tx.run(zql.organization_settings.where("organization_id", organizationId).one())

        if (!settings) {
          // Create settings if they don't exist with default onboarding status
          const id = createId()
          await tx.mutate.organization_settings.insert({
            id,
            organization_id: organizationId,
            onboarding_status: {
              currentStep: "documents",
              isCompleted: false,
              completedSteps: [],
              checkedItems: [],
              createdDemoGuide: false,
            },
            created_at: Date.now(),
            updated_at: Date.now(),
          })
          settings = await tx.run(zql.organization_settings.where("id", id).one())
        }

        if (!settings) {
          throw new Error("Organization settings not found")
        }

        const updates: any = {
          id: settings.id,
          updated_at: Date.now(),
        }

        if (onboardingStatus !== undefined) {
          updates.onboarding_status = onboardingStatus
        }

        await tx.mutate.organization_settings.update(updates)
      },
    ),
    resetOnboarding: defineMutator(
      z.object({
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Get the organization's settings
        const settings = await tx.run(
          zql.organization_settings.where("organization_id", organizationId).one(),
        )

        if (!settings) {
          throw new Error("Organization settings not found")
        }

        // Reset onboarding status to default
        await tx.mutate.organization_settings.update({
          id: settings.id,
          onboarding_status: {
            currentStep: "documents",
            isCompleted: false,
            completedSteps: [],
            checkedItems: [],
            createdDemoGuide: false,
          },
          updated_at: Date.now(),
        })

        // Delete all onboarding guide documents
        const onboardingDocs = await tx.run(
          zql.documents.where("organization_id", organizationId).where("deleted_at", "IS", null),
        )

        const onboardingDocumentIds = onboardingDocs
          .filter(
            (doc) =>
              doc.custom_fields &&
              typeof doc.custom_fields === "object" &&
              "isOnboardingGuide" in doc.custom_fields &&
              doc.custom_fields.isOnboardingGuide === "true",
          )
          .map((doc) => doc.id)

        const now = Date.now()
        for (const docId of onboardingDocumentIds) {
          await tx.mutate.documents.update({
            id: docId,
            deleted_at: now,
            updated_at: now,
          })
        }
      },
    ),
  },
  organization: {
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

        await tx.mutate.organizations.insert({
          id,
          name,
          slug: finalSlug,
          logo: logo || null,
          metadata: metadata || null,
          color: color || null,
          subscription_status: "free",
          subscription_plan: "free",
          created_at: Date.now(),
          updated_at: Date.now(),
          polar_subscription_id: null,
        })

        await tx.mutate.members.insert({
          id: createId(),
          organization_id: id,
          user_id: ctx.userId,
          role: "owner",
          created_at: Date.now(),
          updated_at: Date.now(),
        })

        // Create default organization settings with default onboarding status
        await tx.mutate.organization_settings.insert({
          id: createId(),
          organization_id: id,
          onboarding_status: {
            currentStep: "documents",
            isCompleted: false,
            completedSteps: [],
            checkedItems: [],
            createdDemoGuide: false,
          },
          created_at: Date.now(),
          updated_at: Date.now(),
        })
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
          updated_at: Date.now(),
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

        await tx.mutate.organizations.update(updates)
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
  },
  integration: {
    deleteLink: defineMutator(
      z.object({
        linkId: z.string(),
        deleteDocuments: z.boolean().optional(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { linkId, deleteDocuments, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        const link = await tx.run(
          zql.integration_links
            .where("id", linkId)
            .where("organization_id", organizationId)
            .one()
            .related("documents"),
        )

        if (!link) {
          throw new Error(`Link not found: ${linkId}`)
        }

        if (deleteDocuments) {
          const deleteDocumentsPromise = link.documents.map(({ id }) => tx.mutate.documents.delete({ id }))
          await Promise.all(deleteDocumentsPromise)
        }

        await tx.mutate.integration_links.delete({ id: linkId })
      },
    ),
    createLink: defineMutator(
      z.object({
        id: z.string(),
        connectionId: z.string(),
        name: z.string(),
        config: z.record(z.string(), z.any()),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { id, connectionId, name, config, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one(),
        )

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId} for organization ${organizationId}`)
        }

        await tx.mutate.integration_links.insert({
          id,
          connection_id: connection.id,
          organization_id: organizationId,
          integration_type: connection.integration_type,
          created_at: Date.now(),
          updated_at: Date.now(),
          name,
          config,
          sync_status: "pulling",
        })
      },
    ),
  },
  integrationConnection: {
    create: defineMutator(
      z.object({
        id: z.string(),
        integrationType: z.string(),
        organizationId: z.string(),
        config: z.any(),
      }),
      async ({ tx, ctx, args: { id, integrationType, organizationId, config } }) => {
        hasOrganizationAccess(ctx, organizationId)

        await tx.mutate.integration_connections.insert({
          id,
          integration_type: integrationType,
          status: "active",
          organization_id: organizationId,
          config,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
    update: defineMutator(
      z.object({
        connectionId: z.string(),
        config: z.any().optional(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { connectionId, config, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify connection belongs to the organization
        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one(),
        )

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`)
        }

        const updates: any = {
          id: connectionId,
          updated_at: Date.now(),
        }

        if (config !== undefined) updates.config = config

        await tx.mutate.integration_connections.update(updates)
      },
    ),
    disconnect: defineMutator(
      z.object({
        connectionId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { connectionId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one()
            .related("links"),
        )

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`)
        }

        // Clean up all resources related to this integration connection
        // to avoid duplicate slug violations when documents are moved to root organization

        // For each integration link, delete all associated documents
        for (const link of connection.links) {
          const linkWithDocuments = await tx.run(
            zql.integration_links.where("id", link.id).one().related("documents"),
          )

          if (linkWithDocuments) {
            // Delete all documents associated with this link
            // This will cascade to embeddings, conversations, publications, etc.
            const deleteDocumentsPromise = linkWithDocuments.documents.map(({ id }) =>
              tx.mutate.documents.delete({ id }),
            )
            await Promise.all(deleteDocumentsPromise)
          }
        }

        // Delete the connection (this will cascade to links, sync_metadata, and activity_logs)
        await tx.mutate.integration_connections.delete({
          id: connectionId,
        })
      },
    ),
  },
  syncMetadata: {
    upsert: defineMutator(
      z.object({
        id: z.string().optional(),
        documentId: z.string(),
        connectionId: z.string(),
        externalId: z.string(),
        lastSyncedAt: z.number().optional(),
        lastSyncedHash: z.string().optional(),
        syncStatus: z.string(),
        syncError: z.string().optional(),
        organizationId: z.string(),
      }),
      async ({
        tx,
        ctx,
        args: {
          id,
          documentId,
          connectionId,
          externalId,
          lastSyncedAt,
          lastSyncedHash,
          syncStatus,
          syncError,
          organizationId,
        },
      }) => {
        hasOrganizationAccess(ctx, organizationId)

        // Verify document belongs to the organization
        const document = await tx.run(
          zql.documents.where("id", documentId).where("organization_id", organizationId).one(),
        )

        if (!document) {
          throw new Error(`Document not found: ${documentId}`)
        }

        // Verify connection belongs to the organization
        const connection = await tx.run(
          zql.integration_connections
            .where("id", connectionId)
            .where("organization_id", organizationId)
            .one(),
        )

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`)
        }

        // Check if metadata exists for this document-connection pair
        const existing = await tx.run(
          zql.sync_metadata.where("document_id", documentId).where("connection_id", connectionId).one(),
        )

        if (existing) {
          // Update existing
          const updates: any = {
            id: existing.id,
            external_id: externalId,
            sync_status: syncStatus,
            updated_at: Date.now(),
          }

          if (lastSyncedAt !== undefined) updates.last_synced_at = lastSyncedAt
          if (lastSyncedHash !== undefined) updates.last_synced_hash = lastSyncedHash
          if (syncError !== undefined) updates.sync_error = syncError

          await tx.mutate.sync_metadata.update(updates)
        } else {
          // Insert new
          await tx.mutate.sync_metadata.insert({
            id: id || createId(),
            document_id: documentId,
            connection_id: connectionId,
            external_id: externalId,
            last_synced_at: lastSyncedAt || null,
            last_synced_hash: lastSyncedHash || null,
            sync_status: syncStatus,
            sync_error: syncError || null,
            created_at: Date.now(),
            updated_at: Date.now(),
          })
        }
      },
    ),
  },
  feedback: {
    create: defineMutator(
      z.object({
        id: z.string(),
        type: z.enum(["feedback", "help"]),
        message: z.string().min(1),
        metadata: z.any().optional(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { id, type, message, metadata, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)

        await tx.mutate.feedback_submissions.insert({
          id,
          user_id: ctx.userId,
          organization_id: organizationId,
          type,
          message,
          metadata: metadata || null,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
  },
  agents: {
    create: defineMutator(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        systemPrompt: z.string().min(1),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { name, description, systemPrompt, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        isAuthenticated(ctx)

        // Check if organization is premium
        const organization = await tx.run(zql.organizations.where("id", organizationId).one())

        if (!organization) {
          throw new Error("Organization not found")
        }

        if (organization.subscription_plan !== "pro" || organization.subscription_status !== "active") {
          throw new Error("Premium subscription required to create custom agents")
        }

        const id = createId()
        await tx.mutate.assistant_agents.insert({
          id,
          name,
          description: description || null,
          system_prompt: systemPrompt,
          is_default: false,
          organization_id: organizationId,
          user_id: ctx.userId,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      },
    ),
    update: defineMutator(
      z.object({
        agentId: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        systemPrompt: z.string().min(1).optional(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { agentId, name, description, systemPrompt, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        isAuthenticated(ctx)

        // Get the agent and verify ownership
        const agent = await tx.run(zql.assistant_agents.where("id", agentId).one())

        if (!agent) {
          throw new Error("Agent not found")
        }

        if (agent.is_default) {
          throw new Error("Cannot modify default agents")
        }

        if (agent.user_id !== ctx.userId || agent.organization_id !== organizationId) {
          throw new Error("You don't have permission to modify this agent")
        }

        const updates: any = {
          id: agentId,
          updated_at: Date.now(),
        }

        if (name !== undefined) {
          updates.name = name
        }

        if (description !== undefined) {
          updates.description = description || null
        }

        if (systemPrompt !== undefined) {
          updates.system_prompt = systemPrompt
        }

        await tx.mutate.assistant_agents.update(updates)
      },
    ),
    delete: defineMutator(
      z.object({
        agentId: z.string(),
        organizationId: z.string(),
      }),
      async ({ tx, ctx, args: { agentId, organizationId } }) => {
        hasOrganizationAccess(ctx, organizationId)
        isAuthenticated(ctx)

        // Get the agent and verify ownership
        const agent = await tx.run(zql.assistant_agents.where("id", agentId).one())

        if (!agent) {
          throw new Error("Agent not found")
        }

        if (agent.is_default) {
          throw new Error("Cannot delete default agents")
        }

        if (agent.user_id !== ctx.userId || agent.organization_id !== organizationId) {
          throw new Error("You don't have permission to delete this agent")
        }

        await tx.mutate.assistant_agents.delete({
          id: agentId,
        })
      },
    ),
  },
})

export type Mutators = typeof mutators
