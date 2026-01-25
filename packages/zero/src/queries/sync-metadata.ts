import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { hasOrganizationAccess } from "../auth";
import { zql } from "../schema";

export const syncMetadataQueries = {
  byDocument: defineQuery(
    z.object({ documentId: z.string(), organizationId: z.string() }),
    ({ args: { documentId, organizationId }, ctx }) => {
      hasOrganizationAccess(ctx, organizationId);
      return zql.sync_metadata
        .where("document_id", documentId)
        .related("connection", (q) => q.where("organization_id", organizationId))
        .orderBy("created_at", "desc");
    },
  ),
};
