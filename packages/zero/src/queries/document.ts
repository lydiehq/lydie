import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const documentQueries = {
  byUpdated: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("updated_at", "desc");
    },
  ),

  byId: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one()
        .related("parent")
        .related("children", (q) => q.where("deleted_at", "IS", null).orderBy("created_at", "asc"))
        .related("organization");
    },
  ),

  search: defineQuery(
    z.object({
      organizationId: z.string(),
      searchTerm: z.string(),
    }),
    ({ args: { organizationId, searchTerm }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      if (!searchTerm.trim()) {
        return zql.documents
          .where("organization_id", organizationId)
          .where("deleted_at", "IS", null)
          .orderBy("created_at", "desc")
          .limit(5);
      }

      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .where("title", "ILIKE", `%${searchTerm}%`)
        .orderBy("created_at", "desc")
        .limit(20);
    },
  ),

  // Preload recent documents for fast navigation - similar to zbugs pattern
  // Preloads ~100 most recently updated documents with full content/relationships
  recent: defineQuery(
    z.object({
      organizationId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, limit = 100 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .related("parent")
        .related("children", (q) => q.where("deleted_at", "IS", null).orderBy("created_at", "asc"))
        .related("organization")
        .orderBy("updated_at", "desc")
        .limit(limit);
    },
  ),

  // Get latest documents for workspace home page
  // Returns most recently updated documents with basic info
  latest: defineQuery(
    z.object({
      organizationId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, limit = 10 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("updated_at", "desc")
        .limit(limit);
    },
  ),

  // Get deleted documents (trash) for an organization
  // Returns documents with deleted_at set, ordered by deletion date
  trash: defineQuery(
    z.object({
      organizationId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, limit = 100 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS NOT", null)
        .related("parent")
        .related("children", (q) =>
          q.where("deleted_at", "IS NOT", null).orderBy("created_at", "asc"),
        )
        .orderBy("deleted_at", "desc")
        .limit(limit);
    },
  ),

  // Get favorited documents for an organization
  // Returns favorited documents ordered by updated_at
  favorites: defineQuery(
    z.object({
      organizationId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, limit = 10 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .where("is_favorited", true)
        .orderBy("updated_at", "desc")
        .limit(limit);
    },
  ),

  // Get backlinks for a document (documents that link TO this document)
  // Uses the document_links table for instant backlink queries
  backlinks: defineQuery(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
    }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.document_links
        .where("target_document_id", documentId)
        .related("sourceDocument", (q: any) =>
          q.where("organization_id", organizationId).where("deleted_at", "IS", null),
        );
    },
  ),

  // Get outgoing links for a document (documents this document links TO)
  outgoingLinks: defineQuery(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
    }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.document_links
        .where("source_document_id", documentId)
        .related("targetDocument", (q: any) =>
          q.where("organization_id", organizationId).where("deleted_at", "IS", null),
        );
    },
  ),
};
