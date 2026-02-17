import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

/**
 * Collection Queries
 *
 * Collections are Documents with a corresponding row in collection_schemas.
 * A Document becomes a Collection implicitly when a schema row is created.
 * Documents inherit properties from ancestor Collections via the path column.
 */

export const collectionQueries = {
  // Get all Collections (Documents with a collection_schemas row) in an organization
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_schemas
        .where("organization_id", organizationId)
        .related("document", (q: any) =>
          q.where("deleted_at", "IS", null).orderBy("title", "asc"),
        );
    },
  ),

  // Get a specific Collection by ID (the Document that has a schema)
  byId: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_schemas
        .where("document_id", collectionId)
        .where("organization_id", organizationId)
        .one()
        .related("document", (q: any) =>
          q.where("deleted_at", "IS", null),
        )
        .related("fieldValues", (q: any) =>
          q.related("document").orderBy("created_at", "desc"),
        );
    },
  ),

  // Get Documents that belong to a Collection (direct children)
  documentsByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("nearest_collection_id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .where("parent_id", collectionId) // Direct children only
        .orderBy("created_at", "desc")
        .related("fieldValues");
    },
  ),

  // Get all descendants of a Collection (for nested collections)
  allDocumentsByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string(), path: z.string() }),
    ({ args: { organizationId, collectionId, path }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      // Use path LIKE query to get all descendants
      return zql.documents
        .where("nearest_collection_id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .where("path", "LIKE", `${path}/%`)
        .orderBy("path", "asc")
        .related("fieldValues");
    },
  ),

  // Get a Document with its nearest Collection
  documentWithCollection: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("nearestCollection", (q: any) =>
          q.related("collectionSchema"),
        )
        .related("fieldValues", (q: any) => q.related("collectionSchema"));
    },
  ),

  // Get Collection schema with all ancestor schemas for inheritance resolution
  collectionWithInheritedSchema: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      // Get the collection document with its schema
      return zql.documents
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("collectionSchema")
        .related("parent", (q: any) =>
          // Walk up the tree to get ancestor collections
          q
            .where("deleted_at", "IS", null)
            .related("collectionSchema")
            .related("parent", (q2: any) =>
              q2
                .where("deleted_at", "IS", null)
                .related("collectionSchema"),
            ),
        );
    },
  ),

  // Get field values for a specific document
  documentFieldValues: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.document_field_values
        .where("document_id", documentId)
        .related("collectionSchema");
    },
  ),
};
