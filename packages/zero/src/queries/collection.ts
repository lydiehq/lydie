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
        .one()
        .related("fieldValues", (q) => q.related("document").orderBy("created_at", "desc"));
    },
  ),

  byHandle: defineQuery(
    z.object({ organizationId: z.string(), handle: z.string() }),
    ({ args: { organizationId, handle }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.collections
        .where("handle", handle)
        .where("organization_id", organizationId)
        .one();
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
      return zql.collection_fields.where("document_id", documentId).related("collection");
    },
  ),
};
