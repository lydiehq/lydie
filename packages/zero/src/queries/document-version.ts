import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const documentVersionQueries = {
  byDocumentId: defineQuery(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
      limit: z.number().optional(),
    }),
    ({ args: { organizationId, documentId, limit = 50 }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      return zql.document_versions
        .where("document_id", documentId)
        .related("user")
        .orderBy("version_number", "desc")
        .limit(limit);
    },
  ),

  byId: defineQuery(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
      versionId: z.string(),
    }),
    ({ args: { organizationId, documentId, versionId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      return zql.document_versions
        .where("id", versionId)
        .where("document_id", documentId)
        .related("user")
        .one();
    },
  ),

  latest: defineQuery(
    z.object({
      organizationId: z.string(),
      documentId: z.string(),
    }),
    ({ args: { organizationId, documentId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);

      return zql.document_versions
        .where("document_id", documentId)
        .orderBy("version_number", "desc")
        .limit(1);
    },
  ),
};
