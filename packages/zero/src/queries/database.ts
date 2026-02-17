import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

/**
 * Queries for pages that act as databases (have childSchema defined)
 *
 * Any page can optionally have a childSchema which defines properties
 * for its child documents. When present, the page shows a table view.
 */

export const databaseQueries = {
  // Get all pages that have a child schema (act as databases) in an organization
  byOrganization: defineQuery(
    z.object({ organizationId: z.string() }),
    ({ args: { organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("organization_id", organizationId)
        .where("child_schema", "IS NOT", null)
        .where("deleted_at", "IS", null)
        .orderBy("title", "asc");
    },
  ),

  // Get child documents of a page (the "records" of the database)
  // This is the core query for the table view
  childrenByParent: defineQuery(
    z.object({ organizationId: z.string(), parentId: z.string() }),
    ({ args: { organizationId, parentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("parent_id", parentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "desc");
    },
  ),

  // Get a specific page with its schema
  byId: defineQuery(
    z.object({ organizationId: z.string(), documentId: z.string() }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.documents
        .where("id", documentId)
        .where("organization_id", organizationId)
        .where("deleted_at", "IS", null)
        .one();
    },
  ),
};
