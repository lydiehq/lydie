import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { convertJsonToYjs, convertYjsToJson } from "@lydie/core/yjs-to-json";
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess, isAuthenticated, requireAdmin } from "../auth";
import { zql } from "../schema";

export const templateMutators = {
  create: defineMutator(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      teaser: z.string().optional(),
      detailedDescription: z.string().optional(),
      categoryIds: z.array(z.string()).optional(),
      rootDocumentId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const rootDocument = await tx.run(
        zql.documents
          .where("id", args.rootDocumentId)
          .where("organization_id", args.organizationId)
          .where("deleted_at", "IS", null)
          .one(),
      );

      if (!rootDocument) {
        throw new Error("Root document not found");
      }

      const allDocuments: Array<{
        id: string;
        title: string;
        yjsState: any;
        parentId: string | null;
        sortOrder: number;
      }> = [];

      const docIdToIndex = new Map<string, number>();

      const collectDocuments = async (parentId: string) => {
        const children = await tx.run(
          zql.documents
            .where("parent_id", parentId)
            .where("organization_id", args.organizationId)
            .where("deleted_at", "IS", null)
            .orderBy("sort_order", "asc")
            .orderBy("created_at", "asc"),
        );

        for (const doc of children) {
          const docIndex = allDocuments.length;
          docIdToIndex.set(doc.id, docIndex);

          allDocuments.push({
            id: doc.id,
            title: doc.title,
            yjsState: doc.yjs_state,
            parentId: doc.parent_id,
            sortOrder: doc.sort_order ?? 0,
          });

          // Recursively collect children
          await collectDocuments(doc.id);
        }
      };

      // Add root document first
      const rootIndex = allDocuments.length;
      docIdToIndex.set(rootDocument.id, rootIndex);
      allDocuments.push({
        id: rootDocument.id,
        title: rootDocument.title,
        yjsState: rootDocument.yjs_state,
        parentId: rootDocument.parent_id,
        sortOrder: rootDocument.sort_order ?? 0,
      });

      // Collect all children recursively
      await collectDocuments(args.rootDocumentId);

      if (allDocuments.length === 0) {
        throw new Error("No documents found to create template from");
      }

      const templateId = createId();
      const slug = `${slugify(args.name)}-${createId().slice(0, 6)}`;

      await tx.mutate.templates.insert({
        id: templateId,
        name: args.name,
        slug,
        description: args.description || null,
        teaser: args.teaser || null,
        detailed_description: args.detailedDescription || null,
        preview_data: null, // Will be updated with document structure
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      if (args.categoryIds && args.categoryIds.length > 0) {
        for (const categoryId of args.categoryIds) {
          await tx.mutate.template_category_assignments.insert({
            id: createId(),
            template_id: templateId,
            category_id: categoryId,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
        }
      }

      const templateDocIdMap = new Map<number, string>(); // Map from index to template document ID

      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i];
        if (!doc) continue;

        const templateDocId = createId();
        templateDocIdMap.set(i, templateDocId);

        // Convert YJS state to JSON for marketing site, and store both
        const jsonContent = doc.yjsState
          ? convertYjsToJson(doc.yjsState)
          : { type: "doc", content: [] };
        const yjsState = doc.yjsState ? convertJsonToYjs(jsonContent) : null;

        await tx.mutate.template_documents.insert({
          id: templateDocId,
          template_id: templateId,
          title: doc.title,
          content: yjsState,
          json_content: jsonContent, // Store pre-processed JSON for fast marketing site access
          parent_id: null, // Will be updated in second pass
          sort_order: doc.sortOrder,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }

      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i];
        if (!doc || !doc.parentId) continue;

        const parentIndex = docIdToIndex.get(doc.parentId);
        if (parentIndex === undefined) continue;

        const templateDocId = templateDocIdMap.get(i);
        const parentTemplateDocId = templateDocIdMap.get(parentIndex);

        if (templateDocId && parentTemplateDocId) {
          await tx.mutate.template_documents.update({
            id: templateDocId,
            parent_id: parentTemplateDocId,
          });
        }
      }

      // Build preview data (document tree) for marketing site
      const previewDocs: Array<{
        id: string;
        title: string;
        content: any;
        children?: any[];
      }> = [];

      const docMap = new Map<number, any>();

      // First pass: create all document objects with JSON content
      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i];
        if (!doc) continue;

        const jsonContent = doc.yjsState
          ? convertYjsToJson(doc.yjsState)
          : { type: "doc", content: [] };
        const templateDocId = templateDocIdMap.get(i)!;

        const previewDoc = {
          id: templateDocId,
          title: doc.title,
          content: jsonContent,
          children: [],
        };
        docMap.set(i, previewDoc);
      }

      // Second pass: build hierarchy
      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i];
        if (!doc) continue;

        const previewDoc = docMap.get(i)!;
        const parentId = doc.parentId;

        if (parentId && docIdToIndex.has(parentId)) {
          const parentIndex = docIdToIndex.get(parentId)!;
          const parent = docMap.get(parentIndex)!;
          if (!parent.children) parent.children = [];
          parent.children.push(previewDoc);
        } else {
          previewDocs.push(previewDoc);
        }
      }

      // Update template with preview data
      await tx.mutate.templates.update({
        id: templateId,
        preview_data: previewDocs,
      });
    },
  ),

  update: defineMutator(
    z.object({
      templateId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      teaser: z.string().optional(),
      detailedDescription: z.string().optional(),
      categoryIds: z.array(z.string()).optional(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const template = await tx.run(zql.templates.where("id", args.templateId).one());

      if (!template) {
        throw new Error("Template not found");
      }

      // Update template fields if provided
      const updateData: Record<string, any> = {
        id: args.templateId,
        updated_at: Date.now(),
      };

      if (args.name !== undefined) {
        updateData.name = args.name;
        updateData.slug = `${slugify(args.name)}-${createId().slice(0, 6)}`;
      }
      if (args.description !== undefined) {
        updateData.description = args.description || null;
      }
      if (args.teaser !== undefined) {
        updateData.teaser = args.teaser || null;
      }
      if (args.detailedDescription !== undefined) {
        updateData.detailed_description = args.detailedDescription || null;
      }

      await tx.mutate.templates.update(updateData);

      // Update category assignments if provided
      if (args.categoryIds !== undefined) {
        // Delete existing assignments
        const existingAssignments = await tx.run(
          zql.template_category_assignments.where("template_id", args.templateId),
        );

        for (const assignment of existingAssignments) {
          await tx.mutate.template_category_assignments.delete({
            id: assignment.id,
          });
        }

        // Create new assignments
        for (const categoryId of args.categoryIds) {
          await tx.mutate.template_category_assignments.insert({
            id: createId(),
            template_id: args.templateId,
            category_id: categoryId,
            created_at: Date.now(),
            updated_at: Date.now(),
          });
        }
      }
    },
  ),

  delete: defineMutator(
    z.object({
      templateId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      requireAdmin(ctx);

      const template = await tx.run(zql.templates.where("id", args.templateId).one());

      if (!template) {
        throw new Error("Template not found");
      }

      // Delete template (cascade will handle documents and installations)
      await tx.mutate.templates.delete({
        id: args.templateId,
      });
    },
  ),

  install: defineMutator(
    z.object({
      templateSlug: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      isAuthenticated(ctx);
      hasOrganizationAccess(ctx, args.organizationId);

      // Only run on server - templates are not synced to client cache
      if (tx.location === "client") {
        // No optimistic update - wait for server to process
        return;
      }

      // 1. Fetch template (server-only)
      const template = await tx.run(zql.templates.where("slug", args.templateSlug).one());

      if (!template) {
        throw new Error("Template not found");
      }

      // 2. Fetch all template documents (server-only)
      const templateDocs = await tx.run(
        zql.template_documents.where("template_id", template.id).orderBy("sort_order", "asc"),
      );

      if (!templateDocs || templateDocs.length === 0) {
        throw new Error("Template has no documents");
      }

      // 3. Create mapping of old template doc IDs to new document IDs
      const docIdMap = new Map<string, string>();
      for (const doc of templateDocs) {
        docIdMap.set(doc.id, createId());
      }

      // 4. Create root document first (documents without parent)
      let rootDocumentId: string;
      const rootDocs = templateDocs.filter((d) => !d.parent_id);

      if (rootDocs.length === 0) {
        throw new Error("Template has no root document");
      }

      // Use the first root document as the main root
      const rootTemplateDoc = rootDocs[0];
      if (!rootTemplateDoc) {
        throw new Error("Root template document is undefined");
      }

      const mappedRootId = docIdMap.get(rootTemplateDoc.id);
      if (!mappedRootId) {
        throw new Error("Failed to map root document ID");
      }
      rootDocumentId = mappedRootId;

      await tx.mutate.documents.insert({
        id: rootDocumentId,
        slug: `${slugify(rootTemplateDoc.title)}-${createId().slice(0, 6)}`,
        title: rootTemplateDoc.title,
        yjs_state: rootTemplateDoc.content || null,
        user_id: ctx.userId,
        organization_id: args.organizationId,
        integration_link_id: null,
        is_locked: false,
        published: false,
        parent_id: null,
        sort_order: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      // 5. Create remaining documents with hierarchy
      const remainingDocs = templateDocs.filter((d) => d.id !== rootTemplateDoc.id);

      for (const templateDoc of remainingDocs) {
        const newDocId = docIdMap.get(templateDoc.id)!;
        const newParentId = templateDoc.parent_id
          ? docIdMap.get(templateDoc.parent_id)
          : rootDocumentId;

        await tx.mutate.documents.insert({
          id: newDocId,
          slug: `${slugify(templateDoc.title)}-${createId().slice(0, 6)}`,
          title: templateDoc.title,
          yjs_state: templateDoc.content || null,
          user_id: ctx.userId,
          organization_id: args.organizationId,
          integration_link_id: null,
          is_locked: false,
          published: false,
          parent_id: newParentId || null,
          sort_order: templateDoc.sort_order,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }

      // 6. Track installation
      await tx.mutate.template_installations.insert({
        id: createId(),
        template_id: template.id,
        organization_id: args.organizationId,
        installed_by_user_id: ctx.userId,
        root_document_id: rootDocumentId,
        created_at: Date.now(),
      });
    },
  ),
};
