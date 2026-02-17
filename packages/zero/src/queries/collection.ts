import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

/**
 * Queries for collections
 *
 * A Collection IS a Page - specifically, a Page with a schema attached.
 * When a Page has a schema, it becomes a Collection and its children are entries.
 */

export const collectionQueries = {
  // Get all Collections (Pages with collection_schema) in an organization
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      // Collections are Pages with a collection_schema field
      return zql.documents
        .where("organization_id", organizationId)
        .where("collection_schema", "IS NOT", null)
        .where("deleted_at", "IS", null)
        .orderBy("title", "asc");
    },
  ),

  // Get a specific Collection (Page with collection_schema) by ID
  byId: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .where("collection_schema", "IS NOT", null)
        .where("deleted_at", "IS", null)
        .one()
        .related("entries", (q) =>
          q.where("deleted_at", "IS", null).orderBy("created_at", "desc"),
        );
    },
  ),

  // Get entries (documents) in a Collection
  documentsByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("collection_id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "desc");
    },
  ),

  // Get a document with its Collection (parent Page with schema)
  documentsWithCollection: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("collection");
    },
  ),

  // Get Collection entries with inherited schema from ancestor Collections
  // This walks up the parent chain to collect all schema fields
  documentsWithInheritedSchema: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("parent", (q) =>
          q
            .where("collection_schema", "IS NOT", null)
            .where("deleted_at", "IS", null)
            .related("parent", (q2) =>
              q2
                .where("collection_schema", "IS NOT", null)
                .where("deleted_at", "IS", null),
            ),
        )
        .related("entries", (q) =>
          q.where("deleted_at", "IS", null).orderBy("created_at", "desc"),
        );
    },
  ),
};
