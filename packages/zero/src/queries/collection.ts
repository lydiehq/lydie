import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const collectionQueries = {
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collections
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("name", "asc");
    },
  ),

  byId: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collections
        .where("id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one();
    },
  ),

  byHandle: defineQuery(
    z.object({ organizationId: z.string(), handle: z.string() }),
    ({ args: { organizationId, handle }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collections
        .where("handle", handle)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one();
    },
  ),

  viewsByOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_views
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "asc")
        .related("collection");
    },
  ),

  viewsByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_views
        .where("organization_id", organizationId)
        .where("collection_id", collectionId)
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "asc")
        .related("collection");
    },
  ),

  viewById: defineQuery(
    z.object({ organizationId: z.string(), viewId: z.string() }),
    ({ args: { organizationId, viewId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_views
        .where("organization_id", organizationId)
        .where("id", viewId)
        .where("deleted_at", "IS", null)
        .one()
        .related("collection");
    },
  ),

  viewUsagesByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collection_view_usages
        .where("organization_id", organizationId)
        .where("collection_id", collectionId)
        .related("document", (q) =>
          q.where("organization_id", organizationId).where("deleted_at", "IS", null),
        )
        .related("view", (q) => q.where("deleted_at", "IS", null));
    },
  ),

  trash: defineQuery(
    z.object({
      organizationId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, limit = 100 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collections
        .where("organization_id", organizationId)
        .where("deleted_at", "IS NOT", null)
        .orderBy("deleted_at", "desc")
        .limit(limit);
    },
  ),

  documentsByCollection: defineQuery(
    z.object({ organizationId: z.string(), collectionId: z.string() }),
    ({ args: { organizationId, collectionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("collection_id", collectionId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "desc")
        .related("fieldValues", (q) => q.related("collection"));
    },
  ),

  documentWithCollection: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("collection")
        .related("fieldValues", (q) => q.related("collection"));
    },
  ),

  documentFieldValues: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("fieldValues", (q) => q.related("collection"));
    },
  ),
};
