import { createId } from "@lydie/core/id";
import { defineMutator } from "@rocicorp/zero";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";
import { withTimestamps } from "../utils/timestamps";

/**
 * Collection Mutators
 *
 * Collections are Documents with a corresponding row in collection_schemas.
 * These mutators handle the creation and management of Collections and their schemas.
 */

export const collectionMutators = {
  /**
   * Create a Collection schema for a Document
   * This makes the Document a Collection
   */
  createSchema: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
      properties: z
        .array(
          z.object({
            name: z.string(),
            type: z.enum(["text", "number", "date", "select", "multi-select", "boolean", "relation"]),
            required: z.boolean(),
            unique: z.boolean(),
            options: z.array(z.string()).optional(),
            derived: z
              .object({
                sourceField: z.string(),
                transform: z.enum(["slugify"]),
                editable: z.boolean(),
                warnOnChangeAfterPublish: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .default([]),
    }),
    async ({ tx, ctx, args: { documentId, organizationId, properties } }) => {
      hasOrganizationAccess(ctx, organizationId);

      const schemaId = createId();

      // Insert the collection schema
      await tx.mutate.collection_schemas.insert(
        withTimestamps({
          id: schemaId,
          document_id: documentId,
          organization_id: organizationId,
          properties: properties as ReadonlyJSONValue,
        }),
      );

      // Update show_children_in_sidebar on the document
      await tx.mutate.documents.update({
        id: documentId,
        show_children_in_sidebar: false, // Default per spec
      });

      // Get all direct children and create field value rows for them
      const children = await tx.run(
        zql.documents
          .where("parent_id", documentId)
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null),
      );

      // Create document_field_values rows for each child with null defaults
      const nullValues: Record<string, null> = {};
      for (const prop of properties) {
        nullValues[prop.name] = null;
      }

      for (const child of children) {
        await tx.mutate.document_field_values.insert(
          withTimestamps({
            id: createId(),
            document_id: child.id,
            collection_schema_id: schemaId,
            values: nullValues as ReadonlyJSONValue,
            orphaned_values: {},
          }),
        );

        // Update nearest_collection_id for children
        await tx.mutate.documents.update({
          id: child.id,
          nearest_collection_id: documentId,
        });
      }
    },
  ),

  /**
   * Update a Collection's properties
   */
  updateSchema: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
      properties: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["text", "number", "date", "select", "multi-select", "boolean", "relation"]),
          required: z.boolean(),
          unique: z.boolean(),
          options: z.array(z.string()).optional(),
          derived: z
            .object({
              sourceField: z.string(),
              transform: z.enum(["slugify"]),
              editable: z.boolean(),
              warnOnChangeAfterPublish: z.boolean().optional(),
            })
            .optional(),
        }),
      ),
    }),
    async ({ tx, ctx, args: { collectionId, organizationId, properties } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get existing schema
      const existingSchema = await tx.run(
        zql.collection_schemas
          .where("document_id", collectionId)
          .where("organization_id", organizationId)
          .one(),
      );

      if (!existingSchema) {
        throw new Error("Collection schema not found");
      }

      const existingProps = (existingSchema.properties as Array<{ name: string }>) || [];
      const newPropNames = new Set(properties.map((p) => p.name));
      const existingPropNames = new Set(existingProps.map((p) => p.name));

      // Find added and removed properties
      const addedProps = properties.filter((p) => !existingPropNames.has(p.name));
      const removedProps = existingProps.filter((p) => !newPropNames.has(p.name));

      // Update the schema
      await tx.mutate.collection_schemas.update({
        id: existingSchema.id,
        properties: properties as ReadonlyJSONValue,
      });

      // Get all field values for this schema
      const fieldValues = await tx.run(
        zql.document_field_values.where("collection_schema_id", existingSchema.id),
      );

      // Update field values for added/removed properties
      for (const fv of fieldValues) {
        const currentValues = (fv.values as Record<string, unknown>) || {};
        const newValues: Record<string, unknown> = { ...currentValues };

        // Add null defaults for new properties
        for (const prop of addedProps) {
          newValues[prop.name] = null;
        }

        // Remove deleted properties
        for (const prop of removedProps) {
          delete newValues[prop.name];
        }

        await tx.mutate.document_field_values.update({
          id: fv.id,
          values: newValues as ReadonlyJSONValue,
        });
      }
    },
  ),

  /**
   * Delete a Collection schema
   * This reverts the Document to being a plain Document
   */
  deleteSchema: defineMutator(
    z.object({
      collectionId: z.string(),
      organizationId: z.string(),
    }),
    async ({ tx, ctx, args: { collectionId, organizationId } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get the schema to find its id
      const schema = await tx.run(
        zql.collection_schemas
          .where("document_id", collectionId)
          .where("organization_id", organizationId)
          .one(),
      );

      if (!schema) {
        throw new Error("Collection schema not found");
      }

      // Delete all field values for this schema
      const fieldValues = await tx.run(
        zql.document_field_values.where("collection_schema_id", schema.id),
      );

      for (const fv of fieldValues) {
        await tx.mutate.document_field_values.delete({ id: fv.id });
      }

      // Delete the schema itself
      await tx.mutate.collection_schemas.delete({ id: schema.id });

      // Recalculate nearest_collection_id for all descendants
      // Find all documents that had this as their nearest collection
      const affectedDocs = await tx.run(
        zql.documents
          .where("nearest_collection_id", collectionId)
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null),
      );

      for (const doc of affectedDocs) {
        // Walk up the parent chain to find the new nearest collection
        const newNearestCollectionId = await findNearestCollection(tx, doc.parent_id);

        await tx.mutate.documents.update({
          id: doc.id,
          nearest_collection_id: newNearestCollectionId,
        });
      }
    },
  ),

  /**
   * Update field values for a Document
   */
  updateFieldValues: defineMutator(
    z.object({
      documentId: z.string(),
      collectionSchemaId: z.string(),
      organizationId: z.string(),
      values: z.any(), // Accept any JSON value - Zero will validate at runtime
    }),
    async ({ tx, ctx, args: { documentId, collectionSchemaId, organizationId, values } }) => {
      hasOrganizationAccess(ctx, organizationId);

      // Get existing field values row
      let existing = null;
      try {
        existing = await tx.run(
          zql.document_field_values
            .where("document_id", documentId)
            .where("collection_schema_id", collectionSchemaId)
            .one(),
        );
      } catch {
        // No existing row found
      }

      if (existing) {
        // Merge with existing values
        await tx.mutate.document_field_values.update({
          id: existing.id,
          values: {
            ...(existing.values as Record<string, unknown>),
            ...(values as Record<string, unknown>),
          } as ReadonlyJSONValue,
        });
      } else {
        // Create new field values row
        await tx.mutate.document_field_values.insert(
          withTimestamps({
            id: createId(),
            document_id: documentId,
            collection_schema_id: collectionSchemaId,
            values: values as ReadonlyJSONValue,
            orphaned_values: {},
          }),
        );
      }
    },
  ),

  /**
   * Update show_children_in_sidebar for a Collection
   */
  updateSidebarVisibility: defineMutator(
    z.object({
      documentId: z.string(),
      organizationId: z.string(),
      showChildrenInSidebar: z.boolean(),
    }),
    async ({ tx, ctx, args: { documentId, organizationId, showChildrenInSidebar } }) => {
      hasOrganizationAccess(ctx, organizationId);

      await tx.mutate.documents.update({
        id: documentId,
        show_children_in_sidebar: showChildrenInSidebar,
      });
    },
  ),
};

/**
 * Helper function to find the nearest ancestor Collection
 */
async function findNearestCollection(tx: any, parentId: string | null): Promise<string | null> {
  if (!parentId) return null;

  // Check if this parent is a collection
  let parent = null;
  try {
    parent = await tx.run(zql.documents.where("id", parentId).one());
  } catch {
    return null;
  }
  
  if (!parent) return null;

  let hasSchema = null;
  try {
    hasSchema = await tx.run(
      zql.collection_schemas.where("document_id", parentId).one(),
    );
  } catch {
    // Not a collection
  }

  if (hasSchema) {
    return parentId;
  }

  // Recursively check parent's parent
  return findNearestCollection(tx, parent.parent_id);
}
