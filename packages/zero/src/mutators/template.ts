import { defineMutator } from "@rocicorp/zero"
import { createId } from "@lydie/core/id"
import { convertJsonToYjs, convertYjsToJson } from "@lydie/core/yjs-to-json"
import { slugify } from "@lydie/core/utils"
import { z } from "zod"
import { isAuthenticated, hasOrganizationAccess, requireAdmin } from "../auth"
import { zql } from "../schema"

export const templateMutators = {
  create: defineMutator(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      rootDocumentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx)

      const rootDocument = await tx.run(
        zql.documents
          .where("id", args.rootDocumentId)
          .where("organization_id", args.organizationId)
          .where("deleted_at", "IS", null)
          .one(),
      )

      if (!rootDocument) {
        throw new Error("Root document not found")
      }

      const allDocuments: Array<{
        id: string
        title: string
        yjsState: any
        parentId: string | null
        sortOrder: number
      }> = []

      const docIdToIndex = new Map<string, number>()

      const collectDocuments = async (parentId: string) => {
        const children = await tx.run(
          zql.documents
            .where("parent_id", parentId)
            .where("organization_id", args.organizationId)
            .where("deleted_at", "IS", null)
            .orderBy("sort_order", "asc")
            .orderBy("created_at", "asc"),
        )

        for (const doc of children) {
          const docIndex = allDocuments.length
          docIdToIndex.set(doc.id, docIndex)

          allDocuments.push({
            id: doc.id,
            title: doc.title,
            yjsState: doc.yjs_state,
            parentId: doc.parent_id,
            sortOrder: doc.sort_order ?? 0,
          })

          // Recursively collect children
          await collectDocuments(doc.id)
        }
      }

      // Add root document first
      const rootIndex = allDocuments.length
      docIdToIndex.set(rootDocument.id, rootIndex)
      allDocuments.push({
        id: rootDocument.id,
        title: rootDocument.title,
        yjsState: rootDocument.yjs_state,
        parentId: rootDocument.parent_id,
        sortOrder: rootDocument.sort_order ?? 0,
      })

      // Collect all children recursively
      await collectDocuments(args.rootDocumentId)

      if (allDocuments.length === 0) {
        throw new Error("No documents found to create template from")
      }

      const templateId = createId()
      const slug = `${slugify(args.name)}-${createId().slice(0, 6)}`

      // Create template
      await tx.mutate.templates.insert({
        id: templateId,
        name: args.name,
        slug,
        description: args.description || null,
        preview_data: null, // Will be updated with document structure
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      // Create template documents and build ID mapping
      const templateDocIdMap = new Map<number, string>() // Map from index to template document ID

      // First pass: create all template documents and collect their IDs
      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i]
        if (!doc) continue

        const templateDocId = createId()
        templateDocIdMap.set(i, templateDocId)

        // Convert YJS state to JSON, then back to YJS for storage
        // (template_documents stores YJS state)
        const jsonContent = doc.yjsState ? convertYjsToJson(doc.yjsState) : null
        const yjsState = jsonContent ? convertJsonToYjs(jsonContent) : null

        await tx.mutate.template_documents.insert({
          id: templateDocId,
          template_id: templateId,
          title: doc.title,
          content: yjsState,
          parent_id: null, // Will be updated in second pass
          sort_order: doc.sortOrder,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }

      // Second pass: update parent_id references
      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i]
        if (!doc || !doc.parentId) continue

        // Find the parent's index in our array
        const parentIndex = docIdToIndex.get(doc.parentId)
        if (parentIndex === undefined) continue

        const templateDocId = templateDocIdMap.get(i)
        const parentTemplateDocId = templateDocIdMap.get(parentIndex)

        if (templateDocId && parentTemplateDocId) {
          await tx.mutate.template_documents.update({
            id: templateDocId,
            parent_id: parentTemplateDocId,
          })
        }
      }
    },
  ),

  update: defineMutator(
    z.object({
      templateId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx)

      const template = await tx.run(zql.templates.where("id", args.templateId).one())

      if (!template) {
        throw new Error("Template not found")
      }

      const updates: any = {
        id: args.templateId,
        updated_at: Date.now(),
      }

      if (args.name !== undefined) {
        updates.name = args.name
        updates.slug = `${slugify(args.name)}-${createId().slice(0, 6)}`
      }

      if (args.description !== undefined) {
        updates.description = args.description
      }

      await tx.mutate.templates.update(updates)
    },
  ),

  delete: defineMutator(
    z.object({
      templateId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx)

      const template = await tx.run(zql.templates.where("id", args.templateId).one())

      if (!template) {
        throw new Error("Template not found")
      }

      // Delete template (cascade will handle documents and installations)
      await tx.mutate.templates.delete({
        id: args.templateId,
      })
    },
  ),

  install: defineMutator(
    z.object({
      templateSlug: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      isAuthenticated(ctx)
      hasOrganizationAccess(ctx, args.organizationId)

      // Only run on server - templates are not synced to client cache
      if (tx.location === "client") {
        // No optimistic update - wait for server to process
        return
      }

      // 1. Fetch template (server-only)
      const template = await tx.run(zql.templates.where("slug", args.templateSlug).one())

      if (!template) {
        throw new Error("Template not found")
      }

      // 2. Fetch all template documents (server-only)
      const templateDocs = await tx.run(
        zql.template_documents.where("template_id", template.id).orderBy("sort_order", "asc"),
      )

      if (!templateDocs || templateDocs.length === 0) {
        throw new Error("Template has no documents")
      }

      // 3. Create mapping of old template doc IDs to new document IDs
      const docIdMap = new Map<string, string>()
      for (const doc of templateDocs) {
        docIdMap.set(doc.id, createId())
      }

      // 4. Create root document first (documents without parent)
      let rootDocumentId: string
      const rootDocs = templateDocs.filter((d) => !d.parent_id)

      if (rootDocs.length === 0) {
        throw new Error("Template has no root document")
      }

      // Use the first root document as the main root
      const rootTemplateDoc = rootDocs[0]
      if (!rootTemplateDoc) {
        throw new Error("Root template document is undefined")
      }

      const mappedRootId = docIdMap.get(rootTemplateDoc.id)
      if (!mappedRootId) {
        throw new Error("Failed to map root document ID")
      }
      rootDocumentId = mappedRootId

      await tx.mutate.documents.insert({
        id: rootDocumentId,
        slug: `${slugify(rootTemplateDoc.title)}-${createId().slice(0, 6)}`,
        title: rootTemplateDoc.title,
        yjs_state: rootTemplateDoc.content || null,
        user_id: ctx.userId,
        organization_id: args.organizationId,
        index_status: "pending",
        integration_link_id: null,
        is_locked: false,
        published: false,
        parent_id: null,
        sort_order: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      })

      // 5. Create remaining documents with hierarchy
      const remainingDocs = templateDocs.filter((d) => d.id !== rootTemplateDoc.id)

      for (const templateDoc of remainingDocs) {
        const newDocId = docIdMap.get(templateDoc.id)!
        const newParentId = templateDoc.parent_id ? docIdMap.get(templateDoc.parent_id) : rootDocumentId

        await tx.mutate.documents.insert({
          id: newDocId,
          slug: `${slugify(templateDoc.title)}-${createId().slice(0, 6)}`,
          title: templateDoc.title,
          yjs_state: templateDoc.content || null,
          user_id: ctx.userId,
          organization_id: args.organizationId,
          index_status: "pending",
          integration_link_id: null,
          is_locked: false,
          published: false,
          parent_id: newParentId || null,
          sort_order: templateDoc.sort_order,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }

      // 6. Track installation
      await tx.mutate.template_installations.insert({
        id: createId(),
        template_id: template.id,
        organization_id: args.organizationId,
        installed_by_user_id: ctx.userId,
        root_document_id: rootDocumentId,
        created_at: Date.now(),
      })
    },
  ),
}
